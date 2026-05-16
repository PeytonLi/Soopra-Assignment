import { headers } from "next/headers";

import { QrAccess } from "@/components/QrAccess";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getAppUrl(headersList: Headers) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) return stripTrailingSlash(configuredUrl);

  const host = firstHeaderValue(headersList.get("x-forwarded-host")) ?? firstHeaderValue(headersList.get("host"));
  if (!host) return "http://localhost:3000";

  const protocol =
    firstHeaderValue(headersList.get("x-forwarded-proto")) ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${host}`;
}

export default async function QrPage() {
  return <QrAccess appUrl={getAppUrl(await headers())} />;
}
