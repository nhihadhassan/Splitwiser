import { describe, expect, it } from "vitest";
import { seedState } from "./seed";
import type { ReconciliationTransaction, ReconciliationWorkspace } from "./types";
import {
  cashSummary,
  createReconciliationWorkspace,
  ensureReconciliationWorkspace,
  generateSuggestions,
  normalizeSearch,
  previewDelimitedImport,
  reconciliationTotals,
} from "./reconciliation";

interface MatchFixtureRow {
  id: string;
  amountCents: number;
  date: string;
  description: string;
  reference?: string;
}

function matchingFixture(leftRows: MatchFixtureRow[], rightRows: MatchFixtureRow[]): ReconciliationWorkspace {
  const state = seedState();
  const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
  const create = (side: "left" | "right", row: MatchFixtureRow): ReconciliationTransaction => {
    const template = workspace.transactions.find((item) => item.tripId === "new-york" && item.side === side)!;
    const sourceId = side === "left" ? "wanderlog-new-york" : "scotia-new-york";
    return {
      ...template,
      id: row.id,
      sourceId,
      side,
      accountType: side === "left" ? "wanderlog" : "card",
      date: row.date,
      postedDate: row.date,
      description: row.description,
      reference: row.reference ?? "",
      originalAmountCents: row.amountCents,
      postedCadCents: row.amountCents,
      status: "unmatched",
      normalizedText: normalizeSearch([row.date, row.description, row.reference ?? "", row.amountCents].join(" ")),
      duplicateFingerprint: row.id,
      raw: { detail: row.reference ?? "" },
      notes: row.reference,
    };
  };
  return {
    ...workspace,
    transactions: [
      ...leftRows.map((row) => create("left", row)),
      ...rightRows.map((row) => create("right", row)),
    ],
    matchGroups: [],
    exceptions: [],
    rules: workspace.rules.map((rule) => ({ ...rule, enabled: true, tripId: "new-york" })),
  };
}

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
      .toBe(0);
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

  it("only suggests non-exact amounts when the Wanderlog entry looks deliberately rounded", () => {
    const nonRounded = matchingFixture(
      [{ id: "left-regua", amountCents: 1_253, date: "2026-06-22", description: "Regua" }],
      [{ id: "right-colada", amountCents: 1_302, date: "2026-06-21", description: "Pina Colada" }],
    );
    const roundedDollar = matchingFixture(
      [{ id: "left-dollar", amountCents: 1_300, date: "2026-06-22", description: "Dinner" }],
      [{ id: "right-dollar", amountCents: 1_302, date: "2026-06-21", description: "Dinner" }],
    );
    const roundedHalfDollar = matchingFixture(
      [{ id: "left-half", amountCents: 1_250, date: "2026-06-22", description: "Dinner" }],
      [{ id: "right-half", amountCents: 1_253, date: "2026-06-21", description: "Dinner" }],
    );
    const roundedDownDollar = matchingFixture(
      [{ id: "left-down", amountCents: 1_200, date: "2026-06-22", description: "Dinner" }],
      [{ id: "right-down", amountCents: 1_253, date: "2026-06-21", description: "Dinner" }],
    );

    expect(generateSuggestions(nonRounded, "new-york")).toHaveLength(0);
    expect(generateSuggestions(roundedDollar, "new-york")).toHaveLength(1);
    expect(generateSuggestions(roundedHalfDollar, "new-york")).toHaveLength(1);
    expect(generateSuggestions(roundedDownDollar, "new-york")).toHaveLength(1);
    expect(generateSuggestions(roundedDollar, "new-york")[0].explanation).toContain("CA$0.02 difference");
    expect(generateSuggestions(roundedDollar, "new-york")[0].explanation.join(" ")).not.toContain("tolerance");
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

  it("keeps the 7-day limit for rounded amount suggestions", () => {
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

  it("prioritizes an exact amount over a stronger merchant near-match", () => {
    const workspace = matchingFixture(
      [{ id: "left-alpha", amountCents: 1_000, date: "2026-06-10", description: "Alpha Cafe" }],
      [
        { id: "right-exact", amountCents: 1_000, date: "2026-06-10", description: "Different Merchant" },
        { id: "right-near", amountCents: 995, date: "2026-06-10", description: "Alpha Café" },
      ],
    );

    const suggestion = generateSuggestions(workspace, "new-york")[0];

    expect(suggestion.rightIds).toEqual(["right-exact"]);
    expect(suggestion.explanation).toContain("Exact CAD amount");
  });

  it("uses accent-insensitive merchant similarity for the strongest global assignment", () => {
    const workspace = matchingFixture(
      [
        { id: "left-cafe", amountCents: 488, date: "2026-06-22", description: "Cafe Santiago Porto" },
        { id: "left-nata", amountCents: 488, date: "2026-06-22", description: "Pasteis de Belem" },
      ],
      [
        { id: "right-cafe", amountCents: 488, date: "2026-06-22", description: "Café Santiago" },
        { id: "right-nata", amountCents: 488, date: "2026-06-22", description: "Pastéis de Belém Lisboa" },
      ],
    );

    const pairs = generateSuggestions(workspace, "new-york")
      .map((item) => `${item.leftIds[0]}|${item.rightIds[0]}`);

    expect(pairs).toContain("left-cafe|right-cafe");
    expect(pairs).toContain("left-nata|right-nata");
  });

  it("never reuses a transaction when duplicate amounts have several candidates", () => {
    const state = seedState();
    const workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const ids = generateSuggestions(workspace, "portugal").flatMap((item) => [...item.leftIds, ...item.rightIds]);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses the enabled workspace rule and stops when matching is disabled", () => {
    const workspace = matchingFixture(
      [{ id: "left-rule", amountCents: 1_000, date: "2026-06-10", description: "Rule Cafe" }],
      [{ id: "right-rule", amountCents: 1_010, date: "2026-06-12", description: "Rule Cafe" }],
    );
    const strict = {
      ...workspace,
      rules: workspace.rules.map((rule) => ({ ...rule, dateToleranceDays: 2 })),
    };
    const tooStrict = {
      ...strict,
      rules: strict.rules.map((rule) => ({ ...rule, dateToleranceDays: 1 })),
    };
    const disabled = {
      ...strict,
      rules: strict.rules.map((rule) => ({ ...rule, enabled: false })),
    };

    expect(generateSuggestions(strict, "new-york")).toHaveLength(1);
    expect(generateSuggestions(tooStrict, "new-york")).toHaveLength(0);
    expect(generateSuggestions(disabled, "new-york")).toHaveLength(0);
  });

  it("excludes unresolved exceptions and non-unmatched transactions", () => {
    const workspace = matchingFixture(
      [
        { id: "left-exception", amountCents: 1_000, date: "2026-06-10", description: "Exception Cafe" },
        { id: "left-excluded", amountCents: 2_000, date: "2026-06-10", description: "Excluded Cafe" },
      ],
      [
        { id: "right-exception", amountCents: 1_000, date: "2026-06-10", description: "Exception Cafe" },
        { id: "right-excluded", amountCents: 2_000, date: "2026-06-10", description: "Excluded Cafe" },
      ],
    );
    const guarded = {
      ...workspace,
      transactions: workspace.transactions.map((item) => item.id === "left-excluded" ? { ...item, status: "excluded" as const } : item),
      exceptions: [{
        id: "exception-open",
        tripId: "new-york" as const,
        transactionIds: ["left-exception"],
        reason: "other" as const,
        note: "Needs review",
        amountCents: 1_000,
        resolved: false,
        createdAt: "2026-06-10T00:00:00.000Z",
      }],
    };

    expect(generateSuggestions(guarded, "new-york")).toHaveLength(0);
  });

  it("suggests bounded exact-total 1-to-many and many-to-1 groups", () => {
    const oneToMany = matchingFixture(
      [{ id: "left-total", amountCents: 1_000, date: "2026-06-10", description: "Shared dinner" }],
      [
        { id: "right-part-a", amountCents: 400, date: "2026-06-09", description: "Dinner deposit" },
        { id: "right-part-b", amountCents: 600, date: "2026-06-10", description: "Dinner balance" },
      ],
    );
    const manyToOne = matchingFixture(
      [
        { id: "left-part-a", amountCents: 400, date: "2026-06-09", description: "Tour deposit" },
        { id: "left-part-b", amountCents: 600, date: "2026-06-10", description: "Tour balance" },
      ],
      [{ id: "right-total", amountCents: 1_000, date: "2026-06-10", description: "Tour company" }],
    );
    const oneToThree = matchingFixture(
      [{ id: "left-three-total", amountCents: 1_000, date: "2026-06-10", description: "Three-part booking" }],
      [
        { id: "right-three-a", amountCents: 200, date: "2026-06-09", description: "Booking deposit" },
        { id: "right-three-b", amountCents: 300, date: "2026-06-10", description: "Booking installment" },
        { id: "right-three-c", amountCents: 500, date: "2026-06-11", description: "Booking balance" },
      ],
    );
    const threeToOne = matchingFixture(
      [
        { id: "left-three-a", amountCents: 200, date: "2026-06-09", description: "Stay deposit" },
        { id: "left-three-b", amountCents: 300, date: "2026-06-10", description: "Stay installment" },
        { id: "left-three-c", amountCents: 500, date: "2026-06-11", description: "Stay balance" },
      ],
      [{ id: "right-three-total", amountCents: 1_000, date: "2026-06-10", description: "Hotel stay" }],
    );

    expect(generateSuggestions(oneToMany, "new-york").some((item) => item.matchType === "1 ↔ 2")).toBe(true);
    expect(generateSuggestions(manyToOne, "new-york").some((item) => item.matchType === "2 ↔ 1")).toBe(true);
    expect(generateSuggestions(oneToThree, "new-york").some((item) => item.matchType === "1 ↔ 3")).toBe(true);
    expect(generateSuggestions(threeToOne, "new-york").some((item) => item.matchType === "3 ↔ 1")).toBe(true);
  });

  it("rejects unsafe grouped totals, wide date clusters, groups over three, and many-to-many", () => {
    const approximate = matchingFixture(
      [{ id: "left-total", amountCents: 1_000, date: "2026-06-10", description: "Total" }],
      [
        { id: "right-a", amountCents: 400, date: "2026-06-10", description: "Part A" },
        { id: "right-b", amountCents: 601, date: "2026-06-10", description: "Part B" },
      ],
    );
    const wide = matchingFixture(
      [{ id: "left-wide", amountCents: 1_000, date: "2026-06-10", description: "Wide" }],
      [
        { id: "right-wide-a", amountCents: 400, date: "2026-06-08", description: "Part A" },
        { id: "right-wide-b", amountCents: 600, date: "2026-06-12", description: "Part B" },
      ],
    );
    const fourParts = matchingFixture(
      [{ id: "left-four", amountCents: 1_000, date: "2026-06-10", description: "Four" }],
      [1, 2, 3, 4].map((index) => ({ id: `right-four-${index}`, amountCents: 250, date: "2026-06-10", description: `Part ${index}` })),
    );
    const manyToMany = matchingFixture(
      [
        { id: "left-mm-a", amountCents: 400, date: "2026-06-10", description: "Left A" },
        { id: "left-mm-b", amountCents: 600, date: "2026-06-10", description: "Left B" },
      ],
      [
        { id: "right-mm-a", amountCents: 300, date: "2026-06-10", description: "Right A" },
        { id: "right-mm-b", amountCents: 700, date: "2026-06-10", description: "Right B" },
      ],
    );

    expect(generateSuggestions(approximate, "new-york")).toHaveLength(0);
    expect(generateSuggestions(wide, "new-york")).toHaveLength(0);
    expect(generateSuggestions(fourParts, "new-york")).toHaveLength(0);
    expect(generateSuggestions(manyToMany, "new-york")).toHaveLength(0);
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
