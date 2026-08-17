import type {
  AppState,
  Expense,
  FinancialActivityEvent,
  FinancialMutation,
} from "./types.js";
import {
  removeExpenseFromReconciliation,
  syncExpenseToReconciliation,
} from "./reconciliation.js";

const ACTIVITY_LIMIT = 1_000;

export function isBalancedExpense(expense: Expense): boolean {
  if (!Number.isInteger(expense.amount) || expense.amount <= 0) return false;
  if (expense.splits.length < 2) return false;
  const participantIds = new Set(expense.splits.map((split) => split.personId));
  if (participantIds.size !== expense.splits.length) return false;
  if (expense.splits.some((split) => !Number.isInteger(split.owes) || !Number.isInteger(split.paid) || split.owes < 0 || split.paid < 0)) {
    return false;
  }
  const owed = expense.splits.reduce((sum, split) => sum + split.owes, 0);
  const paid = expense.splits.reduce((sum, split) => sum + split.paid, 0);
  return owed === expense.amount && paid === expense.amount;
}

function validateExpenseReferences(state: AppState, expense: Expense): void {
  const people = new Set(state.people.map((person) => person.id));
  if (expense.splits.some((split) => !people.has(split.personId))) throw new Error("Expense participant was not found.");
  if (expense.groupId) {
    const group = state.groups.find((item) => item.id === expense.groupId);
    if (!group) throw new Error("Expense group was not found.");
    if (expense.splits.some((split) => !group.memberIds.includes(split.personId))) throw new Error("Expense participant does not belong to the group.");
  }
}

function validateSettlementReferences(state: AppState, fromId: string, toId: string, groupId: string | null): void {
  const people = new Set(state.people.map((person) => person.id));
  if (fromId === toId || !people.has(fromId) || !people.has(toId)) throw new Error("Settlement participants are invalid.");
  if (groupId) {
    const group = state.groups.find((item) => item.id === groupId);
    if (!group || !group.memberIds.includes(fromId) || !group.memberIds.includes(toId)) throw new Error("Settlement participants do not belong to the group.");
  }
}

function validateGroupReferences(state: AppState, memberIds: string[], name: string): void {
  const people = new Set(state.people.map((person) => person.id));
  if (!name.trim() || memberIds.length < 2 || new Set(memberIds).size !== memberIds.length || memberIds.some((id) => !people.has(id))) {
    throw new Error("Group members or name are invalid.");
  }
}

function eventFor(
  mutation: FinancialMutation,
  actorPersonId: string,
  now: number,
): FinancialActivityEvent | null {
  switch (mutation.type) {
    case "addExpense":
      return { id: `activity:${mutation.expense.id}:created`, kind: "expense-created", actorPersonId, groupId: mutation.expense.groupId, entityId: mutation.expense.id, summary: `Added ${mutation.expense.description}`, createdAt: now };
    case "updateExpense":
    case "updateLinkedExpense":
      return { id: `activity:${mutation.expense.id}:updated:${now}`, kind: "expense-updated", actorPersonId, groupId: mutation.expense.groupId, entityId: mutation.expense.id, summary: `Updated ${mutation.expense.description}`, createdAt: now };
    case "deleteExpense":
      return { id: `activity:${mutation.expenseId}:deleted:${now}`, kind: "expense-deleted", actorPersonId, groupId: null, entityId: mutation.expenseId, summary: "Removed an expense", createdAt: now };
    case "addSettlement":
      return { id: `activity:${mutation.settlement.id}:created`, kind: "settlement-created", actorPersonId, groupId: mutation.settlement.groupId, entityId: mutation.settlement.id, summary: "Recorded a settlement", createdAt: now };
    case "deleteSettlement":
      return { id: `activity:${mutation.settlementId}:deleted:${now}`, kind: "settlement-deleted", actorPersonId, groupId: null, entityId: mutation.settlementId, summary: "Removed a settlement", createdAt: now };
    case "addGroup":
      return { id: `activity:${mutation.group.id}:created`, kind: "group-created", actorPersonId, groupId: mutation.group.id, entityId: mutation.group.id, summary: `Created ${mutation.group.name}`, createdAt: now };
    case "updateGroup": {
      const kind = mutation.group.status === "closed" ? "group-closed" : mutation.group.closedAt == null ? "group-reopened" : "group-updated";
      return { id: `activity:${mutation.group.id}:updated:${now}`, kind, actorPersonId, groupId: mutation.group.id, entityId: mutation.group.id, summary: `Updated ${mutation.group.name}`, createdAt: now };
    }
    case "deleteGroup":
    case "addPerson":
    case "updateReconciliation":
      return null;
  }
}

function appendActivity(state: AppState, event: FinancialActivityEvent | null): AppState {
  if (!event) return state;
  const existing = state.financialActivity ?? [];
  return { ...state, financialActivity: [...existing, event].slice(-ACTIVITY_LIMIT) };
}

export function applyFinancialMutation(
  state: AppState,
  mutation: FinancialMutation,
  actorPersonId: string,
  now = Date.now(),
): AppState {
  let next: AppState;
  switch (mutation.type) {
    case "addPerson":
      if (state.people.some((person) => person.id === mutation.person.id)) return state;
      next = { ...state, people: [...state.people, mutation.person] };
      break;
    case "addGroup":
      if (state.groups.some((group) => group.id === mutation.group.id)) return state;
      validateGroupReferences(state, mutation.group.memberIds, mutation.group.name);
      next = { ...state, groups: [...state.groups, { ...mutation.group, createdBy: actorPersonId }] };
      break;
    case "updateGroup": {
      const previous = state.groups.find((group) => group.id === mutation.group.id);
      if (!previous) throw new Error("Group was not found.");
      validateGroupReferences(state, mutation.group.memberIds, mutation.group.name);
      const group = { ...mutation.group, createdAt: previous.createdAt, createdBy: previous.createdBy };
      next = { ...state, groups: state.groups.map((item) => item.id === group.id ? group : item) };
      break;
    }
    case "deleteGroup": {
      const expenseIds = new Set(state.expenses.filter((expense) => expense.groupId === mutation.groupId).map((expense) => expense.id));
      const reconciliation = [...expenseIds].reduce(
        (current, expenseId) => removeExpenseFromReconciliation(current, expenseId),
        state.reconciliation,
      );
      next = {
        ...state,
        groups: state.groups.filter((group) => group.id !== mutation.groupId),
        expenses: state.expenses.filter((expense) => expense.groupId !== mutation.groupId),
        settlements: state.settlements.filter((settlement) => settlement.groupId !== mutation.groupId),
        reconciliation,
      };
      break;
    }
    case "addExpense": {
      if (!isBalancedExpense(mutation.expense)) throw new Error("Expense splits must balance exactly.");
      validateExpenseReferences(state, mutation.expense);
      if (state.expenses.some((expense) => expense.id === mutation.expense.id)) return state;
      const expense = { ...mutation.expense, createdBy: actorPersonId, updatedBy: actorPersonId, updatedAt: now };
      next = {
        ...state,
        expenses: [...state.expenses, expense],
        reconciliation: syncExpenseToReconciliation(state.reconciliation, expense, [...state.expenses, expense]),
      };
      break;
    }
    case "updateExpense": {
      if (!isBalancedExpense(mutation.expense)) throw new Error("Expense splits must balance exactly.");
      validateExpenseReferences(state, mutation.expense);
      const previous = state.expenses.find((expense) => expense.id === mutation.expense.id);
      if (!previous) throw new Error("Expense not found.");
      const expense = { ...mutation.expense, createdAt: previous.createdAt, createdBy: previous.createdBy, updatedBy: actorPersonId, updatedAt: now };
      next = {
        ...state,
        expenses: state.expenses.map((item) => item.id === expense.id ? expense : item),
        reconciliation: syncExpenseToReconciliation(state.reconciliation, expense, state.expenses),
      };
      break;
    }
    case "updateLinkedExpense": {
      if (!isBalancedExpense(mutation.expense)) throw new Error("Expense splits must balance exactly.");
      validateExpenseReferences(state, mutation.expense);
      const previous = state.expenses.find((expense) => expense.id === mutation.expense.id);
      if (!previous) throw new Error("Expense not found.");
      const expense = { ...mutation.expense, createdAt: previous.createdAt, createdBy: previous.createdBy, updatedBy: actorPersonId, updatedAt: now };
      next = {
        ...state,
        expenses: state.expenses.map((item) => item.id === expense.id ? expense : item),
        reconciliation: mutation.reconciliation,
      };
      break;
    }
    case "deleteExpense":
      next = {
        ...state,
        expenses: state.expenses.filter((expense) => expense.id !== mutation.expenseId),
        reconciliation: removeExpenseFromReconciliation(state.reconciliation, mutation.expenseId),
      };
      break;
    case "addSettlement": {
      if (!Number.isInteger(mutation.settlement.amount) || mutation.settlement.amount <= 0) throw new Error("Settlement amount must be a positive number of cents.");
      validateSettlementReferences(state, mutation.settlement.fromId, mutation.settlement.toId, mutation.settlement.groupId);
      if (state.settlements.some((settlement) => settlement.id === mutation.settlement.id)) return state;
      next = { ...state, settlements: [...state.settlements, { ...mutation.settlement, createdBy: actorPersonId, updatedBy: actorPersonId, updatedAt: now }] };
      break;
    }
    case "deleteSettlement":
      next = { ...state, settlements: state.settlements.filter((settlement) => settlement.id !== mutation.settlementId) };
      break;
    case "updateReconciliation":
      next = { ...state, reconciliation: mutation.reconciliation };
      break;
  }
  return appendActivity(next, eventFor(mutation, actorPersonId, now));
}
