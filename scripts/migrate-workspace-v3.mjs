import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { get, put } from "@vercel/blob";

const WORKSPACE_PATH = "private/workspace-v3.json";

function args(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    const value = argv[index + 1]?.startsWith("--") || argv[index + 1] == null ? true : argv[++index];
    result.set(key.slice(2), value);
  }
  return result;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function checksum(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function validateState(state) {
  for (const key of ["people", "groups", "expenses", "settlements"]) {
    if (!Array.isArray(state?.[key])) throw new Error(`Input is missing ${key}.`);
  }
  const people = new Set(state.people.map((person) => person.id));
  const groups = new Map(state.groups.map((group) => [group.id, group]));
  if (people.size !== state.people.length) throw new Error("Person IDs are not unique.");
  if (groups.size !== state.groups.length) throw new Error("Group IDs are not unique.");
  for (const expense of state.expenses) {
    if (!Number.isInteger(expense.amount) || expense.amount <= 0) throw new Error(`Expense ${expense.id} has an invalid cent amount.`);
    const owed = expense.splits.reduce((sum, split) => sum + split.owes, 0);
    const paid = expense.splits.reduce((sum, split) => sum + split.paid, 0);
    if (!expense.splits.every((split) => people.has(split.personId) && Number.isInteger(split.owes) && Number.isInteger(split.paid))) {
      throw new Error(`Expense ${expense.id} has an invalid participant or fractional cents.`);
    }
    if (owed !== expense.amount || paid !== expense.amount) throw new Error(`Expense ${expense.id} does not balance exactly.`);
    if (expense.groupId && !groups.get(expense.groupId)?.memberIds.every((id) => people.has(id))) throw new Error(`Expense ${expense.id} references an invalid group.`);
  }
  for (const settlement of state.settlements) {
    if (!Number.isInteger(settlement.amount) || settlement.amount <= 0 || !people.has(settlement.fromId) || !people.has(settlement.toId)) {
      throw new Error(`Settlement ${settlement.id} is invalid.`);
    }
  }
}

export function preservationManifest(state) {
  const workspace = state.reconciliation?.workspace;
  const groupTotals = Object.fromEntries(state.groups.map((group) => [
    group.id,
    state.expenses.filter((expense) => expense.groupId === group.id).reduce((sum, expense) => sum + expense.amount, 0),
  ]));
  return {
    schema: "splitwiser-preservation-v1",
    counts: {
      people: state.people.length,
      groups: state.groups.length,
      expenses: state.expenses.length,
      settlements: state.settlements.length,
      reconciliationMatches: workspace?.matchGroups?.length ?? 0,
      reconciliationExceptions: workspace?.exceptions?.length ?? 0,
      reconciliationAuditEvents: workspace?.auditEvents?.length ?? 0,
      financialActivityEvents: state.financialActivity?.length ?? 0,
    },
    totals: {
      expenseCents: state.expenses.reduce((sum, expense) => sum + expense.amount, 0),
      settlementCents: state.settlements.reduce((sum, settlement) => sum + settlement.amount, 0),
      groupExpenseCents: groupTotals,
      confirmedMatchLeftCents: workspace?.matchGroups?.filter((group) => group.status === "confirmed").reduce((sum, group) => sum + group.leftTotalCents, 0) ?? 0,
      confirmedMatchRightCents: workspace?.matchGroups?.filter((group) => group.status === "confirmed").reduce((sum, group) => sum + group.rightTotalCents, 0) ?? 0,
    },
    stateSha256: checksum(state),
  };
}

export function assertManifest(actual, expected) {
  if (JSON.stringify(stable(actual)) !== JSON.stringify(stable(expected))) {
    throw new Error("Preservation manifest mismatch. Migration stopped before publication.");
  }
}

async function main() {
  const options = args(process.argv.slice(2));
  const inputPath = options.get("input");
  const ownerPersonId = options.get("owner-person");
  const ownerAccountId = options.get("owner-account");
  if (typeof inputPath !== "string" || typeof ownerPersonId !== "string") {
    throw new Error("Usage: node scripts/migrate-workspace-v3.mjs --input <ledger.json> --owner-person <person-id> [--owner-account <Clerk user id>] [--expected-manifest <manifest.json>] [--write]");
  }
  const parsed = JSON.parse(await readFile(inputPath, "utf8"));
  const state = parsed.state ?? parsed;
  validateState(state);
  if (!state.people.some((person) => person.id === ownerPersonId)) throw new Error("Owner person does not exist in the ledger.");
  const manifest = preservationManifest(state);
  const expectedPath = options.get("expected-manifest");
  if (typeof expectedPath === "string") assertManifest(manifest, JSON.parse(await readFile(expectedPath, "utf8")));

  const now = new Date().toISOString();
  const envelope = {
    version: 3,
    revision: 0,
    updatedAt: now,
    ownerPersonId,
    accountLinks: typeof ownerAccountId === "string" ? [{ accountId: ownerAccountId, personId: ownerPersonId, role: "owner", status: "active", linkedAt: Date.now() }] : [],
    appliedMutationIds: [],
    receiptUsageBytes: state.expenses.reduce((sum, expense) => sum + (expense.receipt?.sizeBytes ?? 0), 0),
    state: {
      ...state,
      people: state.people.map((person) => ({ ...person, claimed: person.id === ownerPersonId && typeof ownerAccountId === "string" })),
    },
  };

  if (!options.has("write")) {
    console.log(JSON.stringify({ mode: "dry-run", manifest }, null, 2));
    return;
  }
  const token = process.env.SPLITWISER_BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("SPLITWISER_BLOB_READ_WRITE_TOKEN is required for --write.");
  await put(WORKSPACE_PATH, JSON.stringify(envelope), { access: "private", token, allowOverwrite: false, contentType: "application/json", cacheControlMaxAge: 60 });
  const stored = await get(WORKSPACE_PATH, { access: "private", token, useCache: false });
  if (!stored || stored.statusCode !== 200) throw new Error("Uploaded workspace could not be read back.");
  const verified = JSON.parse(await new Response(stored.stream).text());
  assertManifest(preservationManifest(verified.state), manifest);
  console.log(JSON.stringify({ mode: "written-and-verified", path: WORKSPACE_PATH, revision: verified.revision, manifest }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
