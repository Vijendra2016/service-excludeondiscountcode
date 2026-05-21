import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    // Pass all params to /app where authentication is handled
    return redirect(`/app?${url.searchParams.toString()}`);
  }

  return login(request);
};

export default function Index() {
  return null;
}
