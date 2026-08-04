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
import { splitByWeights, splitEqually } from "./utils/money";

export const RECONCILIATION_SCHEMA_VERSION = 2 as const;
export const SUGGESTION_ROUNDING_INCREMENT_CENTS = 50;
const RECONCILIATION_TRIPS: ReconciliationTripId[] = ["portugal", "peru", "new-york"];

const GROUP_BY_TRIP: Record<ReconciliationTripId, string> = {
  portugal: "g-portugal",
  peru: "g-peru",
  "new-york": "g-new-york",
};

const LEGACY_CARD_KEY: Record<ReconciliationTripId, "portugal" | "peru" | "newYork"> = {
  portugal: "portugal",
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

function reconciliationDateTimestamp(value: string): number {
  const trimmed = value.trim();
  if (normalizeSearch(trimmed).startsWith("before")) return Number.NaN;
  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

const reconciliationDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatReconciliationDate(value: string): string {
  const timestamp = reconciliationDateTimestamp(value);
  return Number.isNaN(timestamp) ? value : reconciliationDateFormatter.format(new Date(timestamp));
}

export function compareReconciliationTransactions(
  left: ReconciliationTransaction,
  right: ReconciliationTransaction,
): number {
  const leftTimestamp = reconciliationDateTimestamp(left.date);
  const rightTimestamp = reconciliationDateTimestamp(right.date);
  const sortableLeft = Number.isNaN(leftTimestamp)
    ? (normalizeSearch(left.date).startsWith("before") ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY)
    : leftTimestamp;
  const sortableRight = Number.isNaN(rightTimestamp)
    ? (normalizeSearch(right.date).startsWith("before") ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY)
    : rightTimestamp;
  return sortableLeft - sortableRight || left.id.localeCompare(right.id);
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
  return RECONCILIATION_TRIPS.flatMap((tripId) => {
    const earlierInstitution = tripId === "peru" ? "Tangerine" : "Scotiabank";
    const earlierAccount = tripId === "peru"
      ? "Mastercard · earlier booking charges"
      : "Earlier statement bookings";
    return [
      source(`wanderlog-${tripId}`, tripId, "wanderlog", "Wanderlog", "Trip expense log"),
      source(`scotia-${tripId}`, tripId, "bank", "Scotiabank", "Passport Visa Infinite •••• 7283"),
      source(`export-${tripId}`, tripId, "import", earlierInstitution, earlierAccount),
      ...(tripId !== "peru"
        ? [source(`tangerine-${tripId}`, tripId, "bank", "Tangerine", "Money-Back Mastercard •••• 8125 · no matching activity")]
        : []),
      ...(tripId === "peru"
        ? [source("cash-peru", tripId, "cash", "Tangerine", "International ATM withdrawals")]
        : []),
      ...(tripId === "portugal"
        ? [source("cash-portugal", tripId, "cash", "Cash", "Approximately €250 · CA$411.29 equivalent")]
        : []),
    ];
  });
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

export function linkedExpenseId(transaction: ReconciliationTransaction): string | null {
  if (transaction.side !== "left" || transaction.accountType !== "wanderlog") return null;
  return transaction.reference || transaction.id.split(":").slice(2).join(":") || null;
}

function reconciliationTripForGroup(groupId: string | null): ReconciliationTripId | null {
  if (!groupId) return null;
  const entry = Object.entries(GROUP_BY_TRIP).find(([, candidateGroupId]) => candidateGroupId === groupId);
  return entry ? entry[0] as ReconciliationTripId : null;
}

export function resizeExpenseAmount(expense: Expense, amount: number): Expense {
  const owes = expense.splitMethod === "equally"
    ? splitEqually(amount, expense.splits.length)
    : splitByWeights(amount, expense.splits.map((split) => split.owes));
  let paid = splitByWeights(amount, expense.splits.map((split) => split.paid));
  if (amount > 0 && paid.every((share) => share === 0) && expense.splits.length > 0) {
    const payerIndex = Math.max(0, expense.splits.findIndex((split) => split.personId === expense.createdBy));
    paid = expense.splits.map((_, index) => index === payerIndex ? amount : 0);
  }
  return {
    ...expense,
    amount,
    splits: expense.splits.map((split, index) => ({
      ...split,
      owes: owes[index] ?? 0,
      paid: paid[index] ?? 0,
    })),
  };
}

export function expenseFromReconciliationTransaction(
  expense: Expense,
  transaction: ReconciliationTransaction,
): Expense {
  const resized = resizeExpenseAmount(expense, transaction.postedCadCents);
  return {
    ...resized,
    description: transaction.description,
    date: canonicalDate(transaction.date),
  };
}

function transactionSearchText(item: ReconciliationTransaction): string {
  return normalizeSearch([
    item.date,
    item.postedDate,
    item.description,
    item.reference,
    item.category,
    item.currency,
    item.postedCadCents / 100,
    item.notes ?? "",
    item.sourceId,
  ].join(" "));
}

export function updateReconciliationTransaction(
  workspace: ReconciliationWorkspace,
  id: string,
  patch: Partial<ReconciliationTransaction>,
): ReconciliationWorkspace {
  const current = workspace.transactions.find((item) => item.id === id);
  if (!current) return workspace;
  const updated = { ...current, ...patch };
  const amountChanged = updated.postedCadCents !== current.postedCadCents;
  const transactions = workspace.transactions.map((item) => item.id === id
    ? {
        ...updated,
        merchant: normalizeSearch(updated.description),
        normalizedText: transactionSearchText(updated),
        duplicateFingerprint: fingerprint([
          updated.sourceId,
          canonicalDate(updated.postedDate),
          updated.postedCadCents,
          updated.reference,
          updated.description,
        ]),
        raw: {
          ...updated.raw,
          date: updated.date,
          description: updated.description,
          amount: String(updated.postedCadCents),
        },
      }
    : item);
  if (!amountChanged) return { ...workspace, transactions };

  const reopenedIds = new Set<string>();
  const matchGroups = workspace.matchGroups.map((group) => {
    if (group.status !== "confirmed" || ![...group.leftIds, ...group.rightIds].includes(id)) return group;
    [...group.leftIds, ...group.rightIds].forEach((transactionId) => reopenedIds.add(transactionId));
    const byId = new Map(transactions.map((item) => [item.id, item]));
    const leftTotalCents = group.leftIds.reduce((sum, transactionId) => sum + (byId.get(transactionId)?.postedCadCents ?? 0), 0);
    const rightTotalCents = group.rightIds.reduce((sum, transactionId) => sum + (byId.get(transactionId)?.postedCadCents ?? 0), 0);
    return {
      ...group,
      status: "draft" as const,
      leftTotalCents,
      rightTotalCents,
      differenceCents: leftTotalCents - rightTotalCents - (group.adjustment?.amountCents ?? 0),
      confirmedAt: undefined,
      explanation: [...group.explanation, "Amount changed after confirmation; review this match again"],
    };
  });

  return {
    ...workspace,
    transactions: transactions.map((item) => reopenedIds.has(item.id)
      ? { ...item, status: "unmatched" as const }
      : item),
    matchGroups,
  };
}

export function syncExpenseToReconciliation(
  state: ReconciliationState,
  expense: Expense,
): ReconciliationState {
  if (!state.workspace) return state;
  const transaction = state.workspace.transactions.find((item) => linkedExpenseId(item) === expense.id);
  const tripId = reconciliationTripForGroup(expense.groupId);
  if (!tripId) return transaction ? removeExpenseFromReconciliation(state, expense.id) : state;
  if (!transaction) {
    const created = leftTransaction(expense, tripId, "unmatched");
    return {
      ...state,
      workspace: {
        ...state.workspace,
        transactions: [...state.workspace.transactions, created],
      },
    };
  }
  if (transaction.tripId !== tripId) {
    return syncExpenseToReconciliation(removeExpenseFromReconciliation(state, expense.id), expense);
  }
  const originalAmountCents = transaction.currency === "CAD"
    ? expense.amount
    : transaction.originalAmountCents;
  const workspace = updateReconciliationTransaction(state.workspace, transaction.id, {
    date: expense.date,
    postedDate: expense.date,
    description: expense.description,
    category: expense.category,
    originalAmountCents,
    postedCadCents: expense.amount,
    notes: expense.notes,
  });
  return { ...state, workspace };
}

export function removeExpenseFromReconciliation(
  state: ReconciliationState,
  expenseId: string,
): ReconciliationState {
  if (!state.workspace) return state;
  const removed = state.workspace.transactions.filter((item) => linkedExpenseId(item) === expenseId);
  if (removed.length === 0) return state;
  const removedIds = new Set(removed.map((item) => item.id));
  const affectedGroups = state.workspace.matchGroups.filter((group) =>
    [...group.leftIds, ...group.rightIds].some((id) => removedIds.has(id)),
  );
  const affectedRemainingIds = new Set(
    affectedGroups.flatMap((group) => [...group.leftIds, ...group.rightIds]).filter((id) => !removedIds.has(id)),
  );
  const transactions = state.workspace.transactions
    .filter((item) => !removedIds.has(item.id))
    .map((item) => affectedRemainingIds.has(item.id) ? { ...item, status: "unmatched" as const } : item);
  const transactionById = new Map(transactions.map((item) => [item.id, item]));
  const exceptions = state.workspace.exceptions.flatMap((exception) => {
    const transactionIds = exception.transactionIds.filter((id) => !removedIds.has(id));
    if (transactionIds.length === 0) return [];
    return [{
      ...exception,
      transactionIds,
      amountCents: transactionIds.reduce((sum, id) => sum + (transactionById.get(id)?.postedCadCents ?? 0), 0),
    }];
  });
  return {
    ...state,
    workspace: {
      ...state.workspace,
      transactions,
      matchGroups: state.workspace.matchGroups.filter((group) => !affectedGroups.includes(group)),
      exceptions,
    },
  };
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
  const tripKey = tripId;
  const decision = side === "left"
    ? state.decisions[`${tripKey}-${id}`]
    : state.decisions[`statement-${tripKey}-${id}`];
  return decision === "exclude" || decision === "personal" ? "excluded" : "unmatched";
}

function buildTransactions(state: ReconciliationState, expenses: Expense[]): ReconciliationTransaction[] {
  const result: ReconciliationTransaction[] = [];
  for (const tripId of RECONCILIATION_TRIPS) {
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
    if (tripId === "portugal") {
      state.portugalCashTransactions.forEach((item) => {
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
    const tripId: ReconciliationTripId = legacyLeft.startsWith("new-york-")
      ? "new-york"
      : legacyLeft.startsWith("portugal-")
        ? "portugal"
        : "peru";
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
        name: "Exact or rounded Wanderlog amounts within 7 days",
        priority: 10,
        sourceIds: [],
        dateToleranceDays: 7,
        amountToleranceCents: 0,
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
      { tripId: "portugal", status: "open" },
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
    const rebuiltSourcesById = new Map(rebuilt.sources.map((item) => [item.id, item]));
    const existingIds = new Set(state.workspace.transactions.map((item) => item.id));
    const existingSourceIds = new Set(state.workspace.sources.map((item) => item.id));
    const existingPeriodTrips = new Set(state.workspace.periods.map((item) => item.tripId));
    const missingTransactions = rebuilt.transactions.filter((item) => !existingIds.has(item.id));
    const missingSources = rebuilt.sources.filter((item) => !existingSourceIds.has(item.id));
    const missingPeriods = rebuilt.periods.filter((item) => !existingPeriodTrips.has(item.tripId));
    const repairedTransactions = state.workspace.transactions.map((item) => {
      if (Number.isFinite(item.originalAmountCents)) return item;
      const source = rebuiltById.get(item.id);
      return source ? { ...item, originalAmountCents: source.originalAmountCents } : item;
    });
    const refreshAuditId = "audit-expense-export-2026-07-28";
    const importedPeruIds = missingTransactions
      .filter((item) => item.id === "scotia:peru:scotia-peru-jul26-larco"
        || item.id === "scotia:peru:scotia-peru-jul27-hopp")
      .map((item) => item.id);
    const refreshAuditEvents = importedPeruIds.length > 0
      && !state.workspace.auditEvents.some((item) => item.id === refreshAuditId)
      ? [{
          id: refreshAuditId,
          tripId: "peru" as const,
          action: "import" as const,
          timestamp: "2026-07-28T00:00:00.000Z",
          summary: "Added 2 newly posted Scotiabank charges from the refreshed expense export",
          transactionIds: importedPeruIds,
        }]
      : [];
    const portugalImportAuditId = "audit-scotiabank-csv-2026-08-04";
    const importedPortugalIds = missingTransactions
      .filter((item) => item.tripId === "portugal" && item.sourceId === "scotia-portugal")
      .map((item) => item.id);
    const portugalImportAuditEvents = importedPortugalIds.length > 0
      && !state.workspace.auditEvents.some((item) => item.id === portugalImportAuditId)
      ? [{
          id: portugalImportAuditId,
          tripId: "portugal" as const,
          action: "import" as const,
          timestamp: "2026-08-04T00:00:00.000Z",
          summary: `Added ${importedPortugalIds.length} verified Scotiabank charges from the complete card CSV`,
          transactionIds: importedPortugalIds,
        }]
      : [];
    const portugalCashAuditId = "audit-portugal-euro-cash-2026-08-04";
    const importedPortugalCashIds = missingTransactions
      .filter((item) => item.tripId === "portugal" && item.sourceId === "cash-portugal")
      .map((item) => item.id);
    const portugalCashAuditEvents = importedPortugalCashIds.length > 0
      && !state.workspace.auditEvents.some((item) => item.id === portugalCashAuditId)
      ? [{
          id: portugalCashAuditId,
          tripId: "portugal" as const,
          action: "import" as const,
          timestamp: "2026-08-04T00:00:00.000Z",
          summary: "Added approximately €250 in travel cash at its CA$411.29 equivalent",
          transactionIds: importedPortugalCashIds,
        }]
      : [];
    return {
      ...state.workspace,
      sources: [
        ...state.workspace.sources.map((item) => {
          const canonical = rebuiltSourcesById.get(item.id);
          return canonical
            ? {
                ...item,
                type: canonical.type,
                institution: canonical.institution,
                account: canonical.account,
                currency: canonical.currency,
              }
            : item;
        }),
        ...missingSources,
      ],
      transactions: [...repairedTransactions, ...missingTransactions],
      auditEvents: [
        ...state.workspace.auditEvents,
        ...refreshAuditEvents,
        ...portugalImportAuditEvents,
        ...portugalCashAuditEvents,
      ],
      periods: [...state.workspace.periods, ...missingPeriods],
      rules: state.workspace.rules.map((item) => item.id === "default-exact"
        ? {
            ...item,
            name: "Exact or rounded Wanderlog amounts within 7 days",
            amountToleranceCents: 0,
          }
        : item),
    };
  }
  return createReconciliationWorkspace(state, expenses);
}

export function reconciliationTotals(workspace: ReconciliationWorkspace, tripId: ReconciliationTripId) {
  const transactions = workspace.transactions.filter((item) => item.tripId === tripId);
  const active = transactions.filter((item) => item.status !== "excluded");
  const left = active.filter((item) => item.side === "left").reduce((sum, item) => sum + item.postedCadCents, 0);
  const right = active.filter((item) => item.side === "right").reduce((sum, item) => sum + item.postedCadCents, 0);
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

function tokenSimilarity(left: string, right: string): number {
  const a = new Set(normalizeSearch(left).split(" ").filter((word) => word.length > 1));
  const b = new Set(normalizeSearch(right).split(" ").filter((word) => word.length > 1));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function characterTrigrams(value: string): string[] {
  const normalized = normalizeSearch(value).replace(/\s/g, "");
  if (normalized.length < 3) return normalized ? [normalized] : [];
  return Array.from({ length: normalized.length - 2 }, (_, index) => normalized.slice(index, index + 3));
}

function characterSimilarity(left: string, right: string): number {
  const a = characterTrigrams(left);
  const b = characterTrigrams(right);
  if (!a.length || !b.length) return 0;
  const remaining = [...b];
  let overlap = 0;
  a.forEach((item) => {
    const index = remaining.indexOf(item);
    if (index >= 0) {
      overlap += 1;
      remaining.splice(index, 1);
    }
  });
  return (2 * overlap) / (a.length + b.length);
}

function textSimilarity(left: string, right: string): number {
  const a = normalizeSearch(left);
  const b = normalizeSearch(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const containment = a.includes(b) || b.includes(a) ? Math.min(a.length, b.length) / Math.max(a.length, b.length) : 0;
  return Math.max(tokenSimilarity(a, b), characterSimilarity(a, b), containment);
}

function merchantScore(left: ReconciliationTransaction, right: ReconciliationTransaction): number {
  return textSimilarity(left.description, right.description);
}

function supportScore(left: ReconciliationTransaction, right: ReconciliationTransaction): number {
  return textSimilarity(
    [left.reference, left.notes, left.raw.detail].filter(Boolean).join(" "),
    [right.reference, right.notes, right.raw.detail].filter(Boolean).join(" "),
  );
}

interface ScoredPair {
  left: ReconciliationTransaction;
  right: ReconciliationTransaction;
  score: number;
  amountDifference: number;
  dateDays: number;
  merchant: number;
  support: number;
}

function enabledRules(workspace: ReconciliationWorkspace, tripId: ReconciliationTripId) {
  return workspace.rules
    .filter((rule) => rule.enabled && (!rule.tripId || rule.tripId === tripId))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function ruleForTransactions(
  workspace: ReconciliationWorkspace,
  tripId: ReconciliationTripId,
  transactions: ReconciliationTransaction[],
) {
  return enabledRules(workspace, tripId).find((rule) => (
    rule.sourceIds.length === 0 || transactions.every((item) => rule.sourceIds.includes(item.sourceId))
  ));
}

function roundingIncrement(amountCents: number): 50 | 100 | null {
  if (amountCents % 100 === 0) return 100;
  if (amountCents % SUGGESTION_ROUNDING_INCREMENT_CENTS === 0) return SUGGESTION_ROUNDING_INCREMENT_CENTS;
  return null;
}

function roundedAmountMatch(leftAmountCents: number, rightAmountCents: number): { incrementCents: 50 | 100 } | null {
  const incrementCents = roundingIncrement(leftAmountCents);
  if (!incrementCents) return null;
  const lower = Math.floor(rightAmountCents / incrementCents) * incrementCents;
  const upper = Math.ceil(rightAmountCents / incrementCents) * incrementCents;
  return leftAmountCents === lower || leftAmountCents === upper ? { incrementCents } : null;
}

function scorePair(
  workspace: ReconciliationWorkspace,
  tripId: ReconciliationTripId,
  left: ReconciliationTransaction,
  right: ReconciliationTransaction,
): ScoredPair | null {
  const rule = ruleForTransactions(workspace, tripId, [left, right]);
  if (!rule) return null;
  const amountDifference = Math.abs(left.postedCadCents - right.postedCadCents);
  const dateDays = dateDistance(left.postedDate, right.postedDate);
  const roundedMatch = amountDifference === 0 ? null : roundedAmountMatch(left.postedCadCents, right.postedCadCents);
  if (amountDifference !== 0 && (!roundedMatch || dateDays > rule.dateToleranceDays)) return null;
  const merchant = merchantScore(left, right);
  const support = supportScore(left, right);
  const amountScore = amountDifference === 0
    ? 50
    : 50 * Math.max(0, 1 - amountDifference / roundedMatch!.incrementCents);
  const dateScore = 15 * Math.max(0, 1 - dateDays / Math.max(1, rule.dateToleranceDays + 1));
  return {
    left,
    right,
    score: amountScore + merchant * 30 + dateScore + support * 5,
    amountDifference,
    dateDays,
    merchant,
    support,
  };
}

function maximumWeightPairs(
  left: ReconciliationTransaction[],
  right: ReconciliationTransaction[],
  candidates: ScoredPair[],
): ScoredPair[] {
  if (!left.length || !right.length || !candidates.length) return [];
  const pairByKey = new Map(candidates.map((item) => [`${item.left.id}|${item.right.id}`, item]));
  const columnCount = right.length + left.length;
  const costs = left.map((leftItem) => Array.from({ length: columnCount }, (_, columnIndex) => {
    if (columnIndex >= right.length) return 1_200;
    const candidate = pairByKey.get(`${leftItem.id}|${right[columnIndex].id}`);
    const assignmentWeight = candidate
      ? candidate.score + (candidate.amountDifference === 0 ? 1_000 : 0)
      : 0;
    return candidate ? 1_200 - assignmentWeight : 100_000;
  }));
  const rowCount = left.length;
  const u = Array(rowCount + 1).fill(0) as number[];
  const v = Array(columnCount + 1).fill(0) as number[];
  const matchedRow = Array(columnCount + 1).fill(0) as number[];
  const path = Array(columnCount + 1).fill(0) as number[];
  for (let row = 1; row <= rowCount; row += 1) {
    matchedRow[0] = row;
    let column = 0;
    const minValue = Array(columnCount + 1).fill(Number.POSITIVE_INFINITY) as number[];
    const used = Array(columnCount + 1).fill(false) as boolean[];
    do {
      used[column] = true;
      const currentRow = matchedRow[column];
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let candidateColumn = 1; candidateColumn <= columnCount; candidateColumn += 1) {
        if (used[candidateColumn]) continue;
        const cost = costs[currentRow - 1][candidateColumn - 1] - u[currentRow] - v[candidateColumn];
        if (cost < minValue[candidateColumn]) {
          minValue[candidateColumn] = cost;
          path[candidateColumn] = column;
        }
        if (minValue[candidateColumn] < delta) {
          delta = minValue[candidateColumn];
          nextColumn = candidateColumn;
        }
      }
      for (let candidateColumn = 0; candidateColumn <= columnCount; candidateColumn += 1) {
        if (used[candidateColumn]) {
          u[matchedRow[candidateColumn]] += delta;
          v[candidateColumn] -= delta;
        } else {
          minValue[candidateColumn] -= delta;
        }
      }
      column = nextColumn;
    } while (matchedRow[column] !== 0);
    do {
      const previous = path[column];
      matchedRow[column] = matchedRow[previous];
      column = previous;
    } while (column !== 0);
  }
  const selected: ScoredPair[] = [];
  for (let column = 1; column <= right.length; column += 1) {
    const row = matchedRow[column];
    if (!row) continue;
    const candidate = pairByKey.get(`${left[row - 1].id}|${right[column - 1].id}`);
    if (candidate) selected.push(candidate);
  }
  return selected;
}

function confidenceFor(score: number, margin: number) {
  if (score >= 75 && margin >= 10) return { confidence: "high" as const, ambiguous: false };
  if (score >= 55 && margin >= 5) return { confidence: "medium" as const, ambiguous: false };
  return { confidence: "low" as const, ambiguous: true };
}

function pairExplanation(candidate: ScoredPair, margin: number): string[] {
  return [
    candidate.amountDifference === 0
      ? "Exact CAD amount"
      : `CA$${(candidate.amountDifference / 100).toFixed(2)} difference`,
    `${candidate.dateDays} day${candidate.dateDays === 1 ? "" : "s"} apart`,
    candidate.merchant >= 0.65
      ? "Strong merchant similarity"
      : candidate.merchant >= 0.25
        ? "Partial merchant similarity"
        : "Merchant differs",
    `Match score ${Math.round(candidate.score)}/100`,
    ...(margin < 10 ? [`Another option is within ${Math.max(0, Math.round(margin))} points`] : []),
  ];
}

function combinations(items: ReconciliationTransaction[], size: 2 | 3): ReconciliationTransaction[][] {
  const result: ReconciliationTransaction[][] = [];
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      if (size === 2) {
        result.push([items[first], items[second]]);
        continue;
      }
      for (let third = second + 1; third < items.length; third += 1) {
        result.push([items[first], items[second], items[third]]);
      }
    }
  }
  return result;
}

function dateSpan(items: ReconciliationTransaction[]): number {
  let span = 0;
  items.forEach((leftItem) => items.forEach((rightItem) => {
    span = Math.max(span, dateDistance(leftItem.postedDate, rightItem.postedDate));
  }));
  return span;
}

interface GroupCandidate {
  leftIds: string[];
  rightIds: string[];
  leftTotalCents: number;
  rightTotalCents: number;
  score: number;
  dateDays: number;
  merchant: number;
  groupSpan: number;
}

function groupedCandidates(
  workspace: ReconciliationWorkspace,
  tripId: ReconciliationTripId,
  left: ReconciliationTransaction[],
  right: ReconciliationTransaction[],
): GroupCandidate[] {
  const result: GroupCandidate[] = [];
  const build = (
    singles: ReconciliationTransaction[],
    grouped: ReconciliationTransaction[],
    singleSide: "left" | "right",
  ) => {
    const groupedByAmount = new Map<number, ReconciliationTransaction[][]>();
    ([2, 3] as const).flatMap((size) => combinations(grouped, size)).forEach((items) => {
      const span = dateSpan(items);
      if (span > 3) return;
      const total = items.reduce((sum, item) => sum + item.postedCadCents, 0);
      groupedByAmount.set(total, [...(groupedByAmount.get(total) ?? []), items]);
    });
    singles.forEach((single) => {
      (groupedByAmount.get(single.postedCadCents) ?? []).forEach((items) => {
        const rule = ruleForTransactions(workspace, tripId, [single, ...items]);
        if (!rule) return;
        const dateDays = Math.max(...items.map((item) => dateDistance(single.postedDate, item.postedDate)));
        if (dateDays > rule.dateToleranceDays) return;
        const merchant = Math.max(...items.map((item) => merchantScore(single, item)));
        const support = Math.max(...items.map((item) => supportScore(single, item)));
        const dateScore = 15 * Math.max(0, 1 - dateDays / Math.max(1, rule.dateToleranceDays + 1));
        const groupedIds = items.map((item) => item.id).sort();
        const groupedTotalCents = items.reduce((sum, item) => sum + item.postedCadCents, 0);
        result.push({
          leftIds: singleSide === "left" ? [single.id] : groupedIds,
          rightIds: singleSide === "right" ? [single.id] : groupedIds,
          leftTotalCents: singleSide === "left" ? single.postedCadCents : groupedTotalCents,
          rightTotalCents: singleSide === "right" ? single.postedCadCents : groupedTotalCents,
          score: 50 + merchant * 30 + dateScore + support * 5,
          dateDays,
          merchant,
          groupSpan: dateSpan(items),
        });
      });
    });
  };
  build(left, right, "left");
  build(right, left, "right");
  return result;
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
  workspace.exceptions
    .filter((exception) => exception.tripId === tripId && !exception.resolved)
    .forEach((exception) => exception.transactionIds.forEach((id) => unavailable.add(id)));
  if (!enabledRules(workspace, tripId).length) return [];
  const left = workspace.transactions
    .filter((item) => item.tripId === tripId && item.side === "left" && item.status === "unmatched" && !unavailable.has(item.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const right = workspace.transactions
    .filter((item) => item.tripId === tripId && item.side === "right" && item.status === "unmatched" && !unavailable.has(item.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const pairCandidates = left.flatMap((leftItem) => right
    .map((rightItem) => scorePair(workspace, tripId, leftItem, rightItem))
    .filter((item): item is ScoredPair => Boolean(item)));
  const assignedPairs = maximumWeightPairs(left, right, pairCandidates);
  const suggestions: ReconciliationMatchGroup[] = assignedPairs.map((candidate) => {
    const alternativeScore = Math.max(
      0,
      ...pairCandidates
        .filter((item) => item !== candidate && (item.left.id === candidate.left.id || item.right.id === candidate.right.id))
        .map((item) => item.score),
    );
    const margin = candidate.score - alternativeScore;
    const { confidence, ambiguous } = confidenceFor(candidate.score, margin);
    return {
      id: `suggestion:${candidate.left.id}:${candidate.right.id}`,
      tripId,
      leftIds: [candidate.left.id],
      rightIds: [candidate.right.id],
      matchType: "1 ↔ 1",
      status: ambiguous ? "ambiguous" : "suggested",
      leftTotalCents: candidate.left.postedCadCents,
      rightTotalCents: candidate.right.postedCadCents,
      differenceCents: candidate.left.postedCadCents - candidate.right.postedCadCents,
      confidence,
      explanation: pairExplanation(candidate, margin),
      createdAt: new Date().toISOString(),
    };
  });
  const assignedIds = new Set(suggestions.flatMap((item) => [...item.leftIds, ...item.rightIds]));
  const remainingLeft = left.filter((item) => !assignedIds.has(item.id));
  const remainingRight = right.filter((item) => !assignedIds.has(item.id));
  const groupPool = groupedCandidates(workspace, tripId, remainingLeft, remainingRight)
    .sort((a, b) => b.score - a.score || [...a.leftIds, ...a.rightIds].join("|").localeCompare([...b.leftIds, ...b.rightIds].join("|")));
  const groupedUsed = new Set<string>();
  groupPool.forEach((candidate) => {
    const ids = [...candidate.leftIds, ...candidate.rightIds];
    if (ids.some((id) => groupedUsed.has(id))) return;
    const alternativeScore = Math.max(
      0,
      ...groupPool
        .filter((item) => item !== candidate && [...item.leftIds, ...item.rightIds].some((id) => ids.includes(id)))
        .map((item) => item.score),
    );
    const margin = candidate.score - alternativeScore;
    const { confidence, ambiguous } = confidenceFor(candidate.score, margin);
    ids.forEach((id) => groupedUsed.add(id));
    suggestions.push({
      id: `suggestion:${candidate.leftIds.join("+")}:${candidate.rightIds.join("+")}`,
      tripId,
      leftIds: candidate.leftIds,
      rightIds: candidate.rightIds,
      matchType: `${candidate.leftIds.length} ↔ ${candidate.rightIds.length}`,
      status: ambiguous ? "ambiguous" : "suggested",
      leftTotalCents: candidate.leftTotalCents,
      rightTotalCents: candidate.rightTotalCents,
      differenceCents: 0,
      confidence,
      explanation: [
        "Exact grouped CAD total",
        `${candidate.dateDays} day${candidate.dateDays === 1 ? "" : "s"} from the statement date`,
        `Grouped transactions span ${candidate.groupSpan} day${candidate.groupSpan === 1 ? "" : "s"}`,
        candidate.merchant >= 0.25 ? "Merchant text supports the group" : "Merchant text differs",
        `Match score ${Math.round(candidate.score)}/100`,
        ...(margin < 10 ? [`Another option is within ${Math.max(0, Math.round(margin))} points`] : []),
      ],
      createdAt: new Date().toISOString(),
    });
  });
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  return suggestions.sort((a, b) => (
    (a.status === "ambiguous" ? 1 : 0) - (b.status === "ambiguous" ? 1 : 0)
    || confidenceOrder[a.confidence ?? "low"] - confidenceOrder[b.confidence ?? "low"]
    || a.id.localeCompare(b.id)
  ));
}

export function cashSummary(workspace: ReconciliationWorkspace, endingCashCents: number) {
  const cash = workspace.transactions.filter((item) => item.tripId === "peru" && item.accountType === "cash" && item.status !== "excluded");
  const opening = cash.filter((item) => item.id.includes("cash-prior")).reduce((sum, item) => sum + item.postedCadCents, 0);
  const withdrawals = cash.filter((item) => !item.id.includes("cash-prior")).reduce((sum, item) => sum + item.postedCadCents, 0);
  const total = opening + withdrawals;
  const used = total - endingCashCents;
  return { opening, withdrawals, total, ending: endingCashCents, used };
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
