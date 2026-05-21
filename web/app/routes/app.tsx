import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError, Link } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { polarisTranslations };
};

export default function App() {
  const { polarisTranslations } = useLoaderData<typeof loader>();
  return (
    <AppProvider isEmbeddedApp i18n={polarisTranslations}>
      <NavMenu>
        <Link to="/app" rel="home">
          Discount Manager
        </Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
