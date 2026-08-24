import type {
  AppState,
  AuthorizedSnapshot,
  CapabilitySet,
  FinancialMutation,
  MutationCommand,
  ReconciliationState,
  SessionProfile,
  WorkspaceEnvelopeV3,
} from "../../src/types.js";
import { HttpError } from "./http.js";

const MEMBER_CAPABILITIES: CapabilitySet = {
  manageInvites: false,
  manageAllGroups: false,
  reconcile: false,
  moderateSocial: false,
};

const OWNER_CAPABILITIES: CapabilitySet = {
  manageInvites: true,
  manageAllGroups: true,
  reconcile: true,
  moderateSocial: true,
};

export function sessionFor(envelope: WorkspaceEnvelopeV3, accountId: string): SessionProfile {
  const link = envelope.accountLinks.find((item) => item.accountId === accountId && item.status === "active");
  if (!link) throw new HttpError(403, "This account does not have access to Splitwiser.");
  const person = envelope.state.people.find((item) => item.id === link.personId);
  if (!person) throw new HttpError(403, "This account is not linked to a valid person.");
  return {
    accountId,
    personId: person.id,
    role: link.role,
    displayName: person.name,
    capabilities: link.role === "owner" ? OWNER_CAPABILITIES : MEMBER_CAPABILITIES,
  };
}

export function canAccessExpense(envelope: WorkspaceEnvelopeV3, session: SessionProfile, expenseId: string): boolean {
  const expense = envelope.state.expenses.find((item) => item.id === expenseId);
  if (!expense) return false;
  if (session.role === "owner") return true;
  if (expense.groupId) {
    return envelope.state.groups.some((group) => group.id === expense.groupId && group.memberIds.includes(session.personId));
  }
  return expense.splits.some((split) => split.personId === session.personId);
}

function emptyReconciliation(): ReconciliationState {
  return {
    decisions: {},
    matches: {},
    cashRemaining: "",
    cashTransactions: [],
    secondaryCashTransactions: [],
    cardTransactions: {},
    exportTransactions: {},
  };
}

export function authorizedSnapshot(
  envelope: WorkspaceEnvelopeV3,
  session: SessionProfile,
): AuthorizedSnapshot {
  if (session.role === "owner") {
    return {
      version: 3,
      revision: envelope.revision,
      updatedAt: envelope.updatedAt,
      session,
      state: envelope.state,
    };
  }

  const groupIds = new Set(
    envelope.state.groups
      .filter((group) => group.memberIds.includes(session.personId))
      .map((group) => group.id),
  );
  const personIds = new Set<string>([session.personId]);
  envelope.state.groups.forEach((group) => {
    if (groupIds.has(group.id)) group.memberIds.forEach((personId) => personIds.add(personId));
  });
  envelope.state.expenses.forEach((expense) => {
    if (expense.groupId === null && expense.splits.some((split) => split.personId === session.personId)) {
      expense.splits.forEach((split) => personIds.add(split.personId));
    }
  });
  envelope.state.settlements.forEach((settlement) => {
    if (settlement.groupId === null && (settlement.fromId === session.personId || settlement.toId === session.personId)) {
      personIds.add(settlement.fromId);
      personIds.add(settlement.toId);
    }
  });
  const state: AppState = {
    people: envelope.state.people.filter((person) => personIds.has(person.id)),
    groups: envelope.state.groups.filter((group) => groupIds.has(group.id)),
    expenses: envelope.state.expenses.filter((expense) =>
      expense.groupId ? groupIds.has(expense.groupId) : expense.splits.some((split) => split.personId === session.personId),
    ),
    settlements: envelope.state.settlements.filter((settlement) =>
      settlement.groupId ? groupIds.has(settlement.groupId) : settlement.fromId === session.personId || settlement.toId === session.personId,
    ),
    reconciliation: emptyReconciliation(),
    dataMigrations: envelope.state.dataMigrations,
    financialActivity: envelope.state.financialActivity?.filter((event) =>
      event.groupId ? groupIds.has(event.groupId) : event.actorPersonId === session.personId,
    ),
  };
  return { version: 3, revision: envelope.revision, updatedAt: envelope.updatedAt, session, state };
}

function financialGroupIdsForMutation(state: AppState, mutation: FinancialMutation): Array<string | null | undefined> {
  switch (mutation.type) {
    case "addExpense":
      return [mutation.expense.groupId];
    case "updateExpense":
    case "updateLinkedExpense":
      return [state.expenses.find((expense) => expense.id === mutation.expense.id)?.groupId, mutation.expense.groupId];
    case "deleteExpense":
      return [state.expenses.find((expense) => expense.id === mutation.expenseId)?.groupId];
    case "addSettlement":
      return [mutation.settlement.groupId];
    case "deleteSettlement":
      return [state.settlements.find((settlement) => settlement.id === mutation.settlementId)?.groupId];
    default:
      return [];
  }
}

export function authorizeMutation(
  envelope: WorkspaceEnvelopeV3,
  session: SessionProfile,
  command: MutationCommand,
): void {
  const mutation = command.mutation;
  if (session.role === "owner") {
    const ownerGroupIds = financialGroupIdsForMutation(envelope.state, mutation);
    if (ownerGroupIds.some((groupId) => groupId === undefined)) throw new HttpError(404, "Financial item was not found.");
    for (const ownerGroupId of new Set(ownerGroupIds.filter((groupId): groupId is string => typeof groupId === "string"))) {
      const group = envelope.state.groups.find((item) => item.id === ownerGroupId);
      if (!group) throw new HttpError(404, "Group was not found.");
      if (group.status === "closed") throw new HttpError(409, "This group is closed and read-only.");
    }
    return;
  }
  if (mutation.type === "addPerson" || mutation.type === "addGroup" || mutation.type === "updateGroup" || mutation.type === "deleteGroup" || mutation.type === "setTripStatus" || mutation.type === "updateReconciliation" || mutation.type === "updateLinkedExpense") {
    throw new HttpError(403, "Only the owner can make this change.");
  }
  const financialGroupIds = financialGroupIdsForMutation(envelope.state, mutation);
  if (financialGroupIds.some((groupId) => groupId === undefined)) throw new HttpError(404, "Financial item was not found.");
  const stringGroupIds = new Set(financialGroupIds.filter((groupId): groupId is string => typeof groupId === "string"));
  for (const groupId of stringGroupIds) {
    const group = envelope.state.groups.find((item) => item.id === groupId);
    if (!group || !group.memberIds.includes(session.personId)) throw new HttpError(403, "You are not a member of this group.");
    if (group.status === "closed") throw new HttpError(409, "This group is closed and read-only.");
  }
  if (financialGroupIds.includes(null)) {
    if (mutation.type === "addSettlement") {
      const { fromId, toId } = mutation.settlement;
      if (fromId !== session.personId && toId !== session.personId) throw new HttpError(403, "You cannot change this settlement.");
    }
    if (mutation.type === "deleteSettlement") {
      const settlement = envelope.state.settlements.find((item) => item.id === mutation.settlementId);
      if (!settlement || (settlement.fromId !== session.personId && settlement.toId !== session.personId)) {
        throw new HttpError(403, "You cannot change this settlement.");
      }
    }
    const existingExpense = mutation.type === "deleteExpense"
      ? envelope.state.expenses.find((item) => item.id === mutation.expenseId)
      : mutation.type === "updateExpense"
        ? envelope.state.expenses.find((item) => item.id === mutation.expense.id)
        : undefined;
    const submittedExpense = mutation.type === "addExpense" || mutation.type === "updateExpense" ? mutation.expense : undefined;
    for (const expense of [existingExpense, submittedExpense].filter((item): item is NonNullable<typeof item> => Boolean(item))) {
      if (!expense.splits.some((split) => split.personId === session.personId)) throw new HttpError(403, "You cannot change this financial item.");
      if (expense.splits.some((split) => !envelope.state.people.some((person) => person.id === split.personId))) throw new HttpError(400, "Expense participant was not found.");
    }
  }
  if (mutation.type === "addExpense" || mutation.type === "updateExpense") {
    const targetGroup = mutation.expense.groupId ? envelope.state.groups.find((group) => group.id === mutation.expense.groupId) : null;
    if (targetGroup && mutation.expense.splits.some((split) => !targetGroup.memberIds.includes(split.personId))) {
      throw new HttpError(400, "Every expense participant must belong to the group.");
    }
  }
}
