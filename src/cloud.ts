import type { AuthorizedSnapshot, MutationCommand } from "./types";

export type TokenProvider = () => Promise<string | null>;

export const COMPRESSED_MUTATION_CONTENT_TYPE = "application/vnd.splitwiser.mutation+gzip";
const COMPRESSION_THRESHOLD_BYTES = 200_000;

export class CloudSyncError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudSyncError";
    this.status = status;
  }
}

async function responseError(response: Response): Promise<CloudSyncError> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  const fallback = response.status === 413
    ? "This queued change is too large to save online. It remains safely stored on this device."
    : "Private sync is temporarily unavailable.";
  return new CloudSyncError(body?.error ?? fallback, response.status);
}

export async function mutationRequestBody(command: MutationCommand): Promise<{ body: BodyInit; contentType: string }> {
  const json = JSON.stringify(command);
  if (new TextEncoder().encode(json).byteLength < COMPRESSION_THRESHOLD_BYTES || typeof CompressionStream === "undefined") {
    return { body: json, contentType: "application/json" };
  }
  const compressed = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  return { body: await new Response(compressed).blob(), contentType: COMPRESSED_MUTATION_CONTENT_TYPE };
}

async function authorizedHeaders(getToken: TokenProvider): Promise<HeadersInit> {
  const token = await getToken();
  if (!token) throw new CloudSyncError("Sign in is required.", 401);
  return { Authorization: `Bearer ${token}` };
}

export async function loadAuthorizedState(getToken: TokenProvider, signal?: AbortSignal): Promise<AuthorizedSnapshot> {
  const response = await fetch("/api/state", {
    method: "GET",
    headers: await authorizedHeaders(getToken),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<AuthorizedSnapshot>;
}

export async function sendMutation(getToken: TokenProvider, command: MutationCommand): Promise<AuthorizedSnapshot> {
  const payload = await mutationRequestBody(command);
  const response = await fetch("/api/mutations", {
    method: "POST",
    headers: {
      ...(await authorizedHeaders(getToken)),
      "Content-Type": payload.contentType,
    },
    body: payload.body,
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<AuthorizedSnapshot>;
}
