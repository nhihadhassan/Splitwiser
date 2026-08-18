import { Redis } from "@upstash/redis";
import type { Reaction, SessionProfile, SocialItem, WorkspaceEnvelopeV3 } from "../../src/types.js";
import { HttpError } from "./http.js";

const ACCOUNT_MONTHLY_WRITE_LIMIT = 2_500;
const WORKSPACE_MONTHLY_WRITE_LIMIT = 200_000;
const ALLOWED_REACTIONS = new Set<Reaction["emoji"]>(["👍", "❤️", "😂", "👀", "✅"]);

function redisClient(): Redis {
  const url = process.env.SPLITWISER_UPSTASH_REDIS_REST_URL?.trim()
    ?? process.env.KV_REST_API_URL?.trim();
  const token = process.env.SPLITWISER_UPSTASH_REDIS_REST_TOKEN?.trim()
    ?? process.env.KV_REST_API_TOKEN?.trim();
  if (!url || !token) throw new HttpError(503, "Discussion is temporarily read-only.");
  return new Redis({ url, token, enableAutoPipelining: true });
}

function groupKey(groupId: string): string {
  return `social:group:${groupId}`;
}

function itemKey(itemId: string): string {
  return `social:item:${itemId}`;
}

export function requireGroupMember(envelope: WorkspaceEnvelopeV3, session: SessionProfile, groupId: string) {
  const group = envelope.state.groups.find((item) => item.id === groupId);
  if (!group || (session.role !== "owner" && !group.memberIds.includes(session.personId))) {
    throw new HttpError(403, "You are not a member of this group.");
  }
  return group;
}

export function canManageSocialItem(session: SessionProfile, item: SocialItem): boolean {
  return item.authorPersonId === session.personId || session.capabilities.moderateSocial;
}

export function withinSocialWriteAllowance(accountCount: number, workspaceCount: number): boolean {
  return accountCount <= ACCOUNT_MONTHLY_WRITE_LIMIT && workspaceCount <= WORKSPACE_MONTHLY_WRITE_LIMIT;
}

export function toggleReaction(
  reactions: Reaction[],
  personId: string,
  emoji: Reaction["emoji"],
): Reaction[] {
  const next = reactions.map((reaction) => ({ ...reaction, personIds: [...reaction.personIds] }));
  const target = next.find((reaction) => reaction.emoji === emoji);
  if (target?.personIds.includes(personId)) {
    target.personIds = target.personIds.filter((id) => id !== personId);
  } else if (target) {
    target.personIds.push(personId);
  } else {
    next.push({ emoji, personIds: [personId] });
  }
  return next.filter((reaction) => reaction.personIds.length > 0);
}

async function consumeWriteAllowance(redis: Redis, accountId: string): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  const accountKey = `social:limit:${month}:account:${accountId}`;
  const workspaceKey = `social:limit:${month}:workspace`;
  const [accountCount, workspaceCount] = await Promise.all([
    redis.incr(accountKey),
    redis.incr(workspaceKey),
  ]);
  if (accountCount === 1) void redis.expire(accountKey, 3_456_000);
  if (workspaceCount === 1) void redis.expire(workspaceKey, 3_456_000);
  if (!withinSocialWriteAllowance(accountCount, workspaceCount)) {
    throw new HttpError(429, "Discussion has reached its free monthly safety limit and is read-only.");
  }
}

export async function listSocial(
  envelope: WorkspaceEnvelopeV3,
  session: SessionProfile,
  groupId: string,
  after = 0,
): Promise<{ items: SocialItem[]; unread: number; readOnly: false }> {
  requireGroupMember(envelope, session, groupId);
  const redis = redisClient();
  const ids = await redis.zrange<string[]>(groupKey(groupId), after ? `(${after}` : "-inf", "+inf", { byScore: true });
  const boundedIds = ids.slice(-100);
  const values = await Promise.all(boundedIds.map((id) => redis.get<SocialItem>(itemKey(id))));
  const items = values.filter((item): item is SocialItem => Boolean(item));
  const readCursor = Number(await redis.get<number>(`social:read:${session.accountId}:${groupId}`) ?? 0);
  return { items, unread: items.filter((item) => item.createdAt > readCursor && item.authorPersonId !== session.personId).length, readOnly: false };
}

/** One authorized request for every group badge. The server derives the group
 * list from the workspace, so callers cannot probe unread state elsewhere. */
export async function unreadSocialSummary(
  envelope: WorkspaceEnvelopeV3,
  session: SessionProfile,
): Promise<{ unreadByGroup: Record<string, number>; totalUnread: number }> {
  const groupIds = envelope.state.groups
    .filter((group) => session.role === "owner" || group.memberIds.includes(session.personId))
    .map((group) => group.id);
  const redis = redisClient();
  const pairs = await Promise.all(groupIds.map(async (groupId) => {
    const ids = await redis.zrange<string[]>(groupKey(groupId), "-inf", "+inf", { byScore: true });
    const [values, cursor] = await Promise.all([
      Promise.all(ids.slice(-100).map((id) => redis.get<SocialItem>(itemKey(id)))),
      redis.get<number>(`social:read:${session.accountId}:${groupId}`),
    ]);
    const readCursor = Number(cursor ?? 0);
    const unread = values.filter((item): item is SocialItem => Boolean(item)).filter((item) => item.createdAt > readCursor && item.authorPersonId !== session.personId).length;
    return [groupId, unread] as const;
  }));
  const unreadByGroup = Object.fromEntries(pairs);
  return { unreadByGroup, totalUnread: Object.values(unreadByGroup).reduce((sum, count) => sum + count, 0) };
}

type CreateSocial = { groupId?: string; scope?: "group" | "expense"; scopeId?: string; body?: string };

export async function createSocial(
  envelope: WorkspaceEnvelopeV3,
  session: SessionProfile,
  input: CreateSocial,
): Promise<SocialItem> {
  const groupId = input.groupId?.trim();
  const body = input.body?.trim();
  if (!groupId || !body || body.length > 2_000) throw new HttpError(400, "Message must be between 1 and 2,000 characters.");
  const group = requireGroupMember(envelope, session, groupId);
  if (group.status === "closed") throw new HttpError(409, "This group is closed and read-only.");
  const scope = input.scope === "expense" ? "expense" : "group";
  const scopeId = scope === "expense" ? input.scopeId?.trim() : groupId;
  if (!scopeId || (scope === "expense" && !envelope.state.expenses.some((expense) => expense.id === scopeId && expense.groupId === groupId))) {
    throw new HttpError(404, "Expense was not found in this group.");
  }
  const redis = redisClient();
  await consumeWriteAllowance(redis, session.accountId);
  const item: SocialItem = {
    id: crypto.randomUUID(),
    groupId,
    scope,
    scopeId,
    authorPersonId: session.personId,
    body,
    createdAt: Date.now(),
    reactions: [],
  };
  await Promise.all([
    redis.set(itemKey(item.id), item),
    redis.zadd(groupKey(groupId), { score: item.createdAt, member: item.id }),
  ]);
  return item;
}

async function mutableItem(redis: Redis, envelope: WorkspaceEnvelopeV3, session: SessionProfile, itemId: string): Promise<SocialItem> {
  const item = await redis.get<SocialItem>(itemKey(itemId));
  if (!item) throw new HttpError(404, "Message was not found.");
  const group = requireGroupMember(envelope, session, item.groupId);
  if (group.status === "closed") throw new HttpError(409, "This group is closed and read-only.");
  return item;
}

export async function editSocial(
  envelope: WorkspaceEnvelopeV3,
  session: SessionProfile,
  itemId: string,
  body: string,
): Promise<SocialItem> {
  const cleanBody = body.trim();
  if (!cleanBody || cleanBody.length > 2_000) throw new HttpError(400, "Message must be between 1 and 2,000 characters.");
  const redis = redisClient();
  const item = await mutableItem(redis, envelope, session, itemId);
  if (!canManageSocialItem(session, item)) throw new HttpError(403, "You can only edit your own message.");
  await consumeWriteAllowance(redis, session.accountId);
  const next = { ...item, body: cleanBody, updatedAt: Date.now() };
  await redis.set(itemKey(item.id), next);
  return next;
}

export async function deleteSocial(
  envelope: WorkspaceEnvelopeV3,
  session: SessionProfile,
  itemId: string,
): Promise<SocialItem> {
  const redis = redisClient();
  const item = await mutableItem(redis, envelope, session, itemId);
  if (!canManageSocialItem(session, item)) throw new HttpError(403, "You can only delete your own message.");
  await consumeWriteAllowance(redis, session.accountId);
  const next = { ...item, body: "", deletedAt: Date.now(), updatedAt: Date.now(), reactions: [] };
  await redis.set(itemKey(item.id), next);
  return next;
}

export async function reactToSocial(
  envelope: WorkspaceEnvelopeV3,
  session: SessionProfile,
  itemId: string,
  emoji: Reaction["emoji"],
): Promise<SocialItem> {
  if (!ALLOWED_REACTIONS.has(emoji)) throw new HttpError(400, "Reaction is not supported.");
  const redis = redisClient();
  const item = await mutableItem(redis, envelope, session, itemId);
  if (item.deletedAt) throw new HttpError(409, "Deleted messages cannot be reacted to.");
  await consumeWriteAllowance(redis, session.accountId);
  const reactions = toggleReaction(item.reactions, session.personId, emoji);
  const next = { ...item, reactions, updatedAt: Date.now() };
  await redis.set(itemKey(item.id), next);
  return next;
}

export async function markSocialRead(
  envelope: WorkspaceEnvelopeV3,
  session: SessionProfile,
  groupId: string,
  cursor: number,
): Promise<void> {
  requireGroupMember(envelope, session, groupId);
  if (!Number.isFinite(cursor) || cursor < 0) throw new HttpError(400, "Read cursor is invalid.");
  const redis = redisClient();
  await redis.set(`social:read:${session.accountId}:${groupId}`, Math.floor(cursor));
}
