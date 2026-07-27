import type { AppState } from "./types";

export const SYNC_KEY_STORAGE_KEY = "splitwiser-sync-key-v1";

type RemoteLedger = {
  version: 1;
  updatedAt: string;
  state: AppState;
};

type SaveResult = {
  updatedAt: string;
};

export class CloudSyncError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudSyncError";
    this.status = status;
  }
}

function authorization(syncKey: string): HeadersInit {
  return { Authorization: `Bearer ${syncKey}` };
}

async function responseError(response: Response): Promise<CloudSyncError> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return new CloudSyncError(
    body?.error ?? "Online saving is temporarily unavailable.",
    response.status,
  );
}

export function generateSyncKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function loadCloudState(
  syncKey: string,
  signal?: AbortSignal,
): Promise<RemoteLedger | null> {
  const response = await fetch("/api/state", {
    method: "GET",
    headers: authorization(syncKey),
    cache: "no-store",
    signal,
  });

  if (response.status === 404) return null;
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<RemoteLedger>;
}

export async function saveCloudState(
  syncKey: string,
  state: AppState,
): Promise<SaveResult> {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: {
      ...authorization(syncKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state }),
  });

  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<SaveResult>;
}
