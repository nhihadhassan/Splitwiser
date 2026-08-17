import { BlobPreconditionFailedError, del, get, head, put } from "@vercel/blob";
import type { MutationCommand, WorkspaceEnvelopeV3 } from "../../src/types.js";
import { applyFinancialMutation } from "../../src/domain.js";
import { authorizeMutation, sessionFor } from "./authorization.js";
import { clerkClient } from "./auth.js";
import { HttpError } from "./http.js";

const WORKSPACE_PATH = "private/workspace-v3.json";
const MAX_MUTATION_IDS = 2_000;
const MAX_RETRIES = 4;

type StoredWorkspace = { envelope: WorkspaceEnvelopeV3; etag: string };

export function blobToken(): string {
  // The dedicated name preserves compatibility with the isolated preview store.
  // Production Blob provisioning supplies Vercel's standard name automatically.
  const token = process.env.SPLITWISER_BLOB_READ_WRITE_TOKEN?.trim()
    ?? process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new HttpError(503, "Private financial storage is not configured.");
  return token;
}

const MAX_RECEIPT_BYTES = 1_000_000;
const MAX_WORKSPACE_RECEIPT_BYTES = 512_000_000;

async function validateReceiptMutation(
  envelope: WorkspaceEnvelopeV3,
  accountId: string,
  personId: string,
  command: MutationCommand,
): Promise<{ command: MutationCommand; receiptUsageBytes: number; removedReceiptPaths: string[] }> {
  const mutation = command.mutation;
  if (mutation.type === "deleteExpense") {
    const receipt = envelope.state.expenses.find((expense) => expense.id === mutation.expenseId)?.receipt;
    return { command, receiptUsageBytes: Math.max(0, envelope.receiptUsageBytes - (receipt?.sizeBytes ?? 0)), removedReceiptPaths: receipt ? [receipt.storagePath] : [] };
  }
  if (mutation.type === "deleteGroup") {
    const receipts = envelope.state.expenses.filter((expense) => expense.groupId === mutation.groupId).flatMap((expense) => expense.receipt ? [expense.receipt] : []);
    return { command, receiptUsageBytes: Math.max(0, envelope.receiptUsageBytes - receipts.reduce((sum, receipt) => sum + receipt.sizeBytes, 0)), removedReceiptPaths: receipts.map((receipt) => receipt.storagePath) };
  }
  if (mutation.type !== "addExpense" && mutation.type !== "updateExpense" && mutation.type !== "updateLinkedExpense") {
    return { command, receiptUsageBytes: envelope.receiptUsageBytes, removedReceiptPaths: [] };
  }
  const previous = envelope.state.expenses.find((expense) => expense.id === mutation.expense.id)?.receipt;
  const receipt = mutation.expense.receipt;
  if (!receipt) return { command, receiptUsageBytes: Math.max(0, envelope.receiptUsageBytes - (previous?.sizeBytes ?? 0)), removedReceiptPaths: previous ? [previous.storagePath] : [] };
  if (receipt.id === previous?.id) return { command, receiptUsageBytes: envelope.receiptUsageBytes, removedReceiptPaths: [] };
  const expectedPrefix = `private/receipts/${accountId}/`;
  if (!receipt.storagePath.startsWith(expectedPrefix) || receipt.createdBy !== personId || receipt.width > 1600 || receipt.height > 1600 || receipt.width < 1 || receipt.height < 1) {
    throw new HttpError(400, "Receipt attachment metadata is invalid.");
  }
  const metadata = await head(receipt.storagePath, { token: blobToken() });
  if (metadata.size > MAX_RECEIPT_BYTES || (metadata.contentType !== "image/jpeg" && metadata.contentType !== "image/webp")) {
    throw new HttpError(400, "Receipt must be a JPEG or WebP image no larger than 1 MB.");
  }
  const receiptUsageBytes = envelope.receiptUsageBytes - (previous?.sizeBytes ?? 0) + metadata.size;
  if (receiptUsageBytes > MAX_WORKSPACE_RECEIPT_BYTES) throw new HttpError(413, "Receipt storage has reached its workspace safety limit.");
  const normalizedReceipt = {
    ...receipt,
    mimeType: metadata.contentType as "image/jpeg" | "image/webp",
    sizeBytes: metadata.size,
    createdBy: personId,
  };
  return {
    command: { ...command, mutation: { ...mutation, expense: { ...mutation.expense, receipt: normalizedReceipt } } },
    receiptUsageBytes,
    removedReceiptPaths: previous ? [previous.storagePath] : [],
  };
}

function isWorkspaceEnvelope(value: unknown): value is WorkspaceEnvelopeV3 {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WorkspaceEnvelopeV3>;
  return item.version === 3
    && Number.isInteger(item.revision)
    && typeof item.ownerPersonId === "string"
    && Array.isArray(item.accountLinks)
    && Array.isArray(item.appliedMutationIds)
    && typeof item.receiptUsageBytes === "number"
    && Boolean(item.state && Array.isArray(item.state.people) && Array.isArray(item.state.groups) && Array.isArray(item.state.expenses) && Array.isArray(item.state.settlements));
}

export async function readWorkspace(): Promise<StoredWorkspace> {
  const result = await get(WORKSPACE_PATH, {
    access: "private",
    token: blobToken(),
    useCache: false,
  });
  if (!result || result.statusCode !== 200) throw new HttpError(503, "The private workspace has not been migrated yet.");
  const envelope = (await new Response(result.stream).json()) as unknown;
  if (!isWorkspaceEnvelope(envelope)) throw new HttpError(500, "The private workspace is invalid.");
  // Blob reads return a weak ETag (`W/"…"`), while `put({ ifMatch })`
  // requires the corresponding strong validator. The resource is read with
  // caching disabled above, so stripping the weak prefix preserves the exact
  // version precondition without allowing a blind overwrite.
  return { envelope, etag: result.blob.etag.replace(/^W\//, "") };
}

async function writeWorkspace(envelope: WorkspaceEnvelopeV3, etag: string): Promise<void> {
  await put(WORKSPACE_PATH, JSON.stringify(envelope), {
    access: "private",
    token: blobToken(),
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
    ifMatch: etag,
  });
}

async function invitedPersonId(accountId: string): Promise<string | null> {
  const user = await clerkClient().users.getUser(accountId);
  const value = user.publicMetadata.splitwiserPersonId;
  return typeof value === "string" && value.length <= 128 ? value : null;
}

export async function resolveWorkspaceSession(accountId: string): Promise<StoredWorkspace & { session: ReturnType<typeof sessionFor> }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const stored = await readWorkspace();
    try {
      return { ...stored, session: sessionFor(stored.envelope, accountId) };
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 403) throw error;
    }

    const ownerAccountId = process.env.SPLITWISER_OWNER_USER_ID?.trim();
    const personId = accountId === ownerAccountId
      ? stored.envelope.ownerPersonId
      : await invitedPersonId(accountId);
    if (!personId || !stored.envelope.state.people.some((person) => person.id === personId)) {
      throw new HttpError(403, "This account does not have an accepted invitation.");
    }
    if (stored.envelope.accountLinks.some((link) => link.personId === personId && link.status === "active")) {
      throw new HttpError(409, "This person has already been claimed by another account.");
    }
    const role = personId === stored.envelope.ownerPersonId ? "owner" as const : "member" as const;
    const envelope: WorkspaceEnvelopeV3 = {
      ...stored.envelope,
      revision: stored.envelope.revision + 1,
      updatedAt: new Date().toISOString(),
      accountLinks: [...stored.envelope.accountLinks, { accountId, personId, role, status: "active", linkedAt: Date.now() }],
      state: {
        ...stored.envelope.state,
        people: stored.envelope.state.people.map((person) => person.id === personId ? { ...person, claimed: true } : person),
      },
    };
    try {
      await writeWorkspace(envelope, stored.etag);
      return { envelope, etag: stored.etag, session: sessionFor(envelope, accountId) };
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
    }
  }
  throw new HttpError(409, "The workspace changed while linking this account. Please try again.");
}

export async function applyMutationCommand(accountId: string, command: MutationCommand): Promise<WorkspaceEnvelopeV3> {
  if (!command || typeof command.id !== "string" || command.id.length < 8 || command.id.length > 160 || !Number.isInteger(command.baseRevision) || !command.mutation) {
    throw new HttpError(400, "Mutation command is invalid.");
  }
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const stored = await resolveWorkspaceSession(accountId);
    if (stored.envelope.appliedMutationIds.includes(command.id)) return stored.envelope;
    if (command.baseRevision !== stored.envelope.revision) {
      throw new HttpError(409, "This item changed on another device. Refresh before trying again.");
    }
    authorizeMutation(stored.envelope, stored.session, command);
    const validated = await validateReceiptMutation(stored.envelope, accountId, stored.session.personId, command);
    let state: WorkspaceEnvelopeV3["state"];
    try {
      state = applyFinancialMutation(stored.envelope.state, validated.command.mutation, stored.session.personId);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Financial mutation is invalid.");
    }
    const envelope: WorkspaceEnvelopeV3 = {
      ...stored.envelope,
      revision: stored.envelope.revision + 1,
      updatedAt: new Date().toISOString(),
      appliedMutationIds: [...stored.envelope.appliedMutationIds, command.id].slice(-MAX_MUTATION_IDS),
      receiptUsageBytes: validated.receiptUsageBytes,
      state,
    };
    try {
      await writeWorkspace(envelope, stored.etag);
      if (validated.removedReceiptPaths.length) {
        void del(validated.removedReceiptPaths, { token: blobToken() }).catch(() => undefined);
      }
      return envelope;
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
    }
  }
  throw new HttpError(409, "The workspace is busy. Refresh and try again.");
}
