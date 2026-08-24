import { describe, expect, it } from "vitest";
import { createReconciliationWorkspace, resizeExpenseAmount } from "./reconciliation";
import { seedState } from "./seed";
import { canFlushCloudQueue, reducer, shouldAutoFlushCloudQueue } from "./store";

describe("linked expense updates", () => {
  it("keeps a resized expense balanced and synchronized with reconciliation", () => {
    const state = seedState();
    state.reconciliation.workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const current = state.expenses.find((item) => item.id === "expense-coast-lodge")!;
    const resized = resizeExpenseAmount(current, 51_300);
    const updated = reducer(state, { type: "updateExpense", expense: resized });
    const transaction = updated.reconciliation.workspace!.transactions.find((item) => item.reference === resized.id)!;

    expect(resized.splits.reduce((sum, split) => sum + split.owes, 0)).toBe(51_300);
    expect(resized.splits.reduce((sum, split) => sum + split.paid, 0)).toBe(51_300);
    expect(transaction.postedCadCents).toBe(51_300);
  });

  it("adds and removes a group expense from reconciliation immediately", () => {
    const state = seedState();
    state.reconciliation.workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const template = state.expenses.find((item) => item.id === "expense-coast-kayaks")!;
    const excursion = { ...resizeExpenseAmount(template, 9_900), id: "expense-coast-excursion", description: "Clifftop excursion", createdAt: Date.now() };

    const added = reducer(state, { type: "addExpense", expense: excursion });
    const linked = added.reconciliation.workspace!.transactions.find((item) => item.reference === excursion.id);
    expect(linked).toMatchObject({ description: "Clifftop excursion", postedCadCents: 9_900, side: "left", status: "unmatched" });

    const removed = reducer(added, { type: "deleteExpense", expenseId: excursion.id });
    expect(removed.expenses.some((item) => item.id === excursion.id)).toBe(false);
    expect(removed.reconciliation.workspace!.transactions.some((item) => item.reference === excursion.id)).toBe(false);
  });
});

describe("cloud queue readiness", () => {
  it("releases restored offline changes once the authenticated session arrives", () => {
    const restoredQueue = {
      localOnly: false,
      hasTokenProvider: true,
      isFlushing: false,
      pendingCount: 1,
    };

    expect(canFlushCloudQueue({ ...restoredQueue, hasSession: false })).toBe(false);
    expect(canFlushCloudQueue({ ...restoredQueue, hasSession: true })).toBe(true);
  });

  it("does not start a duplicate worker while a save is already running", () => {
    expect(canFlushCloudQueue({
      localOnly: false,
      hasTokenProvider: true,
      isFlushing: true,
      pendingCount: 2,
      hasSession: true,
    })).toBe(false);
  });

  it("waits for an explicit retry after a failed or conflicting save", () => {
    expect(shouldAutoFlushCloudQueue("saving")).toBe(true);
    expect(shouldAutoFlushCloudQueue("error")).toBe(false);
    expect(shouldAutoFlushCloudQueue("conflict")).toBe(false);
  });
});
