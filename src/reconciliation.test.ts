import { describe, expect, it } from "vitest";
import type { ReconciliationTransaction, ReconciliationWorkspace } from "./types";
import {
  auditEvent,
  cashSummary,
  compareReconciliationTransactions,
  createExpenseFromStatementTransaction,
  createReconciliationWorkspace,
  ensureReconciliationWorkspace,
  exceptionTotal,
  formatReconciliationDate,
  generateSuggestions,
  importedTransaction,
  linkedExpenseId,
  mergeReconciliationPeriods,
  normalizeSearch,
  periodMeta,
  previewDelimitedImport,
  reconciliationTotals,
  removeExpenseFromReconciliation,
  resizeExpenseAmount,
  statementExpenseId,
  syncExpenseToReconciliation,
  updateReconciliationTransaction,
} from "./reconciliation";
import { seedState } from "./seed";

function fixture() {
  const state = seedState();
  const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
  return { state, workspace };
}

function isolated(workspace: ReconciliationWorkspace, transactions: ReconciliationTransaction[]): ReconciliationWorkspace {
  return { ...workspace, transactions, matchGroups: [], exceptions: [], rules: workspace.rules.map((rule) => ({ ...rule, enabled: true })) };
}

describe("reconciliation workspace", () => {
  it("uses schema version 2", () => expect(fixture().workspace.schemaVersion).toBe(2));

  it("normalizes every financial amount to integer cents", () => {
    expect(fixture().workspace.transactions.every((item) => Number.isInteger(item.postedCadCents))).toBe(true);
  });

  it("creates generic private sources without account identifiers", () => {
    const sources = fixture().workspace.sources;
    expect(sources.some((item) => item.institution === "Card statement")).toBe(true);
    expect(sources.every((item) => !item.account.includes("••••"))).toBe(true);
  });

  it("creates one period for each synthetic group", () => {
    expect(fixture().workspace.periods.map((item) => item.tripId).sort()).toEqual(["cabin", "city", "coast"]);
  });

  it("resizes equally split expenses without losing cents", () => {
    const expense = fixture().state.expenses.find((item) => item.id === "expense-coast-lodge")!;
    const resized = resizeExpenseAmount(expense, 10_001);
    expect(resized.splits.reduce((sum, item) => sum + item.owes, 0)).toBe(10_001);
    expect(resized.splits.reduce((sum, item) => sum + item.paid, 0)).toBe(10_001);
  });

  it("creates a balanced group expense from a statement item", () => {
    const { state, workspace } = fixture();
    const transaction = workspace.transactions.find((item) => item.id === "statement:coast:statement-coast-market")!;
    const group = state.groups.find((item) => item.id === "group-coast")!;
    const expense = createExpenseFromStatementTransaction(transaction, group, 123);
    expect(expense.splits.reduce((sum, item) => sum + item.owes, 0)).toBe(expense.amount);
    expect(expense.splits.reduce((sum, item) => sum + item.paid, 0)).toBe(expense.amount);
  });

  it("adds a new group expense to an existing workspace", () => {
    const { state, workspace } = fixture();
    state.reconciliation.workspace = workspace;
    const template = state.expenses[0];
    const expense = { ...template, id: "expense-new", description: "New item" };
    const next = syncExpenseToReconciliation(state.reconciliation, expense, [...state.expenses, expense]);
    expect(next.workspace?.transactions.some((item) => item.reference === expense.id)).toBe(true);
  });

  it("updates a linked transaction when its expense changes", () => {
    const { state, workspace } = fixture();
    state.reconciliation.workspace = workspace;
    const expense = { ...state.expenses[0], description: "Updated lodge" };
    const next = syncExpenseToReconciliation(state.reconciliation, expense, state.expenses);
    expect(next.workspace?.transactions.find((item) => item.reference === expense.id)?.description).toBe("Updated lodge");
  });

  it("removes linked transactions with deleted expenses", () => {
    const { state, workspace } = fixture();
    state.reconciliation.workspace = workspace;
    const expenseId = state.expenses[0].id;
    expect(removeExpenseFromReconciliation(state.reconciliation, expenseId).workspace?.transactions.some((item) => item.reference === expenseId)).toBe(false);
  });

  it("calculates stable ledger and statement totals", () => {
    const totals = reconciliationTotals(fixture().workspace, "coast");
    expect(totals.left).toBeGreaterThan(0);
    expect(totals.right).toBeGreaterThan(0);
    expect(totals.difference).toBe(totals.left - totals.right);
  });

  it("backfills missing canonical transactions without replacing matches", () => {
    const { state, workspace } = fixture();
    const omitted = workspace.transactions[0];
    state.reconciliation.workspace = { ...workspace, transactions: workspace.transactions.slice(1) };
    const repaired = ensureReconciliationWorkspace(state.reconciliation, state.expenses);
    expect(repaired.transactions.some((item) => item.id === omitted.id)).toBe(true);
    expect(repaired.matchGroups).toEqual(workspace.matchGroups);
  });

  it("normalizes accents, punctuation, and case for search", () => {
    expect(normalizeSearch("  Café & CRÈME! ")).toBe("cafe creme");
  });

  it("formats ISO dates consistently", () => expect(formatReconciliationDate("2027-01-15")).toContain("Jan"));

  it("sorts transaction dates oldest first", () => {
    const rows = [...fixture().workspace.transactions].sort(compareReconciliationTransactions);
    expect(new Date(rows[0].date).getTime()).toBeLessThanOrEqual(new Date(rows[rows.length - 1].date).getTime());
  });

  it("previews valid CSV rows", () => {
    const preview = previewDelimitedImport("Date,Description,Amount,Reference\n2027-03-01,Example shop,12.34,R1", [], "source");
    expect(preview[0]).toMatchObject({ valid: true, amountCents: 1234, reference: "R1" });
  });

  it("flags duplicate import rows", () => {
    const { workspace } = fixture();
    const existing = workspace.transactions.find((item) => item.side === "right")!;
    const text = `Date,Description,Amount,Reference\n"${existing.date}",${existing.description},${(existing.postedCadCents / 100).toFixed(2)},${existing.reference}`;
    expect(previewDelimitedImport(text, workspace.transactions, existing.sourceId)[0].duplicate).toBe(true);
  });

  it("parses tab-delimited account exports", () => {
    const preview = previewDelimitedImport("Date\tMerchant\tDebit\n2027-03-02\tCorner shop\t8.50", [], "source");
    expect(preview[0]).toMatchObject({ valid: true, description: "Corner shop", amountCents: 850 });
  });

  it("imports ledger sources on the left and statements on the right", () => {
    const row = { row: 2, date: "2027-03-02", description: "Test", amountCents: 850, reference: "", valid: true, duplicate: false };
    expect(importedTransaction(row, "coast", "ledger-coast", "left").side).toBe("left");
    expect(importedTransaction(row, "coast", "statement-coast", "right").side).toBe("right");
  });

  it("builds stable statement expense identifiers", () => {
    const transaction = fixture().workspace.transactions.find((item) => item.side === "right")!;
    expect(statementExpenseId(transaction)).toBe(`statement-expense:${transaction.id}`);
  });

  it("finds the linked expense identifier", () => {
    const transaction = fixture().workspace.transactions.find((item) => item.side === "left")!;
    expect(linkedExpenseId(transaction)).toBe(transaction.reference);
  });

  it("generates deterministic exact suggestions", () => {
    const { workspace } = fixture();
    const first = generateSuggestions(workspace, "coast").map((item) => item.id);
    const second = generateSuggestions(workspace, "coast").map((item) => item.id);
    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
  });

  it("allows exact matches even when dates are far apart", () => {
    const { workspace } = fixture();
    const left = workspace.transactions.find((item) => item.side === "left")!;
    const right = workspace.transactions.find((item) => item.side === "right")!;
    const exact = isolated(workspace, [{ ...left, postedCadCents: 5_000, date: "2027-01-01", postedDate: "2027-01-01" }, { ...right, postedCadCents: 5_000, date: "2027-03-01", postedDate: "2027-03-01" }]);
    expect(generateSuggestions(exact, left.tripId)).toHaveLength(1);
  });

  it("accepts rounded near-matches inside the date window", () => {
    const { workspace } = fixture();
    const left = workspace.transactions.find((item) => item.side === "left")!;
    const right = workspace.transactions.find((item) => item.side === "right")!;
    const rounded = isolated(workspace, [{ ...left, postedCadCents: 10_000, date: "2027-01-01", postedDate: "2027-01-01" }, { ...right, postedCadCents: 9_975, date: "2027-01-02", postedDate: "2027-01-02" }]);
    expect(generateSuggestions(rounded, left.tripId)).toHaveLength(1);
  });

  it("rejects arbitrary non-rounded near-matches", () => {
    const { workspace } = fixture();
    const left = workspace.transactions.find((item) => item.side === "left")!;
    const right = workspace.transactions.find((item) => item.side === "right")!;
    const mismatch = isolated(workspace, [{ ...left, postedCadCents: 10_023 }, { ...right, postedCadCents: 9_975 }]);
    expect(generateSuggestions(mismatch, left.tripId)).toHaveLength(0);
  });

  it("keeps an exact-amount match ambiguous when the merchant text is unrelated", () => {
    const { workspace } = fixture();
    const left = workspace.transactions.find((item) => item.side === "left")!;
    const right = workspace.transactions.find((item) => item.side === "right")!;
    const mismatch = isolated(workspace, [
      { ...left, postedCadCents: 5_040, description: "Rachel Sweater", merchant: "rachel sweater", reference: "expense-unrelated", notes: undefined },
      { ...right, postedCadCents: 5_040, description: "Modern Textiles Emporium", merchant: "modern textiles emporium", reference: "card-ref-9182", notes: "card-ref-9182" },
    ]);
    const suggestions = generateSuggestions(mismatch, left.tripId);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].status).toBe("ambiguous");
    expect(suggestions[0].confidence).toBe("low");
  });

  it("does not suggest a grouped total when member merchants are unrelated", () => {
    const { workspace } = fixture();
    const left = workspace.transactions.find((item) => item.side === "left")!;
    const right = workspace.transactions.find((item) => item.side === "right")!;
    const grouped = isolated(workspace, [
      { ...left, id: "left-group", postedCadCents: 5_040, description: "Rachel Sweater", merchant: "rachel sweater", reference: "expense-unrelated", notes: undefined },
      { ...right, id: "right-a", postedCadCents: 1_500, description: "Debonair Bistro", merchant: "debonair bistro", reference: "card-ref-1", notes: "card-ref-1" },
      { ...right, id: "right-b", postedCadCents: 3_540, description: "Gyri Gift Shop", merchant: "gyri gift shop", reference: "card-ref-2", notes: "card-ref-2" },
    ]);
    const suggestions = generateSuggestions(grouped, left.tripId);
    expect(suggestions.some((item) => item.status === "suggested" && item.matchType === "1 ↔ 2")).toBe(false);
  });

  it("suggests bounded one-to-many exact groups", () => {
    const { workspace } = fixture();
    const left = workspace.transactions.find((item) => item.side === "left")!;
    const right = workspace.transactions.find((item) => item.side === "right")!;
    const grouped = isolated(workspace, [
      { ...left, id: "left-group", postedCadCents: 10_000 },
      { ...right, id: "right-a", postedCadCents: 4_000 },
      { ...right, id: "right-b", postedCadCents: 6_000 },
    ]);
    expect(generateSuggestions(grouped, left.tripId).some((item) => item.matchType === "1 ↔ 2")).toBe(true);
  });

  it("stops suggestions when the matching rule is disabled", () => {
    const { workspace } = fixture();
    const disabled = { ...workspace, rules: workspace.rules.map((rule) => ({ ...rule, enabled: false })) };
    expect(generateSuggestions(disabled, "coast")).toHaveLength(0);
  });

  it("reopens a confirmed match after an amount edit", () => {
    const { workspace } = fixture();
    const suggestion = generateSuggestions(workspace, "coast")[0];
    const confirmed = { ...workspace, matchGroups: [{ ...suggestion, status: "confirmed" as const }], transactions: workspace.transactions.map((item) => [...suggestion.leftIds, ...suggestion.rightIds].includes(item.id) ? { ...item, status: "reconciled" as const } : item) };
    const updated = updateReconciliationTransaction(confirmed, suggestion.leftIds[0], { postedCadCents: suggestion.leftTotalCents + 100 });
    expect(updated.matchGroups[0].status).toBe("draft");
  });

  it("summarizes cash remaining and used", () => {
    const summary = cashSummary(fixture().workspace, 1_500, "coast");
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.used).toBe(summary.total - 1_500);
  });

  it("creates audit records and totals open exceptions", () => {
    const event = auditEvent("coast", "edit", "Updated item", ["one"]);
    expect(event).toMatchObject({ tripId: "coast", action: "edit", transactionIds: ["one"] });
    expect(exceptionTotal([{ id: "x", tripId: "coast", transactionIds: [], reason: "other", note: "", amountCents: 725, resolved: false, createdAt: "now" }], "coast")).toBe(725);
  });

  it("merges a duplicate trip's transactions, matches, and exceptions into the target", () => {
    const { workspace } = fixture();
    const suggestion = generateSuggestions(workspace, "cabin")[0];
    const withMatch: typeof workspace = {
      ...workspace,
      matchGroups: [{ ...suggestion, status: "confirmed" as const }],
      exceptions: [{
        id: "exception-cabin-1",
        tripId: "cabin",
        transactionIds: [],
        reason: "fee",
        note: "Bank fee",
        amountCents: 250,
        resolved: false,
        createdAt: new Date(0).toISOString(),
      }],
      sources: [
        ...workspace.sources,
        {
          id: "custom-source-1",
          tripId: "cabin",
          type: "import" as const,
          institution: "My Bank Import",
          account: "acct-1",
          currency: "CAD",
          importedAt: new Date(0).toISOString(),
          fingerprint: "fp",
        },
      ],
    };
    const cabinTransactionCount = withMatch.transactions.filter((item) => item.tripId === "cabin").length;
    const coastTransactionCount = withMatch.transactions.filter((item) => item.tripId === "coast").length;

    const { workspace: merged, movedTransactions } = mergeReconciliationPeriods(withMatch, "cabin", "coast");

    expect(movedTransactions).toBe(cabinTransactionCount);
    expect(merged.periods.some((item) => item.tripId === "cabin")).toBe(false);
    expect(merged.transactions.filter((item) => item.tripId === "cabin")).toHaveLength(0);
    expect(merged.transactions.filter((item) => item.tripId === "coast")).toHaveLength(coastTransactionCount + cabinTransactionCount);
    expect(merged.transactions.every((item) => !item.id.includes(":cabin:"))).toBe(true);

    const mergedMatch = merged.matchGroups.find((group) => group.status === "confirmed" && group.tripId === "coast");
    expect(mergedMatch).toBeDefined();
    expect(mergedMatch!.leftIds.every((id) => !id.includes(":cabin:"))).toBe(true);
    expect(merged.transactions.some((item) => item.id === mergedMatch!.leftIds[0])).toBe(true);

    const mergedException = merged.exceptions.find((item) => item.id === "exception-cabin-1");
    expect(mergedException?.tripId).toBe("coast");

    expect(merged.sources.some((item) => item.id === "ledger-cabin")).toBe(false);
    const relocatedImport = merged.sources.find((item) => item.id === "custom-source-1");
    expect(relocatedImport?.tripId).toBe("coast");

    expect(merged.auditEvents.some((item) => item.action === "merge" && item.tripId === "coast")).toBe(true);
  });

  it("is a no-op when merging a period into itself or an unknown trip", () => {
    const { workspace } = fixture();
    expect(mergeReconciliationPeriods(workspace, "coast", "coast").workspace).toBe(workspace);
    expect(mergeReconciliationPeriods(workspace, "coast", "not-a-trip").workspace).toBe(workspace);
  });

  it("falls back to the group name and then a title-cased slug for period display", () => {
    const { state, workspace } = fixture();
    const named = periodMeta({ tripId: "coast", status: "open" }, state.groups, workspace.transactions);
    expect(named.name).toBe("Coastal Weekend");
    const slugOnly = periodMeta({ tripId: "quebec-city", status: "open" }, [], []);
    expect(slugOnly.name).toBe("Quebec City");
    expect(slugOnly.dates).toBe("No dates set");
  });

  it("prefers the trip's own ledger dates over a wide, unrelated statement import", () => {
    const { workspace } = fixture();
    const left = workspace.transactions.find((item) => item.side === "left")!;
    const right = workspace.transactions.find((item) => item.side === "right")!;
    const noisy = isolated(workspace, [
      { ...left, id: "left-a", date: "2027-01-15", postedDate: "2027-01-15" },
      { ...left, id: "left-b", date: "2027-01-17", postedDate: "2027-01-17" },
      // A months-long, mostly unrelated card statement import shouldn't
      // dominate the displayed trip range once real ledger dates exist.
      { ...right, id: "right-old", date: "2026-06-01", postedDate: "2026-06-01" },
      { ...right, id: "right-new", date: "2027-08-01", postedDate: "2027-08-01" },
    ]);
    const meta = periodMeta({ tripId: left.tripId, status: "open" }, [], noisy.transactions);
    expect(meta.dates).toBe("Jan 15, 2027 to Jan 17, 2027");
  });

  it("ignores excluded transactions when computing the trip date range", () => {
    const { workspace } = fixture();
    const left = workspace.transactions.find((item) => item.side === "left")!;
    const excludedOutlier: typeof left = { ...left, id: "left-outlier", date: "2020-01-01", postedDate: "2020-01-01", status: "excluded" };
    const real = { ...left, id: "left-real", date: "2027-01-15", postedDate: "2027-01-15" };
    const meta = periodMeta({ tripId: left.tripId, status: "open" }, [], [excludedOutlier, real]);
    expect(meta.dates).toBe("Jan 15, 2027");
  });

  it("falls back to statement dates when the trip has no ledger transactions yet", () => {
    const { workspace } = fixture();
    const right = workspace.transactions.find((item) => item.side === "right")!;
    const statementOnly = [
      { ...right, id: "right-a", date: "2027-03-01", postedDate: "2027-03-01" },
      { ...right, id: "right-b", date: "2027-03-04", postedDate: "2027-03-04" },
    ];
    const meta = periodMeta({ tripId: right.tripId, status: "open" }, [], statementOnly);
    expect(meta.dates).toBe("Mar 1, 2027 to Mar 4, 2027");
  });
});
