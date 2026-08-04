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
  it("normalizes Portugal, Peru, and New York into integer-cent transactions", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);

    expect(workspace.schemaVersion).toBe(2);
    expect(workspace.transactions.some((item) => item.tripId === "portugal" && item.side === "left")).toBe(true);
    expect(workspace.transactions.some((item) => item.tripId === "peru" && item.side === "left")).toBe(true);
    expect(workspace.transactions.some((item) => item.tripId === "new-york" && item.side === "right")).toBe(true);
    expect(workspace.transactions.every((item) => Number.isInteger(item.postedCadCents))).toBe(true);
    expect(workspace.transactions.every((item) => Number.isInteger(item.originalAmountCents))).toBe(true);
    expect(workspace.sources.find((item) => item.id === "export-peru")?.institution).toBe("Tangerine");
  });

  it("loads verified Portugal and New York statement activity by source", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const portugal = workspace.transactions.filter((item) => item.tripId === "portugal");
    const newYork = workspace.transactions.filter((item) => item.tripId === "new-york");

    expect(portugal.filter((item) => item.side === "left")).toHaveLength(
      state.expenses.filter((item) => item.groupId === "g-portugal").length,
    );
    const portugalScotia = portugal.filter((item) => item.sourceId === "scotia-portugal");
    expect(portugalScotia).toHaveLength(102);
    expect(portugalScotia.reduce((sum, item) => sum + item.postedCadCents, 0)).toBe(234648);
    expect(portugal.filter((item) => item.sourceId === "cash-portugal")).toHaveLength(1);
    expect(portugal.filter((item) => item.side === "right")
      .reduce((sum, item) => sum + item.postedCadCents, 0)).toBe(521915);
    expect(portugal.filter((item) => item.sourceId === "export-portugal")).toHaveLength(9);
    expect(newYork.filter((item) => item.sourceId === "scotia-new-york")).toHaveLength(20);
    expect(newYork.filter((item) => item.sourceId === "export-new-york")).toHaveLength(1);
    expect(workspace.sources.find((item) => item.id === "tangerine-portugal")?.account)
      .toContain("no matching activity");
    expect(workspace.periods.some((item) => item.tripId === "portugal")).toBe(true);
  });

  it("includes the latest Peru charges from the refreshed expense export", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const peruScotia = workspace.transactions.filter((item) => item.sourceId === "scotia-peru");

    expect(peruScotia).toHaveLength(39);
    expect(peruScotia.find((item) => item.description === "Larco")?.postedCadCents).toBe(1443);
    expect(peruScotia.find((item) => item.description === "Hopp")?.postedCadCents).toBe(1490);
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

  it("adds newly imported Peru charges to an existing workspace without changing matches", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const omittedIds = new Set([
      "scotia:peru:scotia-peru-jul26-larco",
      "scotia:peru:scotia-peru-jul27-hopp",
    ]);
    state.reconciliation.workspace = {
      ...workspace,
      transactions: workspace.transactions.filter((item) => !omittedIds.has(item.id)),
    };
    const existingGroupIds = state.reconciliation.workspace.matchGroups.map((group) => group.id);

    const repaired = ensureReconciliationWorkspace(state.reconciliation, state.expenses);

    expect(repaired.transactions.filter((item) => omittedIds.has(item.id))).toHaveLength(2);
    expect(repaired.matchGroups.map((group) => group.id)).toEqual(existingGroupIds);
    expect(repaired.auditEvents.some((item) => item.id === "audit-expense-export-2026-07-28")).toBe(true);
  });

  it("backfills the complete Portugal statement without changing existing matches", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const importedIds = new Set(
      workspace.transactions
        .filter((item) => item.tripId === "portugal"
          && item.sourceId === "scotia-portugal"
          && item.notes?.includes("Scotiabank CSV"))
        .map((item) => item.id),
    );
    state.reconciliation.workspace = {
      ...workspace,
      transactions: workspace.transactions.filter((item) => !importedIds.has(item.id)),
    };
    const existingGroupIds = state.reconciliation.workspace.matchGroups.map((group) => group.id);

    const repaired = ensureReconciliationWorkspace(state.reconciliation, state.expenses);

    expect(importedIds).toHaveLength(79);
    expect(repaired.transactions.filter((item) => importedIds.has(item.id))).toHaveLength(79);
    expect(repaired.matchGroups.map((group) => group.id)).toEqual(existingGroupIds);
    expect(repaired.auditEvents.some((item) => item.id === "audit-scotiabank-csv-2026-08-04")).toBe(true);
  });

  it("backfills Portugal euro cash as a separate statement-side source", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    state.reconciliation.workspace = {
      ...workspace,
      sources: workspace.sources.filter((item) => item.id !== "cash-portugal"),
      transactions: workspace.transactions.filter((item) => item.sourceId !== "cash-portugal"),
    };

    const repaired = ensureReconciliationWorkspace(state.reconciliation, state.expenses);
    const cash = repaired.transactions.find((item) => item.id === "cash:portugal:cash-portugal-euros");

    expect(cash?.postedCadCents).toBe(41129);
    expect(cash?.notes).toContain("€250");
    expect(repaired.sources.some((item) => item.id === "cash-portugal")).toBe(true);
    expect(repaired.auditEvents.some((item) => item.id === "audit-portugal-euro-cash-2026-08-04")).toBe(true);
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
    const leftId = candidate.leftIds[0];
    const rightId = candidate.rightIds[0];
    const isolated = {
      ...workspace,
      transactions: workspace.transactions
        .filter((item) => item.id === leftId || item.id === rightId)
        .map((item) => ({ ...item, postedDate: "2026-06-01" })),
      matchGroups: [],
    };
    const hasCandidate = (differenceCents: number) => {
      const shifted = {
        ...isolated,
        transactions: isolated.transactions.map((item) => item.id === rightId
          ? { ...item, postedCadCents: item.postedCadCents + differenceCents }
          : item),
      };
      return generateSuggestions(shifted, "new-york").some((item) => (
        item.leftIds[0] === leftId && item.rightIds[0] === rightId
      ));
    };

    expect(hasCandidate(50)).toBe(true);
    expect(hasCandidate(51)).toBe(false);
  });

  it("suggests exact CAD matches even when posting dates are more than 7 days apart", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const left = workspace.transactions.find((item) => item.tripId === "new-york" && item.side === "left")!;
    const right = workspace.transactions.find((item) => item.tripId === "new-york" && item.side === "right")!;
    const distantExact = {
      ...workspace,
      transactions: workspace.transactions.filter((item) => item.id === left.id || item.id === right.id).map((item) => {
        if (item.id === left.id) return { ...item, postedCadCents: 72_787, postedDate: "2026-06-16" };
        if (item.id === right.id) return { ...item, postedCadCents: 72_787, postedDate: "2026-05-28" };
        return item;
      }),
      matchGroups: [],
    };

    const suggestion = generateSuggestions(distantExact, "new-york").find((item) => (
      item.leftIds[0] === left.id && item.rightIds[0] === right.id
    ));

    expect(suggestion).toBeDefined();
    expect(suggestion?.differenceCents).toBe(0);
    expect(suggestion?.explanation).toContain("Exact CAD amount");
    expect(suggestion?.explanation).toContain("19 days apart");
  });

  it("surfaces the Portugal Air Transat and GetYourGuide exact-amount matches", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const suggestionIds = generateSuggestions(workspace, "portugal").map((item) => item.id);

    expect(suggestionIds).toContain(
      "suggestion:wl:portugal:e-pt-041:export:portugal:export-pt-2026-05-28-air-transat-return",
    );
    expect(suggestionIds).toContain(
      "suggestion:wl:portugal:e-pt-084:export:portugal:export-pt-2026-05-29-getyourguide",
    );
  });

  it("keeps the 7-day limit for non-exact amount suggestions", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const left = workspace.transactions.find((item) => item.tripId === "new-york" && item.side === "left")!;
    const right = workspace.transactions.find((item) => item.tripId === "new-york" && item.side === "right")!;
    const distantNearMatch = {
      ...workspace,
      transactions: workspace.transactions.filter((item) => item.id === left.id || item.id === right.id).map((item) => {
        if (item.id === left.id) return { ...item, postedCadCents: 10_000, postedDate: "2026-06-16" };
        if (item.id === right.id) return { ...item, postedCadCents: 10_050, postedDate: "2026-05-28" };
        return item;
      }),
      matchGroups: [],
    };

    expect(generateSuggestions(distantNearMatch, "new-york").some((item) => (
      item.leftIds[0] === left.id && item.rightIds[0] === right.id
    ))).toBe(false);
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
