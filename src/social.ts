import type { Reaction, SocialItem } from "./types";
import type { TokenProvider } from "./cloud";

export interface SocialFeed {
  items: SocialItem[];
  unread: number;
  readOnly: boolean;
  message?: string;
}
export interface SocialUnreadSummary { unreadByGroup: Record<string, number>; totalUnread: number; }

async function headers(getToken: TokenProvider): Promise<HeadersInit> {
  const token = await getToken();
  if (!token) throw new Error("Sign in is required.");
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(getToken: TokenProvider, method: string, body?: unknown, query = ""): Promise<T> {
  const response = await fetch(`/api/social${query}`, {
    method,
    headers: { ...(await headers(getToken)), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(result?.error ?? "Discussion is temporarily read-only.");
  return result as T;
}

export function loadSocial(getToken: TokenProvider, groupId: string, after = 0): Promise<SocialFeed> {
  return request(getToken, "GET", undefined, `?groupId=${encodeURIComponent(groupId)}&after=${after}`);
}

export function loadSocialUnreadSummary(getToken: TokenProvider): Promise<SocialUnreadSummary> {
  return request(getToken, "GET", undefined, "?summary=1");
}

export function createSocial(getToken: TokenProvider, groupId: string, scope: "group" | "expense", scopeId: string, body: string): Promise<SocialItem> {
  return request(getToken, "POST", { action: "create", groupId, scope, scopeId, body });
}

export function reactSocial(getToken: TokenProvider, id: string, emoji: Reaction["emoji"]): Promise<SocialItem> {
  return request(getToken, "POST", { action: "react", id, emoji });
}

export function editSocial(getToken: TokenProvider, id: string, body: string): Promise<SocialItem> {
  return request(getToken, "PATCH", { id, body });
}

export function deleteSocial(getToken: TokenProvider, id: string): Promise<SocialItem> {
  return request(getToken, "DELETE", { id });
}

export function markSocialRead(getToken: TokenProvider, groupId: string, cursor: number): Promise<{ ok: true }> {
  return request(getToken, "POST", { action: "read", groupId, cursor });
}
