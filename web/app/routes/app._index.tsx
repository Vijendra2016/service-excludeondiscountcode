import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, useSubmit, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  DataTable,
  EmptyState,
  Modal,
  TextField,
  FormLayout,
  Banner,
  Badge,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

const FUNCTION_HANDLE = "excludediscountcodeforservice";

const GET_FUNCTION_ID = `#graphql
  query GetFunctionId {
    shopifyFunctions(first: 25) {
      nodes {
        id
        title
        apiType
        app { title }
      }
    }
  }
`;

const GET_DISCOUNTS = `#graphql
  query GetAppDiscounts {
    discountNodes(first: 20, query: "discount_type:app") {
      nodes {
        id
        discount {
          ... on DiscountCodeApp {
            title
            status
            usageLimit
            codesCount { count }
            codes(first: 5) {
              nodes { code }
            }
            appDiscountType {
              functionId
              title
            }
          }
        }
      }
    }
  }
`;

const CREATE_DISCOUNT = `#graphql
  mutation CreateDiscount($discount: DiscountCodeAppInput!) {
    discountCodeAppCreate(codeAppDiscount: $discount) {
      codeAppDiscount {
        discountId
        title
      }
      userErrors { field message }
    }
  }
`;

const ADD_CODE = `#graphql
  mutation AddCode($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
    discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
      bulkCreations { id }
      userErrors { field message }
    }
  }
`;

const DELETE_DISCOUNT = `#graphql
  mutation DeleteDiscount($id: ID!) {
    discountDelete(id: $id) {
      deletedDiscountId
      userErrors { field message }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const [functionsRes, discountsRes] = await Promise.all([
    admin.graphql(GET_FUNCTION_ID),
    admin.graphql(GET_DISCOUNTS),
  ]);

  const functionsData = await functionsRes.json();
  const discountsData = await discountsRes.json();

  const nodes = functionsData.data?.shopifyFunctions?.nodes ?? [];
  // Match by handle, title, or discount apiType
  const fn = nodes.find(
    (n: any) =>
      n.title?.toLowerCase().includes("exclude") ||
      n.apiType?.toLowerCase().includes("discount") ||
      n.app?.title?.toLowerCase().includes("serviceexclude")
  ) ?? nodes.find((n: any) => n.apiType?.toLowerCase().includes("discount"));

  const allDiscounts: any[] = discountsData.data?.discountNodes?.nodes ?? [];
  const appDiscounts = fn
    ? allDiscounts.filter(
        (node: any) => node.discount?.appDiscountType?.functionId === fn.id
      )
    : [];

  return json({
    functionId: fn?.id ?? null,
    functionTitle: fn?.title ?? null,
    discounts: appDiscounts,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "create") {
      const code = String(formData.get("code") ?? "").trim().toUpperCase();
      const title = String(formData.get("title") ?? "").trim();
      const functionId = String(formData.get("functionId") ?? "").trim();

      if (!code || !title || !functionId || functionId === "null") {
        return json({ error: `DEBUG: code="${code}" title="${title}" functionId="${functionId}"` });
      }

      // Step 1: create the discount
      const createRes = await admin.graphql(CREATE_DISCOUNT, {
        variables: {
          discount: {
            title,
            functionId,
            startsAt: new Date().toISOString(),
            discountClasses: ["ORDER"],
          },
        },
      });

      const createData = await createRes.json();
      const createErrors = createData?.data?.discountCodeAppCreate?.userErrors;
      if (createErrors?.length) {
        return json({ error: createErrors.map((e: any) => e.message).join(", ") });
      }
      const discountId = createData?.data?.discountCodeAppCreate?.codeAppDiscount?.discountId;
      if (!discountId) {
        return json({ error: `Failed to create discount: ${JSON.stringify(createData?.errors ?? createData)}` });
      }

      // Step 2: add the discount code
      const codeRes = await admin.graphql(ADD_CODE, {
        variables: { discountId, codes: [{ code }] },
      });
      const codeData = await codeRes.json();
      const codeErrors = codeData?.data?.discountRedeemCodeBulkAdd?.userErrors;
      if (codeErrors?.length) {
        return json({ error: codeErrors.map((e: any) => e.message).join(", ") });
      }

      return json({ success: true });
    }

    if (intent === "delete") {
      const id = String(formData.get("id") ?? "");
      if (id) await admin.graphql(DELETE_DISCOUNT, { variables: { id } });
      return json({ success: true });
    }

    return json({});
  } catch (err: any) {
    return json({ error: err?.message ?? "Unexpected error. Check Vercel logs." });
  }
};

export default function Index() {
  const { functionId, discounts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const submit = useSubmit();
  const [modalOpen, setModalOpen] = useState(false);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");

  const openModal = useCallback(() => {
    setCode("");
    setTitle("");
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

  const handleCreate = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "create");
    formData.set("functionId", functionId ?? "");
    formData.set("title", title);
    formData.set("code", code);
    submit(formData, { method: "post" });
    setModalOpen(false);
  }, [submit, functionId, title, code]);

  const rows = discounts.map((node: any) => {
    const d = node.discount;
    const codes = d?.codes?.nodes?.map((c: any) => c.code).join(", ") ?? "—";
    const status = d?.status ?? "—";
    const count = d?.codesCount?.count ?? 0;
    return [
      d?.title ?? "—",
      codes,
      <Badge tone={status === "ACTIVE" ? "success" : "info"}>{status}</Badge>,
      <Form method="post">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="id" value={node.id} />
        <Button submit tone="critical" size="slim">Delete</Button>
      </Form>,
    ];
  });

  return (
    <Page
      title="Service Exclude — Discount Manager"
      subtitle="Discount codes that exclude service-tagged products from order discounts"
      primaryAction={
        functionId
          ? { content: "Create Discount Code", onAction: openModal }
          : undefined
      }
    >
      <Layout>
        {!functionId && (
          <Layout.Section>
            <Banner tone="warning" title="Function not found">
              The excludediscountcodeforservice function was not found on this
              store. Make sure the app is deployed and installed correctly.
            </Banner>
          </Layout.Section>
        )}

        {(actionData as any)?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Error">
              {(actionData as any).error}
            </Banner>
          </Layout.Section>
        )}

        {(actionData as any)?.success && (
          <Layout.Section>
            <Banner tone="success" title="Done!">
              Discount created successfully.
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                How it works
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                When a customer applies one of these discount codes at checkout,
                the 10% order discount is applied to all products{" "}
                <strong>except</strong> items tagged <Badge>Service</Badge> in
                your store.
              </Text>
              <Divider />
              {discounts.length === 0 ? (
                <EmptyState
                  heading="No discount codes yet"
                  action={{ content: "Create your first code", onAction: openModal, disabled: !functionId }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Create a discount code and share it with your customers.</p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Title", "Code(s)", "Status", "Actions"]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Create Discount Code"
        primaryAction={{
          content: "Create",
          loading: isSubmitting,
          onAction: handleCreate,
        }}
        secondaryActions={[{ content: "Cancel", onAction: closeModal }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Discount title"
              value={title}
              onChange={setTitle}
              placeholder="e.g. 10% OFF (excludes services)"
              autoComplete="off"
            />
            <TextField
              label="Discount code"
              value={code}
              onChange={setCode}
              placeholder="e.g. SAVE10"
              autoComplete="off"
              helpText="Customers will enter this at checkout. Letters and numbers only."
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
