import { describe, expect, it } from "vitest";
import { createReconciliationWorkspace, resizeExpenseAmount } from "./reconciliation";
import { seedState } from "./seed";
import {
  applyGreenHeartPaymentMigration,
  GREEN_HEART_PAYMENT_MIGRATION,
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
});
