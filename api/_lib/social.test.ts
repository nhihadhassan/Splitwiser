import { describe, expect, it } from "vitest";
import { seedState } from "../../src/seed";
import type { SessionProfile, SocialItem, WorkspaceEnvelopeV3 } from "../../src/types";
import { HttpError } from "./http";
import { canManageSocialItem, requireGroupMember, toggleReaction, withinSocialWriteAllowance } from "./social";

const member: SessionProfile = {
  accountId: "account-sam",
  personId: "person-sam",
  role: "member",
  displayName: "Sam",
  capabilities: { manageInvites: false, manageAllGroups: false, reconcile: false, moderateSocial: false },
};

const owner: SessionProfile = {
  accountId: "account-owner",
  personId: "me",
  role: "owner",
  displayName: "Alex",
  capabilities: { manageInvites: true, manageAllGroups: true, reconcile: true, moderateSocial: true },
};

function envelope(): WorkspaceEnvelopeV3 {
  return { version: 3, revision: 1, updatedAt: "2027-01-01T00:00:00Z", ownerPersonId: "me", accountLinks: [], appliedMutationIds: [], receiptUsageBytes: 0, state: seedState() };
}

const item: SocialItem = {
  id: "message-1",
  groupId: "group-coast",
  scope: "group",
  scopeId: "group-coast",
  authorPersonId: "person-jules",
  body: "Example",
  createdAt: 1,
  reactions: [],
};

describe("social permissions and safety", () => {
  it("allows joined members and the owner to read a group", () => {
    expect(requireGroupMember(envelope(), member, "group-coast").id).toBe("group-coast");
    expect(requireGroupMember(envelope(), owner, "group-cabin").id).toBe("group-cabin");
  });

  it("denies cross-group reads", () => {
    try {
      requireGroupMember(envelope(), member, "group-city");
      throw new Error("expected denial");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(403);
    }
  });

  it("lets authors manage their content and lets the owner moderate", () => {
    expect(canManageSocialItem(member, { ...item, authorPersonId: member.personId })).toBe(true);
    expect(canManageSocialItem(member, item)).toBe(false);
    expect(canManageSocialItem(owner, item)).toBe(true);
  });

  it("toggles one reaction per person and emoji without removing other emoji", () => {
    const first = toggleReaction([], member.personId, "👍");
    const second = toggleReaction(first, member.personId, "❤️");
    expect(second).toEqual([{ emoji: "👍", personIds: [member.personId] }, { emoji: "❤️", personIds: [member.personId] }]);
    expect(toggleReaction(second, member.personId, "👍")).toEqual([{ emoji: "❤️", personIds: [member.personId] }]);
  });

  it("stops writes at the internal monthly safety ceilings", () => {
    expect(withinSocialWriteAllowance(2_500, 200_000)).toBe(true);
    expect(withinSocialWriteAllowance(2_501, 1)).toBe(false);
    expect(withinSocialWriteAllowance(1, 200_001)).toBe(false);
  });
});
