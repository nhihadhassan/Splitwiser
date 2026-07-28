import { describe, expect, it } from "vitest";
import { seedState } from "./seed";
import {
  cashSummary,
  createReconciliationWorkspace,
  ensureReconciliationWorkspace,
  generateSuggestions,
  normalizeSearch,
  previewDelimitedImport,
  reconciliationTotals,
  SUGGESTION_AMOUNT_TOLERANCE_CENTS,
} from "./reconciliation";

describe("reconciliation schema migration", () => {
  it("normalizes Peru and New York into integer-cent transactions", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);

    expect(workspace.schemaVersion).toBe(2);
    expect(workspace.transactions.some((item) => item.tripId === "peru" && item.side === "left")).toBe(true);
    expect(workspace.transactions.some((item) => item.tripId === "new-york" && item.side === "right")).toBe(true);
    expect(workspace.transactions.every((item) => Number.isInteger(item.postedCadCents))).toBe(true);
    expect(workspace.transactions.every((item) => Number.isInteger(item.originalAmountCents))).toBe(true);
    expect(workspace.sources.find((item) => item.id === "export-peru")?.institution).toBe("Tangerine");
  });

  it("preserves valid legacy matches and ignores stale IDs", () => {
    const state = seedState();
    const left = state.expenses.find((item) => item.id === "e-ny-002")!;
    expect(left.amount).toBe(4916);
    state.reconciliation.matches = {
      "new-york-e-ny-002": ["scotia:scotia-ny-jun25-airport"],
      "peru-missing": ["scotia:missing"],
    };
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);

    expect(workspace.matchGroups).toHaveLength(1);
    expect(workspace.matchGroups[0].status).toBe("confirmed");
    expect(workspace.matchGroups[0].differenceCents).toBe(0);
  });

  it("keeps trip totals stable through normalization", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const peru = reconciliationTotals(workspace, "peru");
    const expected = state.expenses
      .filter((item) => item.groupId === "g-peru")
      .reduce((sum, item) => sum + item.amount, 0);

    expect(peru.left).toBe(expected);
    expect(peru.leftCount).toBeGreaterThan(0);
    expect(peru.right).toBe(
      workspace.transactions
        .filter((item) => item.tripId === "peru" && item.side === "right" && item.status !== "excluded")
        .reduce((sum, item) => sum + item.postedCadCents, 0),
    );
  });

  it("refreshes canonical account labels in an existing workspace", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    state.reconciliation.workspace = {
      ...workspace,
      sources: workspace.sources.map((item) => item.id === "export-peru"
        ? { ...item, institution: "Expense Export" }
        : item),
      rules: workspace.rules.map((item) => item.id === "default-exact"
        ? { ...item, amountToleranceCents: 1 }
        : item),
    };

    const repaired = ensureReconciliationWorkspace(state.reconciliation, state.expenses);

    expect(repaired.sources.find((item) => item.id === "export-peru")?.institution).toBe("Tangerine");
    expect(repaired.rules.find((item) => item.id === "default-exact")?.amountToleranceCents)
      .toBe(SUGGESTION_AMOUNT_TOLERANCE_CENTS);
  });
});

describe("search and import quality", () => {
  it("normalizes punctuation and diacritics for shared search", () => {
    expect(normalizeSearch("Café — São João, CA$12.30")).toBe("cafe sao joao ca 12 30");
  });

  it("previews CSV and table paste with duplicate detection", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const sourceId = "scotia-new-york";
    const existing = workspace.transactions.filter((item) => item.sourceId === sourceId);
    const text = [
      "Date,Description,Amount,Reference",
      "2026-06-25,NJ Transit Newark Airport,49.16,\"Newark, NJ - Apple Pay\"",
      "2026-06-30,New restaurant,15.75,ABC-123",
      "bad-date,,not-money,",
    ].join("\n");
    const preview = previewDelimitedImport(text, existing, sourceId);

    expect(preview).toHaveLength(3);
    expect(preview[0].duplicate).toBe(true);
    expect(preview[1]).toMatchObject({ valid: true, duplicate: false, amountCents: 1575 });
    expect(preview[2].valid).toBe(false);
  });
});

describe("matching and controls", () => {
  it("produces deterministic exact-amount suggestions with explanations", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const first = generateSuggestions(workspace, "new-york");
    const second = generateSuggestions(workspace, "new-york");

    expect(first.length).toBeGreaterThan(0);
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(first.every((item) => item.explanation.length >= 2)).toBe(true);
  });

  it("suggests matches up to 50 cents apart but not 51 cents apart", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const candidate = generateSuggestions(workspace, "new-york")[0];
    expect(candidate).toBeDefined();
    const rightId = candidate.rightIds[0];
    const hasCandidate = (differenceCents: number) => {
      const shifted = {
        ...workspace,
        transactions: workspace.transactions.map((item) => item.id === rightId
          ? { ...item, postedCadCents: item.postedCadCents + differenceCents }
          : item),
      };
      return generateSuggestions(shifted, "new-york").some((item) => (
        item.leftIds[0] === candidate.leftIds[0] && item.rightIds[0] === rightId
      ));
    };

    expect(hasCandidate(50)).toBe(true);
    expect(hasCandidate(51)).toBe(false);
  });

  it("summarizes cash available, remaining, and used", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const summary = cashSummary(workspace, 10_000);

    expect(summary.opening).toBe(21_200);
    expect(summary.total).toBe(summary.opening + summary.withdrawals);
    expect(summary.used).toBe(summary.total - 10_000);
  });
});
