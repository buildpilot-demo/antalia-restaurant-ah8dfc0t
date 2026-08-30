// Central place for the shared, multi-tenant Convex backend wiring. See
// convex/README.md for how this connects to BuildPilot's shared deployment.
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim();
export const siteId = import.meta.env.VITE_SITE_ID?.trim();

/** True only when both the shared deployment URL and this site's tenant id exist. */
export const isBackendConfigured = Boolean(convexUrl && siteId);

export type InquiryValues = {
  name: string;
  email: string;
  phone: string;
  enquiryType: string;
  message: string;
};

// Defined and deployed in the shared multi-tenant backend, not in this repo
// (see convex/README.md) — referenced by function path only.
const submitInquiry = makeFunctionReference<"mutation", InquiryValues & { siteId: string }, null>(
  "siteSubmissions:submitInquiry",
);

let client: ConvexHttpClient | null = null;

export async function submitInquiryToBackend(values: InquiryValues): Promise<void> {
  if (!convexUrl || !siteId) throw new Error("Convex backend is not configured.");
  client ??= new ConvexHttpClient(convexUrl);
  await client.mutation(submitInquiry, { siteId, ...values });
}
