import { describe, expect, it } from "vitest";
import { createReconciliationWorkspace, resizeExpenseAmount } from "./reconciliation";
import { seedState } from "./seed";
import {
  applyGreenHeartPaymentMigration,
  GREEN_HEART_PAYMENT_MIGRATION,
  reducer,
} from "./store";

describe("linked expense migrations", () => {
  it("updates saved Green Heart data in both the group expense and reconciliation workspace", () => {
    const state = seedState();
    const current = state.expenses.find((item) => item.id === "e-pt-049")!;
    const oldExpense = { ...resizeExpenseAmount(current, 41626), notes: undefined };
    state.expenses = state.expenses.map((item) => item.id === oldExpense.id ? oldExpense : item);
    state.reconciliation.workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);

    const migrated = applyGreenHeartPaymentMigration(state);
    const expense = migrated.expenses.find((item) => item.id === "e-pt-049")!;
    const transaction = migrated.reconciliation.workspace!.transactions.find(
      (item) => item.id === "wl:portugal:e-pt-049",
    )!;

    expect(expense.amount).toBe(45500);
    expect(expense.notes).toContain("Hostelworld and Green Heart Hostel");
    expect(expense.splits.reduce((sum, split) => sum + split.owes, 0)).toBe(45500);
    expect(transaction.postedCadCents).toBe(45500);
    expect(migrated.dataMigrations).toContain(GREEN_HEART_PAYMENT_MIGRATION);
    expect(applyGreenHeartPaymentMigration(migrated)).toBe(migrated);
  });

  it("adds and removes a Portugal expense from Wanderlog reconciliation immediately", () => {
    const state = seedState();
    state.reconciliation.workspace = createReconciliationWorkspace(state.reconciliation, state.expenses);
    const template = state.expenses.find((item) => item.id === "e-pt-069")!;
    const sintraDayTrip = {
      ...resizeExpenseAmount(template, 9900),
      id: "expense-sintra-day-trip",
      description: "Sintra day trip",
      date: "2026-06-19",
      createdAt: Date.now(),
    };

    const added = reducer(state, { type: "addExpense", expense: sintraDayTrip });
    const linkedId = "wl:portugal:expense-sintra-day-trip";
    const linked = added.reconciliation.workspace!.transactions.find((item) => item.id === linkedId);

    expect(added.expenses).toContainEqual(sintraDayTrip);
    expect(linked).toMatchObject({
      description: "Sintra day trip",
      postedCadCents: 9900,
      side: "left",
      accountType: "wanderlog",
      status: "unmatched",
    });

    const removed = reducer(added, { type: "deleteExpense", expenseId: sintraDayTrip.id });
    expect(removed.expenses.some((item) => item.id === sintraDayTrip.id)).toBe(false);
    expect(removed.reconciliation.workspace!.transactions.some((item) => item.id === linkedId)).toBe(false);
  });
});
