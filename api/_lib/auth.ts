import { createClerkClient } from "@clerk/backend";
import { HttpError } from "./http.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, "Private account access is not configured.");
  return value;
}

function requiredClerkPublishableKey(): string {
  const value = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
    ?? process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  if (!value) throw new HttpError(503, "Private account access is not configured.");
  return value;
}

function authorizedParties(request: Request): string[] {
  const requestOrigin = new URL(request.url).origin;
  const configured = process.env.SPLITWISER_CLERK_AUTHORIZED_PARTIES
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (process.env.VERCEL_ENV !== "production") {
    // Every deployment-protected Vercel preview receives a unique hostname.
    // Accept only its actual request origin in addition to a configured test origin.
    return [...new Set([...(configured ?? []), requestOrigin])];
  }
  if (configured?.length) return configured;
  if (process.env.VERCEL_ENV === "production") {
    return ["https://splitwiser-xi.vercel.app"];
  }
  return [requestOrigin];
}

export async function requireAccountId(request: Request): Promise<string> {
  const secretKey = requiredEnvironment("CLERK_SECRET_KEY");
  const publishableKey = requiredClerkPublishableKey();
  const clerk = createClerkClient({ secretKey, publishableKey });
  const requestState = await clerk.authenticateRequest(request, {
    acceptsToken: "session_token",
    authorizedParties: authorizedParties(request),
  });
  if (!requestState.isAuthenticated) throw new HttpError(401, "Sign in is required.");
  const auth = requestState.toAuth();
  if (!auth.userId) throw new HttpError(401, "Sign in is required.");
  return auth.userId;
}

export function clerkClient() {
  return createClerkClient({
    secretKey: requiredEnvironment("CLERK_SECRET_KEY"),
    publishableKey: requiredClerkPublishableKey(),
  });
}
