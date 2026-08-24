import { headers } from "next/headers";

// Server Components and Route Handlers read the correlation ID proxy.ts
// attached to the request, so every log line for a request can be joined by
// this one value (PRD §9.6).
export async function getCorrelationId(): Promise<string | undefined> {
  const headerList = await headers();
  return headerList.get("x-request-id") ?? undefined;
}
