import { describe, expect, it } from "vitest";
import { seedState } from "../../src/seed";
import type { MutationCommand, WorkspaceEnvelopeV3 } from "../../src/types";
import { HttpError } from "./http";
import { authorizedSnapshot, authorizeMutation, canAccessExpense, sessionFor } from "./authorization";

function envelope(): WorkspaceEnvelopeV3 {
  return {
    version: 3,
    revision: 7,
    updatedAt: "2027-03-01T00:00:00.000Z",
    ownerPersonId: "me",
    accountLinks: [
      { accountId: "account-owner", personId: "me", role: "owner", status: "active", linkedAt: 1 },
      { accountId: "account-sam", personId: "person-sam", role: "member", status: "active", linkedAt: 2 },
      { accountId: "account-jules", personId: "person-jules", role: "member", status: "active", linkedAt: 3 },
    ],
    appliedMutationIds: [],
    receiptUsageBytes: 0,
    state: seedState(),
  };
}

function command(mutation: MutationCommand["mutation"]): MutationCommand {
  return { id: "command-authorization", baseRevision: 7, createdAt: 10, mutation };
}

function status(error: unknown): number | undefined {
  return error instanceof HttpError ? error.status : undefined;
}

describe("workspace authorization", () => {
  it("rejects an unlinked account", () => {
    expect(() => sessionFor(envelope(), "account-stranger")).toThrowError(/does not have access/i);
  });

  it("gives only the owner privileged capabilities", () => {
    expect(sessionFor(envelope(), "account-owner").capabilities).toMatchObject({ manageInvites: true, reconcile: true, moderateSocial: true });
    expect(sessionFor(envelope(), "account-sam").capabilities).toMatchObject({ manageInvites: false, reconcile: false, moderateSocial: false });
  });

  it("filters member snapshots to their groups and omits reconciliation", () => {
    const source = envelope();
    const snapshot = authorizedSnapshot(source, sessionFor(source, "account-sam"));
    expect(snapshot.state.groups.map((group) => group.id)).toEqual(["group-coast", "group-cabin"]);
    expect(snapshot.state.expenses.every((expense) => expense.groupId !== "group-city")).toBe(true);
    expect(snapshot.state.reconciliation.workspace).toBeUndefined();
    expect(snapshot).not.toHaveProperty("accountLinks");
  });

  it("allows a member mutation inside an open joined group", () => {
    const source = envelope();
    const session = sessionFor(source, "account-sam");
    const original = source.state.expenses.find((expense) => expense.id === "expense-coast-train")!;
    expect(() => authorizeMutation(source, session, command({ type: "updateExpense", expense: { ...original, notes: "Platform changed" } }))).not.toThrow();
  });

  it("denies a cross-group member mutation", () => {
    const source = envelope();
    const session = sessionFor(source, "account-sam");
    const other = source.state.expenses.find((expense) => expense.groupId === "group-city")!;
    try {
      authorizeMutation(source, session, command({ type: "deleteExpense", expenseId: other.id }));
      throw new Error("expected denial");
    } catch (error) {
      expect(status(error)).toBe(403);
    }
  });

  it("locks closed groups for members", () => {
    const source = envelope();
    const session = sessionFor(source, "account-jules");
    const closed = source.state.expenses.find((expense) => expense.groupId === "group-city")!;
    try {
      authorizeMutation(source, session, command({ type: "updateExpense", expense: closed }));
      throw new Error("expected lifecycle lock");
    } catch (error) {
      expect(status(error)).toBe(409);
    }
  });

  it("locks closed-group financial edits for the owner too", () => {
    const source = envelope();
    const session = sessionFor(source, "account-owner");
    const closed = source.state.expenses.find((expense) => expense.groupId === "group-city")!;
    expect(() => authorizeMutation(source, session, command({ type: "deleteExpense", expenseId: closed.id }))).toThrowError(/closed/i);
  });

  it("includes every participant needed to render an authorized non-group item", () => {
    const source = envelope();
    source.state.expenses.push({
      ...source.state.expenses[0],
      id: "expense-direct",
      groupId: null,
      splits: [{ personId: "person-sam", owes: 5_000, paid: 10_000 }, { personId: "person-jules", owes: 5_000, paid: 0 }],
      amount: 10_000,
    });
    const snapshot = authorizedSnapshot(source, sessionFor(source, "account-sam"));
    expect(snapshot.state.people.map((person) => person.id)).toContain("person-jules");
  });

  it("denies member administration and reconciliation", () => {
    const source = envelope();
    const session = sessionFor(source, "account-sam");
    for (const mutation of [
      { type: "addPerson" as const, person: { id: "new", name: "New", color: "#000" } },
      { type: "updateReconciliation" as const, reconciliation: source.state.reconciliation },
    ]) {
      expect(() => authorizeMutation(source, session, command(mutation))).toThrowError(/owner/i);
    }
  });

  it("enforces private expense and receipt access by membership", () => {
    const source = envelope();
    expect(canAccessExpense(source, sessionFor(source, "account-sam"), "expense-coast-lodge")).toBe(true);
    expect(canAccessExpense(source, sessionFor(source, "account-sam"), "expense-city-hotel")).toBe(false);
    expect(canAccessExpense(source, sessionFor(source, "account-owner"), "expense-city-hotel")).toBe(true);
  });
});
