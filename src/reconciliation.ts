import type {
  Expense,
  ReconciliationAuditEvent,
  ReconciliationException,
  ReconciliationMatchGroup,
  ReconciliationQueue,
  ReconciliationSource,
  ReconciliationState,
  ReconciliationTransaction,
  ReconciliationTripId,
  ReconciliationWorkspace,
  StatementTransaction,
} from "./types";

export const RECONCILIATION_SCHEMA_VERSION = 2 as const;

const GROUP_BY_TRIP: Record<ReconciliationTripId, string> = {
  peru: "g-peru",
  "new-york": "g-new-york",
};

const LEGACY_CARD_KEY: Record<ReconciliationTripId, "peru" | "newYork"> = {
  peru: "peru",
  "new-york": "newYork",
};

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fingerprint(parts: Array<string | number>): string {
  return normalizeSearch(parts.join("|")).replace(/\s/g, "-");
}

function canonicalDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.trim() : parsed.toISOString().slice(0, 10);
}

function source(
  id: string,
  tripId: ReconciliationTripId,
  type: ReconciliationSource["type"],
  institution: string,
  account: string,
  currency = "CAD",
): ReconciliationSource {
  return {
    id,
    tripId,
    type,
    institution,
    account,
    currency,
    importedAt: new Date(0).toISOString(),
    fingerprint: fingerprint([tripId, institution, account]),
  };
}

function baseSources(): ReconciliationSource[] {
  return (["peru", "new-york"] as ReconciliationTripId[]).flatMap((tripId) => [
    source(`wanderlog-${tripId}`, tripId, "wanderlog", "Wanderlog", "Trip expense log"),
    source(`scotia-${tripId}`, tripId, "bank", "Scotiabank", "Passport Visa Infinite •••• 7283"),
    source(`export-${tripId}`, tripId, "import", "Expense Export", "Earlier card charges"),
    ...(tripId === "peru"
      ? [source("cash-peru", tripId, "cash", "Tangerine", "International ATM withdrawals")]
      : []),
  ]);
}

function transaction(
  input: Omit<ReconciliationTransaction, "merchant" | "normalizedText" | "duplicateFingerprint" | "raw">,
  raw: Record<string, string>,
): ReconciliationTransaction {
  const merchant = normalizeSearch(input.description);
  return {
    ...input,
    merchant,
    normalizedText: normalizeSearch([
      input.date,
      input.postedDate,
      input.description,
      input.reference,
      input.category,
      input.currency,
      input.postedCadCents / 100,
      input.notes ?? "",
      input.sourceId,
    ].join(" ")),
    duplicateFingerprint: fingerprint([
      input.sourceId,
      canonicalDate(input.postedDate),
      input.postedCadCents,
      input.reference,
      input.description,
    ]),
    raw,
  };
}

function leftTransaction(expense: Expense, tripId: ReconciliationTripId, status: ReconciliationQueue): ReconciliationTransaction {
  const original = expense.notes?.match(/(?:CA\$|CAD |PEN |USD )([\d,]+(?:\.\d+)?)/i);
  const currency = expense.notes?.includes("PEN ") ? "PEN" : expense.notes?.includes("USD ") ? "USD" : "CAD";
  const originalAmountCents = original
    ? Math.round(Number(original[1].replace(/,/g, "")) * 100)
    : expense.amount;
  return transaction({
    id: `wl:${tripId}:${expense.id}`,
    sourceId: `wanderlog-${tripId}`,
    tripId,
    side: "left",
    accountType: "wanderlog",
    date: expense.date,
    postedDate: expense.date,
    description: expense.description,
    reference: expense.id,
    category: expense.category,
    currency,
    originalAmountCents,
    postedCadCents: expense.amount,
    status,
    notes: expense.notes,
  }, {
    date: expense.date,
    description: expense.description,
    amount: String(expense.amount),
    notes: expense.notes ?? "",
  });
}

function rightTransaction(
  item: StatementTransaction,
  tripId: ReconciliationTripId,
  prefix: "scotia" | "export" | "cash",
  status: ReconciliationQueue,
): ReconciliationTransaction {
  const cents = Math.round(item.amount * 100);
  return transaction({
    id: `${prefix}:${tripId}:${item.id}`,
    sourceId: `${prefix}-${tripId}`,
    tripId,
    side: "right",
    accountType: prefix === "cash" ? "cash" : "card",
    date: item.date,
    postedDate: item.date,
    description: item.description,
    reference: item.detail,
    category: prefix === "cash" ? "cash" : "card",
    currency: "CAD",
    originalAmountCents: cents,
    postedCadCents: cents,
    status,
    notes: item.detail,
  }, {
    date: item.date,
    description: item.description,
    detail: item.detail,
    amount: String(item.amount),
  });
}

function legacyDecision(
  state: ReconciliationState,
  tripId: ReconciliationTripId,
  id: string,
  side: "left" | "right",
): ReconciliationQueue {
  const tripKey = tripId === "new-york" ? "new-york" : "peru";
  const decision = side === "left"
    ? state.decisions[`${tripKey}-${id}`]
    : state.decisions[`statement-${tripKey}-${id}`];
  return decision === "exclude" || decision === "personal" ? "excluded" : "unmatched";
}

function buildTransactions(state: ReconciliationState, expenses: Expense[]): ReconciliationTransaction[] {
  const result: ReconciliationTransaction[] = [];
  for (const tripId of ["peru", "new-york"] as ReconciliationTripId[]) {
    expenses
      .filter((expense) => expense.groupId === GROUP_BY_TRIP[tripId])
      .forEach((expense) => result.push(leftTransaction(expense, tripId, legacyDecision(state, tripId, expense.id, "left"))));
    const cardKey = LEGACY_CARD_KEY[tripId];
    state.cardTransactions[cardKey].forEach((item) => {
      result.push(rightTransaction(item, tripId, "scotia", legacyDecision(state, tripId, item.id, "right")));
    });
    state.exportTransactions[cardKey].forEach((item) => {
      result.push(rightTransaction(item, tripId, "export", legacyDecision(state, tripId, item.id, "right")));
    });
    if (tripId === "peru") {
      state.cashTransactions.forEach((item) => {
        result.push(rightTransaction(item, tripId, "cash", legacyDecision(state, tripId, item.id, "right")));
      });
    }
  }
  return result;
}

function legacyRightId(tripId: ReconciliationTripId, key: string): string {
  const [prefix, ...rest] = key.split(":");
  return `${prefix}:${tripId}:${rest.join(":")}`;
}

function migrateGroups(
  state: ReconciliationState,
  transactions: ReconciliationTransaction[],
): ReconciliationMatchGroup[] {
  const byId = new Map(transactions.map((item) => [item.id, item]));
  const groups: ReconciliationMatchGroup[] = [];
  Object.entries(state.matches).forEach(([legacyLeft, legacyRightIds]) => {
    if (legacyRightIds.length === 0) return;
    const tripId: ReconciliationTripId = legacyLeft.startsWith("new-york-") ? "new-york" : "peru";
    const expenseId = legacyLeft.replace(`${tripId}-`, "");
    const leftId = `wl:${tripId}:${expenseId}`;
    const rightIds = legacyRightIds.map((key) => legacyRightId(tripId, key)).filter((id) => byId.has(id));
    const left = byId.get(leftId);
    if (!left || rightIds.length === 0) return;
    const leftTotalCents = left.postedCadCents;
    const rightTotalCents = rightIds.reduce((sum, id) => sum + (byId.get(id)?.postedCadCents ?? 0), 0);
    const confirmed = leftTotalCents === rightTotalCents;
    groups.push({
      id: `migrated:${legacyLeft}`,
      tripId,
      leftIds: [leftId],
      rightIds,
      matchType: `1 ↔ ${rightIds.length}`,
      status: confirmed ? "confirmed" : "draft",
      leftTotalCents,
      rightTotalCents,
      differenceCents: leftTotalCents - rightTotalCents,
      explanation: ["Migrated from the earlier reconciliation workspace"],
      createdAt: new Date(0).toISOString(),
      confirmedAt: confirmed ? new Date(0).toISOString() : undefined,
    });
    if (confirmed) {
      left.status = "reconciled";
      rightIds.forEach((id) => {
        const right = byId.get(id);
        if (right) right.status = "reconciled";
      });
    }
  });
  return groups;
}

export function createReconciliationWorkspace(
  state: ReconciliationState,
  expenses: Expense[],
): ReconciliationWorkspace {
  const transactions = buildTransactions(state, expenses);
  const matchGroups = migrateGroups(state, transactions);
  return {
    schemaVersion: RECONCILIATION_SCHEMA_VERSION,
    sources: baseSources(),
    transactions,
    matchGroups,
    rules: [
      {
        id: "default-exact",
        name: "Exact amount within 7 days",
        priority: 10,
        sourceIds: [],
        dateToleranceDays: 7,
        amountToleranceCents: 1,
        enabled: true,
      },
    ],
    exceptions: [],
    auditEvents: [{
      id: "audit-migration-v2",
      tripId: "peru",
      action: "migrate",
      timestamp: new Date(0).toISOString(),
      summary: "Migrated legacy reconciliation data to schema version 2",
      transactionIds: [],
    }],
    periods: [
      { tripId: "peru", status: "open" },
      { tripId: "new-york", status: "open" },
    ],
    savedViews: [],
    importMappings: [
      { id: "scotiabank", name: "Scotiabank", sourceType: "bank", columns: { date: "date", description: "description", amount: "amount" } },
      { id: "tangerine", name: "Tangerine", sourceType: "bank", columns: { date: "date", description: "description", amount: "amount" } },
      { id: "wanderlog", name: "Wanderlog", sourceType: "wanderlog", columns: { date: "date", description: "description", amount: "amount" } },
      { id: "generic", name: "Generic CSV", sourceType: "bank", columns: { date: "date", description: "description", amount: "amount" } },
    ],
  };
}

export function ensureReconciliationWorkspace(
  state: ReconciliationState,
  expenses: Expense[],
): ReconciliationWorkspace {
  if (state.workspace?.schemaVersion === RECONCILIATION_SCHEMA_VERSION) {
    const rebuilt = createReconciliationWorkspace(state, expenses);
    const rebuiltById = new Map(rebuilt.transactions.map((item) => [item.id, item]));
    const existingIds = new Set(state.workspace.transactions.map((item) => item.id));
    const missingTransactions = rebuilt.transactions.filter((item) => !existingIds.has(item.id));
    const repairedTransactions = state.workspace.transactions.map((item) => {
      if (Number.isFinite(item.originalAmountCents)) return item;
      const source = rebuiltById.get(item.id);
      return source ? { ...item, originalAmountCents: source.originalAmountCents } : item;
    });
    return {
      ...state.workspace,
      transactions: [...repairedTransactions, ...missingTransactions],
    };
  }
  return createReconciliationWorkspace(state, expenses);
}

export function reconciliationTotals(workspace: ReconciliationWorkspace, tripId: ReconciliationTripId) {
  const transactions = workspace.transactions.filter((item) => item.tripId === tripId);
  const active = transactions.filter((item) => item.status !== "excluded");
  const left = active.filter((item) => item.side === "left").reduce((sum, item) => sum + item.postedCadCents, 0);
  const right = active.filter((item) => item.side === "right" && item.accountType !== "cash").reduce((sum, item) => sum + item.postedCadCents, 0);
  const confirmed = workspace.matchGroups.filter((group) => group.tripId === tripId && group.status === "confirmed");
  const matchedIds = new Set(confirmed.flatMap((group) => [...group.leftIds, ...group.rightIds]));
  const matchedValue = transactions.filter((item) => item.side === "left" && matchedIds.has(item.id)).reduce((sum, item) => sum + item.postedCadCents, 0);
  const leftCount = active.filter((item) => item.side === "left").length;
  const matchedCount = active.filter((item) => item.side === "left" && matchedIds.has(item.id)).length;
  return {
    left,
    right,
    difference: left - right,
    leftCount,
    matchedCount,
    matchRateCount: leftCount ? matchedCount / leftCount : 0,
    matchRateValue: left ? matchedValue / left : 0,
    excluded: transactions.filter((item) => item.status === "excluded").reduce((sum, item) => sum + item.postedCadCents, 0),
    exceptions: workspace.exceptions.filter((item) => item.tripId === tripId && !item.resolved).length,
  };
}

function parseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/[,$£€CA\s]/gi, "").replace(/^\((.*)\)$/, "-$1");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(Math.abs(amount) * 100) : null;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

export interface ImportPreviewRow {
  row: number;
  date: string;
  description: string;
  amountCents: number;
  reference: string;
  valid: boolean;
  duplicate: boolean;
  error?: string;
}

export function previewDelimitedImport(
  text: string,
  existing: ReconciliationTransaction[],
  sourceId: string,
): ImportPreviewRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitDelimitedLine(lines[0], delimiter).map(normalizeSearch);
  const column = (names: string[]) => headers.findIndex((header) => names.some((name) => header.includes(name)));
  const dateIndex = column(["date"]);
  const descriptionIndex = column(["description", "merchant", "details", "transaction"]);
  const amountIndex = column(["amount", "debit", "charge"]);
  const referenceIndex = column(["reference", "confirmation", "ref"]);
  const fingerprints = new Set(existing.map((item) => item.duplicateFingerprint));
  return lines.slice(1).map((line, index) => {
    const values = splitDelimitedLine(line, delimiter);
    const date = dateIndex >= 0 ? parseDate(values[dateIndex] ?? "") : null;
    const description = descriptionIndex >= 0 ? values[descriptionIndex]?.trim() : "";
    const amountCents = amountIndex >= 0 ? parseAmount(values[amountIndex] ?? "") : null;
    const reference = referenceIndex >= 0 ? values[referenceIndex]?.trim() ?? "" : "";
    const valid = Boolean(date && description && amountCents !== null);
    const duplicateFingerprint = valid
      ? fingerprint([sourceId, canonicalDate(date!), amountCents!, reference, description])
      : "";
    return {
      row: index + 2,
      date: date ?? "",
      description: description ?? "",
      amountCents: amountCents ?? 0,
      reference,
      valid,
      duplicate: valid && fingerprints.has(duplicateFingerprint),
      error: valid ? undefined : "Date, description, or amount could not be parsed",
    };
  });
}

export function importedTransaction(
  row: ImportPreviewRow,
  tripId: ReconciliationTripId,
  sourceId: string,
  id: string,
): ReconciliationTransaction {
  return transaction({
    id,
    sourceId,
    tripId,
    side: sourceId.startsWith("wanderlog") ? "left" : "right",
    accountType: sourceId.startsWith("wanderlog") ? "wanderlog" : "card",
    date: row.date,
    postedDate: row.date,
    description: row.description,
    reference: row.reference,
    category: "imported",
    currency: "CAD",
    originalAmountCents: row.amountCents,
    postedCadCents: row.amountCents,
    status: "unmatched",
  }, {
    date: row.date,
    description: row.description,
    amount: String(row.amountCents),
    reference: row.reference,
  });
}

function dateDistance(left: string, right: string): number {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 999;
  return Math.round(Math.abs(leftTime - rightTime) / 86_400_000);
}

function merchantScore(left: string, right: string): number {
  const a = new Set(normalizeSearch(left).split(" ").filter((word) => word.length > 2));
  const b = new Set(normalizeSearch(right).split(" ").filter((word) => word.length > 2));
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((word) => b.has(word)).length;
  return overlap / Math.max(a.size, b.size);
}

export function generateSuggestions(
  workspace: ReconciliationWorkspace,
  tripId: ReconciliationTripId,
): ReconciliationMatchGroup[] {
  const unavailable = new Set(
    workspace.matchGroups
      .filter((group) => group.status === "confirmed")
      .flatMap((group) => [...group.leftIds, ...group.rightIds]),
  );
  const left = workspace.transactions.filter((item) => item.tripId === tripId && item.side === "left" && item.status === "unmatched" && !unavailable.has(item.id));
  const right = workspace.transactions.filter((item) => item.tripId === tripId && item.side === "right" && item.accountType === "card" && item.status === "unmatched" && !unavailable.has(item.id));
  const candidates: ReconciliationMatchGroup[] = [];
  left.forEach((leftItem) => {
    const exact = right
      .map((rightItem) => ({
        rightItem,
        dateDays: dateDistance(leftItem.postedDate, rightItem.postedDate),
        merchant: merchantScore(leftItem.description, rightItem.description),
      }))
      .filter(({ rightItem, dateDays }) => Math.abs(leftItem.postedCadCents - rightItem.postedCadCents) <= 1 && dateDays <= 7)
      .sort((a, b) => b.merchant - a.merchant || a.dateDays - b.dateDays || a.rightItem.id.localeCompare(b.rightItem.id));
    if (exact.length === 0) return;
    const best = exact[0];
    const ambiguous = exact.length > 1 && exact[1].merchant === best.merchant && exact[1].dateDays === best.dateDays;
    const confidence = best.merchant >= 0.5 && best.dateDays <= 3 ? "high" : best.dateDays <= 7 ? "medium" : "low";
    candidates.push({
      id: `suggestion:${leftItem.id}:${best.rightItem.id}`,
      tripId,
      leftIds: [leftItem.id],
      rightIds: [best.rightItem.id],
      matchType: "1 ↔ 1",
      status: ambiguous ? "ambiguous" : "suggested",
      leftTotalCents: leftItem.postedCadCents,
      rightTotalCents: best.rightItem.postedCadCents,
      differenceCents: leftItem.postedCadCents - best.rightItem.postedCadCents,
      confidence,
      explanation: [
        "Exact CAD amount",
        `${best.dateDays} day${best.dateDays === 1 ? "" : "s"} apart`,
        best.merchant > 0 ? "Merchant text overlaps" : "Merchant differs",
      ],
      createdAt: new Date().toISOString(),
    });
  });
  return candidates;
}

export function cashControl(workspace: ReconciliationWorkspace, endingCashCents: number) {
  const cash = workspace.transactions.filter((item) => item.tripId === "peru" && item.accountType === "cash" && item.status !== "excluded");
  const opening = cash.filter((item) => item.id.includes("cash-prior")).reduce((sum, item) => sum + item.postedCadCents, 0);
  const withdrawals = cash.filter((item) => !item.id.includes("cash-prior")).reduce((sum, item) => sum + item.postedCadCents, 0);
  const impliedSpent = opening + withdrawals - endingCashCents;
  return { opening, withdrawals, ending: endingCashCents, impliedSpent };
}

export function auditEvent(
  tripId: ReconciliationTripId,
  action: ReconciliationAuditEvent["action"],
  summary: string,
  transactionIds: string[],
): ReconciliationAuditEvent {
  return {
    id: `audit:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    tripId,
    action,
    timestamp: new Date().toISOString(),
    summary,
    transactionIds,
  };
}

export function exceptionTotal(exceptions: ReconciliationException[], tripId: ReconciliationTripId): number {
  return exceptions.filter((item) => item.tripId === tripId && !item.resolved).reduce((sum, item) => sum + item.amountCents, 0);
}
