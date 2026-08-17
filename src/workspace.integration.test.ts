import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedState } from "./seed";
import type { WorkspaceEnvelopeV3 } from "./types";

const memory = vi.hoisted(() => ({
  envelope: null as WorkspaceEnvelopeV3 | null,
  etag: "etag-1",
  failNextWrite: false,
  personClaim: null as string | null,
  puts: 0,
  lastIfMatch: undefined as string | undefined,
  receiptHead: { size: 900_000, contentType: "image/webp" },
}));

vi.mock("@vercel/blob", () => {
  class BlobPreconditionFailedError extends Error {}
  return {
    BlobPreconditionFailedError,
    get: vi.fn(async () => ({
      statusCode: 200,
      stream: new Blob([JSON.stringify(memory.envelope)]).stream(),
      blob: { etag: memory.etag },
    })),
    put: vi.fn(async (_path: string, body: string, options: { ifMatch?: string }) => {
      memory.puts += 1;
      memory.lastIfMatch = options.ifMatch;
      if (memory.failNextWrite) {
        memory.failNextWrite = false;
        throw new BlobPreconditionFailedError("race");
      }
      if (options.ifMatch !== memory.etag.replace(/^W\//, "")) throw new BlobPreconditionFailedError("stale");
      memory.envelope = JSON.parse(body) as WorkspaceEnvelopeV3;
      memory.etag = `etag-${memory.puts + 1}`;
      return { etag: memory.etag };
    }),
    head: vi.fn(async () => memory.receiptHead),
    del: vi.fn(async () => undefined),
  };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    users: { getUser: vi.fn(async () => ({ publicMetadata: { splitwiserPersonId: memory.personClaim } })) },
    invitations: { createInvitation: vi.fn() },
  })),
}));

import { HttpError } from "../api/_lib/http.js";
import { applyMutationCommand, resolveWorkspaceSession } from "../api/_lib/workspace.js";

function envelope(): WorkspaceEnvelopeV3 {
  return {
    version: 3,
    revision: 0,
    updatedAt: "2027-01-01T00:00:00.000Z",
    ownerPersonId: "me",
    accountLinks: [],
    appliedMutationIds: [],
    receiptUsageBytes: 0,
    state: seedState(),
  };
}

beforeEach(() => {
  memory.envelope = envelope();
  memory.etag = "etag-1";
  memory.failNextWrite = false;
  memory.personClaim = null;
  memory.puts = 0;
  memory.lastIfMatch = undefined;
  memory.receiptHead = { size: 900_000, contentType: "image/webp" };
  process.env.SPLITWISER_BLOB_READ_WRITE_TOKEN = "synthetic-test-token";
  process.env.SPLITWISER_OWNER_USER_ID = "account-owner";
  process.env.CLERK_SECRET_KEY = "synthetic-clerk-secret";
  process.env.VITE_CLERK_PUBLISHABLE_KEY = "synthetic-clerk-publishable";
});

describe("Clerk and Blob workspace integration", () => {
  it("binds the first configured owner to the preserved owner person", async () => {
    const result = await resolveWorkspaceSession("account-owner");
    expect(result.session).toMatchObject({ personId: "me", role: "owner" });
    expect(memory.envelope?.accountLinks).toHaveLength(1);
    expect(memory.envelope?.state.people.find((person) => person.id === "me")?.claimed).toBe(true);
  });

  it("normalizes a weak Blob read ETag before a conditional workspace write", async () => {
    memory.etag = 'W/"etag-weak"';
    await resolveWorkspaceSession("account-owner");
    expect(memory.lastIfMatch).toBe('"etag-weak"');
  });

  it("prevents a second account from claiming the same person", async () => {
    memory.envelope!.accountLinks.push({ accountId: "account-sam", personId: "person-sam", role: "member", status: "active", linkedAt: 1 });
    memory.personClaim = "person-sam";
    await expect(resolveWorkspaceSession("account-other")).rejects.toMatchObject({ status: 409 } satisfies Partial<HttpError>);
  });

  it("retries one ETag race and applies a mutation once", async () => {
    memory.envelope!.accountLinks.push({ accountId: "account-owner", personId: "me", role: "owner", status: "active", linkedAt: 1 });
    memory.failNextWrite = true;
    const result = await applyMutationCommand("account-owner", {
      id: "mutation-settlement-1",
      baseRevision: 0,
      createdAt: 1_804_000_000_000,
      mutation: { type: "addSettlement", settlement: { id: "settlement-new", fromId: "person-sam", toId: "me", amount: 2_500, date: "2027-03-01", groupId: "group-coast", createdAt: 1_804_000_000_000, createdBy: "person-sam" } },
    });
    expect(result.revision).toBe(1);
    expect(result.state.settlements.filter((item) => item.id === "settlement-new")).toHaveLength(1);
    expect(memory.puts).toBe(2);
  });

  it("returns an idempotent mutation replay without duplicating data", async () => {
    memory.envelope!.accountLinks.push({ accountId: "account-owner", personId: "me", role: "owner", status: "active", linkedAt: 1 });
    const command = {
      id: "mutation-settlement-2",
      baseRevision: 0,
      createdAt: 1_804_000_000_000,
      mutation: { type: "addSettlement" as const, settlement: { id: "settlement-replay", fromId: "person-sam", toId: "me", amount: 2_500, date: "2027-03-01", groupId: "group-coast", createdAt: 1_804_000_000_000, createdBy: "person-sam" } },
    };
    const first = await applyMutationCommand("account-owner", command);
    const second = await applyMutationCommand("account-owner", command);
    expect(second.revision).toBe(first.revision);
    expect(second.state.settlements.filter((item) => item.id === "settlement-replay")).toHaveLength(1);
  });

  it("rejects a same-entity command based on an old revision", async () => {
    memory.envelope!.accountLinks.push({ accountId: "account-owner", personId: "me", role: "owner", status: "active", linkedAt: 1 });
    memory.envelope!.revision = 4;
    await expect(applyMutationCommand("account-owner", {
      id: "mutation-stale-command",
      baseRevision: 3,
      createdAt: 1_804_000_000_000,
      mutation: { type: "deleteExpense", expenseId: "expense-coast-lodge" },
    })).rejects.toMatchObject({ status: 409 } satisfies Partial<HttpError>);
  });

  it("validates private receipt metadata and tracks storage usage", async () => {
    memory.envelope!.accountLinks.push({ accountId: "account-owner", personId: "me", role: "owner", status: "active", linkedAt: 1 });
    const original = memory.envelope!.state.expenses.find((expense) => expense.id === "expense-coast-lodge")!;
    const result = await applyMutationCommand("account-owner", {
      id: "mutation-receipt-valid",
      baseRevision: 0,
      createdAt: 1_804_000_000_000,
      mutation: { type: "updateExpense", expense: { ...original, receipt: { id: "receipt-valid", storagePath: "private/receipts/account-owner/receipt-valid", fileName: "receipt.webp", mimeType: "image/webp", sizeBytes: 1, width: 1200, height: 900, createdAt: 1_804_000_000_000, createdBy: "me" } } },
    });
    expect(result.receiptUsageBytes).toBe(900_000);
    expect(result.state.expenses.find((expense) => expense.id === original.id)?.receipt?.sizeBytes).toBe(900_000);
  });

  it("rejects an attachment larger than one megabyte", async () => {
    memory.envelope!.accountLinks.push({ accountId: "account-owner", personId: "me", role: "owner", status: "active", linkedAt: 1 });
    memory.receiptHead = { size: 1_000_001, contentType: "image/webp" };
    const original = memory.envelope!.state.expenses.find((expense) => expense.id === "expense-coast-lodge")!;
    await expect(applyMutationCommand("account-owner", {
      id: "mutation-receipt-large",
      baseRevision: 0,
      createdAt: 1_804_000_000_000,
      mutation: { type: "updateExpense", expense: { ...original, receipt: { id: "receipt-large", storagePath: "private/receipts/account-owner/receipt-large", fileName: "receipt.webp", mimeType: "image/webp", sizeBytes: 1, width: 1200, height: 900, createdAt: 1_804_000_000_000, createdBy: "me" } } },
    })).rejects.toMatchObject({ status: 400 } satisfies Partial<HttpError>);
  });
});
