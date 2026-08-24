import type {
  AppState,
  Expense,
  FinancialActivityEvent,
  FinancialMutation,
  Group,
} from "./types.js";
import {
  removeExpenseFromReconciliation,
  syncExpenseToReconciliation,
  tripIdForGroup,
} from "./reconciliation.js";
import { identityFx, normalizedCurrency } from "./utils/currency.js";
import { buildLedger, rawDebts, simplifyDebts } from "./utils/balances.js";

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
    const homeCurrency = normalizedCurrency(group.homeCurrency ?? state.defaultCurrency);
    if (expense.homeCurrency && normalizedCurrency(expense.homeCurrency) !== homeCurrency) throw new Error("Expense home currency must match its group.");
  }
  if (expense.originalAmountMinor != null && (!Number.isInteger(expense.originalAmountMinor) || expense.originalAmountMinor <= 0)) throw new Error("Original amount must be a positive number of minor units.");
  if (expense.fx && !/^\d+(?:\.\d+)?$/.test(expense.fx.rate)) throw new Error("Expense FX rate is invalid.");
}

function validateSettlementReferences(state: AppState, fromId: string, toId: string, groupId: string | null): void {
  const people = new Set(state.people.map((person) => person.id));
  if (fromId === toId || !people.has(fromId) || !people.has(toId)) throw new Error("Settlement participants are invalid.");
  if (groupId) {
    const group = state.groups.find((item) => item.id === groupId);
    if (!group || !group.memberIds.includes(fromId) || !group.memberIds.includes(toId)) throw new Error("Settlement participants do not belong to the group.");
  }
}

function validateGroupReferences(state: AppState, group: Group): void {
  const people = new Set(state.people.map((person) => person.id));
  if (!group.name.trim() || group.memberIds.length < 2 || new Set(group.memberIds).size !== group.memberIds.length || group.memberIds.some((id) => !people.has(id))) {
    throw new Error("Group members or name are invalid.");
  }
  if (group.type === "trip" && group.startDate && group.endDate && group.endDate < group.startDate) {
    throw new Error("Trip end date cannot be before its start date.");
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
    case "setTripStatus":
      return { id: `activity:${mutation.groupId}:status:${now}`, kind: mutation.status === "closed" ? "group-closed" : "group-reopened", actorPersonId, groupId: mutation.groupId, entityId: mutation.groupId, summary: mutation.status === "closed" ? "Closed the trip" : "Reopened the trip", createdAt: now };
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
      validateGroupReferences(state, mutation.group);
      next = { ...state, groups: [...state.groups, { ...mutation.group, homeCurrency: normalizedCurrency(mutation.group.homeCurrency ?? state.defaultCurrency), createdBy: actorPersonId }] };
      break;
    case "updateGroup": {
      const previous = state.groups.find((group) => group.id === mutation.group.id);
      if (!previous) throw new Error("Group was not found.");
      validateGroupReferences(state, mutation.group);
      const removedMemberIds = new Set(previous.memberIds.filter((personId) => !mutation.group.memberIds.includes(personId)));
      const removedMemberHasHistory = state.expenses.some((expense) =>
        expense.groupId === previous.id && expense.splits.some((split) => removedMemberIds.has(split.personId)),
      ) || state.settlements.some((settlement) =>
        settlement.groupId === previous.id && (removedMemberIds.has(settlement.fromId) || removedMemberIds.has(settlement.toId)),
      );
      if (removedMemberHasHistory) throw new Error("Members with expense or payment history cannot be removed from the group.");
      const hasFinancialHistory = state.expenses.some((expense) => expense.groupId === previous.id) || state.settlements.some((settlement) => settlement.groupId === previous.id);
      if (hasFinancialHistory && normalizedCurrency(mutation.group.homeCurrency) !== normalizedCurrency(previous.homeCurrency ?? state.defaultCurrency)) throw new Error("A group's home currency locks after its first expense or settlement.");
      const group = { ...mutation.group, homeCurrency: normalizedCurrency(mutation.group.homeCurrency ?? previous.homeCurrency ?? state.defaultCurrency), createdAt: previous.createdAt, createdBy: previous.createdBy };
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
      const groupCurrency = mutation.expense.groupId ? state.groups.find((group) => group.id === mutation.expense.groupId)?.homeCurrency : state.defaultCurrency;
      const homeCurrency = normalizedCurrency(mutation.expense.homeCurrency ?? groupCurrency);
      const originalCurrency = normalizedCurrency(mutation.expense.originalCurrency ?? homeCurrency);
      const expense = { ...mutation.expense, homeCurrency, originalCurrency, originalAmountMinor: mutation.expense.originalAmountMinor ?? mutation.expense.amount, fx: mutation.expense.fx ?? identityFx(originalCurrency, mutation.expense.date), createdBy: actorPersonId, updatedBy: actorPersonId, updatedAt: now };
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
      const expense = { ...mutation.expense, homeCurrency: mutation.expense.homeCurrency ?? previous.homeCurrency ?? normalizedCurrency(state.defaultCurrency), originalCurrency: mutation.expense.originalCurrency ?? previous.originalCurrency ?? normalizedCurrency(state.defaultCurrency), originalAmountMinor: mutation.expense.originalAmountMinor ?? previous.originalAmountMinor ?? mutation.expense.amount, fx: mutation.expense.fx ?? previous.fx ?? identityFx(normalizedCurrency(mutation.expense.originalCurrency ?? previous.originalCurrency), mutation.expense.date), createdAt: previous.createdAt, createdBy: previous.createdBy, updatedBy: actorPersonId, updatedAt: now };
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
      const settlementCurrency = mutation.settlement.groupId ? state.groups.find((group) => group.id === mutation.settlement.groupId)?.homeCurrency : state.defaultCurrency;
      next = { ...state, settlements: [...state.settlements, { ...mutation.settlement, currency: normalizedCurrency(mutation.settlement.currency ?? settlementCurrency), createdBy: actorPersonId, updatedBy: actorPersonId, updatedAt: now }] };
      break;
    }
    case "deleteSettlement":
      next = { ...state, settlements: state.settlements.filter((settlement) => settlement.id !== mutation.settlementId) };
      break;
    case "setTripStatus": {
      const group = state.groups.find((item) => item.id === mutation.groupId);
      if (!group) throw new Error("Group was not found.");
      if (group.type === "trip" && mutation.status === "closed") {
        const ledger = buildLedger(state, { groupId: group.id });
        const unsettled = (group.simplifyDebts ? simplifyDebts(ledger) : rawDebts(ledger)).length > 0;
        if (unsettled) throw new Error("Record or settle all repayments before closing this trip.");
      }
      const workspace = state.reconciliation.workspace;
      const tripId = tripIdForGroup(group.id);
      const period = workspace?.periods.find((item) => item.tripId === tripId);
      if (group.type === "trip" && mutation.status === "closed" && period?.status === "open") {
        const pending = workspace?.transactions.some((item) => item.tripId === tripId && !["reconciled", "excluded"].includes(item.status));
        if (pending && !mutation.allowUnreconciled) throw new Error("Resolve reconciliation or explicitly skip it before closing this trip.");
      }
      const nextWorkspace = workspace ? {
        ...workspace,
        periods: period ? workspace.periods.map((item) => item.tripId === tripId ? { ...item, status: mutation.status, closedAt: mutation.status === "closed" ? new Date(now).toISOString() : item.closedAt, reopenedAt: mutation.status === "open" ? new Date(now).toISOString() : item.reopenedAt } : item) : workspace.periods,
      } : undefined;
      next = {
        ...state,
        groups: state.groups.map((item) => item.id === group.id ? { ...item, status: mutation.status, closedAt: mutation.status === "closed" ? now : undefined } : item),
        reconciliation: nextWorkspace ? { ...state.reconciliation, workspace: nextWorkspace } : state.reconciliation,
      };
      break;
    }
    case "updateReconciliation":
      next = { ...state, reconciliation: mutation.reconciliation };
      break;
  }
  return appendActivity(next, eventFor(mutation, actorPersonId, now));
}
