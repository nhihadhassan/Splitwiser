import { describe, expect, it } from "vitest";
import { applyFinancialMutation, isBalancedExpense } from "./domain";
import { cancelQueuedExpenseCreate, replayOfflineOutbox } from "./offline";
import { seedState } from "./seed";
import type { Expense, MutationCommand, SplitMethod } from "./types";

function expense(method: SplitMethod, owes: number[], payer = 0): Expense {
  return {
    id: `expense-${method}`,
    description: `${method} example`,
    amount: 10_001,
    category: "food",
    date: "2027-03-01",
    groupId: "group-coast",
    splitMethod: method,
    splits: ["me", "person-sam", "person-jules"].map((personId, index) => ({
      personId,
      owes: owes[index],
      paid: index === payer ? 10_001 : 0,
    })),
    createdAt: 1_804_000_000_000,
    createdBy: "me",
  };
}

describe("financial mutation invariants", () => {
  it.each([
    ["equally", [3_334, 3_334, 3_333]],
    ["exact", [5_001, 3_000, 2_000]],
    ["percentage", [5_000, 3_000, 2_001]],
    ["shares", [1_667, 3_334, 5_000]],
    ["adjustment", [4_000, 4_000, 2_001]],
  ] as Array<[SplitMethod, number[]]>) ("accepts exact cent totals for %s splits", (method, owes) => {
    expect(isBalancedExpense(expense(method, owes))).toBe(true);
  });

  it("keeps payer and owed share independent", () => {
    const item = expense("exact", [5_001, 3_000, 2_000], 2);
    expect(item.splits[2].paid).toBe(item.amount);
    expect(item.splits[2].owes).toBe(2_000);
    expect(isBalancedExpense(item)).toBe(true);
  });

  it("rejects fractional cents and unbalanced paid or owed totals", () => {
    const invalid = expense("exact", [5_001, 3_000, 1_999]);
    expect(isBalancedExpense(invalid)).toBe(false);
    invalid.splits[2].owes = 2_000;
    invalid.splits[0].paid = 10_000.5;
    expect(isBalancedExpense(invalid)).toBe(false);
  });

  it("rejects unknown or cross-group expense participants", () => {
    const state = seedState();
    const item = expense("equally", [3_334, 3_334, 3_333]);
    item.splits[2].personId = "unknown-person";
    expect(() => applyFinancialMutation(state, { type: "addExpense", expense: item }, "me")).toThrow(/participant/i);
    const cabin = { ...expense("equally", [5_001, 5_000, 0]), id: "expense-cross-group", groupId: "group-cabin", splits: expense("equally", [5_001, 5_000, 0]).splits.slice(0, 2) };
    cabin.splits[0].owes = 5_001;
    cabin.splits[1].owes = 5_000;
    cabin.splits[0].paid = 10_001;
    expect(() => applyFinancialMutation(state, { type: "addExpense", expense: cabin }, "me")).not.toThrow();
    cabin.splits[1].personId = "person-jules";
    expect(() => applyFinancialMutation(state, { type: "addExpense", expense: { ...cabin, id: "expense-cross-group-invalid" } }, "me")).toThrow(/belong/i);
  });

  it("records update metadata and a financial activity event", () => {
    const state = seedState();
    const item = expense("equally", [3_334, 3_334, 3_333], 1);
    const next = applyFinancialMutation(state, { type: "addExpense", expense: item }, "person-sam", 1_804_100_000_000);
    const activity = next.financialActivity ?? [];
    expect(next.expenses.find((entry) => entry.id === item.id)).toMatchObject({ createdBy: "person-sam", updatedBy: "person-sam" });
    expect(activity[activity.length - 1]).toMatchObject({ kind: "expense-created", actorPersonId: "person-sam", entityId: item.id });
  });

  it("replays an offline outbox in order", () => {
    const state = seedState();
    const item = expense("equally", [3_334, 3_334, 3_333]);
    const commands: MutationCommand[] = [
      { id: "command-create", baseRevision: 0, createdAt: 1_804_000_000_000, mutation: { type: "addExpense", expense: item } },
      { id: "command-delete", baseRevision: 1, createdAt: 1_804_000_008_000, mutation: { type: "deleteExpense", expenseId: item.id } },
    ];
    const next = replayOfflineOutbox(state, commands, "me");
    expect(next.expenses.some((entry) => entry.id === item.id)).toBe(false);
    expect(next.financialActivity?.map((event) => event.kind)).toEqual(["expense-created", "expense-deleted"]);
  });

  it("cancels a queued offline expense create before sync", () => {
    const item = expense("equally", [3_334, 3_334, 3_333]);
    const commands: MutationCommand[] = [{ id: "queued-create", baseRevision: 0, createdAt: 1, mutation: { type: "addExpense", expense: item } }];
    expect(cancelQueuedExpenseCreate(commands, "queued-create")).toEqual({ commands: [], expenseId: item.id });
    expect(cancelQueuedExpenseCreate(commands, "missing").commands).toBe(commands);
  });
});
