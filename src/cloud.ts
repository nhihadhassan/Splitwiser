import type { AuthorizedSnapshot, MutationCommand } from "./types";

export type TokenProvider = () => Promise<string | null>;

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
  return new CloudSyncError(body?.error ?? "Private sync is temporarily unavailable.", response.status);
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
  const response = await fetch("/api/mutations", {
    method: "POST",
    headers: {
      ...(await authorizedHeaders(getToken)),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<AuthorizedSnapshot>;
}
