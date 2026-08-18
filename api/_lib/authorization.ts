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

function groupForMutation(state: AppState, mutation: FinancialMutation): string | null | undefined {
  switch (mutation.type) {
    case "addExpense":
    case "updateExpense":
    case "updateLinkedExpense":
      return mutation.expense.groupId;
    case "deleteExpense":
      return state.expenses.find((expense) => expense.id === mutation.expenseId)?.groupId;
    case "addSettlement":
      return mutation.settlement.groupId;
    case "deleteSettlement":
      return state.settlements.find((settlement) => settlement.id === mutation.settlementId)?.groupId;
    case "addGroup":
    case "updateGroup":
      return mutation.group.id;
    case "deleteGroup":
      return mutation.groupId;
    case "setTripStatus":
      return mutation.groupId;
    case "addPerson":
    case "updateReconciliation":
      return undefined;
  }
}

export function authorizeMutation(
  envelope: WorkspaceEnvelopeV3,
  session: SessionProfile,
  command: MutationCommand,
): void {
  const mutation = command.mutation;
  if (session.role === "owner") {
    const ownerGroupId = groupForMutation(envelope.state, mutation);
    if (typeof ownerGroupId === "string") {
      const group = envelope.state.groups.find((item) => item.id === ownerGroupId);
      const isFinancialMutation = mutation.type === "addExpense" || mutation.type === "updateExpense" || mutation.type === "updateLinkedExpense" || mutation.type === "deleteExpense" || mutation.type === "addSettlement" || mutation.type === "deleteSettlement";
      if (isFinancialMutation && group?.status === "closed") throw new HttpError(409, "This group is closed and read-only.");
    }
    return;
  }
  if (mutation.type === "addPerson" || mutation.type === "addGroup" || mutation.type === "updateGroup" || mutation.type === "deleteGroup" || mutation.type === "setTripStatus" || mutation.type === "updateReconciliation" || mutation.type === "updateLinkedExpense") {
    throw new HttpError(403, "Only the owner can make this change.");
  }
  const groupId = groupForMutation(envelope.state, mutation);
  if (groupId === undefined) throw new HttpError(404, "Financial item was not found.");
  if (groupId === null) {
    if (mutation.type === "addSettlement") {
      const { fromId, toId } = mutation.settlement;
      if (fromId !== session.personId && toId !== session.personId) throw new HttpError(403, "You cannot change this settlement.");
      return;
    }
    const expense = mutation.type === "deleteExpense"
      ? envelope.state.expenses.find((item) => item.id === mutation.expenseId)
      : mutation.type === "addExpense" || mutation.type === "updateExpense" ? mutation.expense : undefined;
    if (expense?.splits.some((split) => split.personId === session.personId)) {
      if (expense.splits.some((split) => !envelope.state.people.some((person) => person.id === split.personId))) throw new HttpError(400, "Expense participant was not found.");
      return;
    }
    throw new HttpError(403, "You cannot change this financial item.");
  }
  const group = envelope.state.groups.find((item) => item.id === groupId);
  if (!group || !group.memberIds.includes(session.personId)) throw new HttpError(403, "You are not a member of this group.");
  if (group.status === "closed") throw new HttpError(409, "This group is closed and read-only.");
  if (mutation.type === "addExpense" || mutation.type === "updateExpense") {
    if (mutation.expense.splits.some((split) => !group.memberIds.includes(split.personId))) {
      throw new HttpError(400, "Every expense participant must belong to the group.");
    }
  }
}
