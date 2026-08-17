import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedState } from "./seed";
import type { SessionProfile, SocialItem, WorkspaceEnvelopeV3 } from "./types";

const redisMemory = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  sorted: new Map<string, Array<{ score: number; member: string }>>(),
  counters: new Map<string, number>(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    async incr(key: string) {
      const next = (redisMemory.counters.get(key) ?? 0) + 1;
      redisMemory.counters.set(key, next);
      return next;
    }
    async expire() { return 1; }
    async set(key: string, value: unknown) { redisMemory.values.set(key, structuredClone(value)); return "OK"; }
    async get(key: string) { return structuredClone(redisMemory.values.get(key) ?? null); }
    async zadd(key: string, entry: { score: number; member: string }) {
      redisMemory.sorted.set(key, [...(redisMemory.sorted.get(key) ?? []), entry]);
      return 1;
    }
    async zrange(key: string) { return (redisMemory.sorted.get(key) ?? []).sort((a, b) => a.score - b.score).map((entry) => entry.member); }
  },
}));

import { HttpError } from "../api/_lib/http.js";
import { createSocial, deleteSocial, editSocial, listSocial, markSocialRead, reactToSocial } from "../api/_lib/social.js";

const capabilities = { manageInvites: false, manageAllGroups: false, reconcile: false, moderateSocial: false };
const sam: SessionProfile = { accountId: "account-sam", personId: "person-sam", role: "member", displayName: "Sam", capabilities };
const jules: SessionProfile = { accountId: "account-jules", personId: "person-jules", role: "member", displayName: "Jules", capabilities };
const owner: SessionProfile = { accountId: "account-owner", personId: "me", role: "owner", displayName: "Alex", capabilities: { manageInvites: true, manageAllGroups: true, reconcile: true, moderateSocial: true } };

function envelope(): WorkspaceEnvelopeV3 {
  return { version: 3, revision: 1, updatedAt: "2027-01-01T00:00:00Z", ownerPersonId: "me", accountLinks: [], appliedMutationIds: [], receiptUsageBytes: 0, state: seedState() };
}

beforeEach(() => {
  redisMemory.values.clear();
  redisMemory.sorted.clear();
  redisMemory.counters.clear();
  process.env.SPLITWISER_UPSTASH_REDIS_REST_URL = "https://synthetic-redis.example.test";
  process.env.SPLITWISER_UPSTASH_REDIS_REST_TOKEN = "synthetic-test-token";
});

describe("Redis social integration", () => {
  it("creates, reads, reacts to, and marks a group message read", async () => {
    const state = envelope();
    const item = await createSocial(state, sam, { groupId: "group-coast", scope: "group", scopeId: "group-coast", body: "Train leaves at nine" });
    await reactToSocial(state, jules, item.id, "👍");
    const unread = await listSocial(state, jules, "group-coast");
    expect(unread.items).toHaveLength(1);
    expect(unread.unread).toBe(1);
    expect(unread.items[0].reactions).toEqual([{ emoji: "👍", personIds: ["person-jules"] }]);
    await markSocialRead(state, jules, "group-coast", Date.now());
    expect((await listSocial(state, jules, "group-coast")).unread).toBe(0);
  });

  it("allows authors to edit and denies edits by another member", async () => {
    const state = envelope();
    const item = await createSocial(state, sam, { groupId: "group-coast", scope: "group", scopeId: "group-coast", body: "Original" });
    await expect(editSocial(state, jules, item.id, "Changed")).rejects.toMatchObject({ status: 403 } satisfies Partial<HttpError>);
    expect((await editSocial(state, sam, item.id, "Corrected")).body).toBe("Corrected");
  });

  it("lets the owner moderate with a tombstone", async () => {
    const state = envelope();
    const item = await createSocial(state, sam, { groupId: "group-coast", scope: "expense", scopeId: "expense-coast-lodge", body: "Please check this" });
    const deleted = await deleteSocial(state, owner, item.id);
    expect(deleted).toMatchObject({ body: "", reactions: [] } satisfies Partial<SocialItem>);
    expect(deleted.deletedAt).toBeTypeOf("number");
  });

  it("keeps closed groups read-only for all social mutations", async () => {
    await expect(createSocial(envelope(), owner, { groupId: "group-city", scope: "group", scopeId: "group-city", body: "Closed" })).rejects.toMatchObject({ status: 409 } satisfies Partial<HttpError>);
  });
});
