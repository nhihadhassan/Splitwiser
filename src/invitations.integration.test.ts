import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  requireAccountId: vi.fn(),
  resolveWorkspaceSession: vi.fn(),
}));

vi.mock("../api/_lib/auth.js", () => ({
  requireAccountId: mocks.requireAccountId,
  clerkClient: () => ({ invitations: { createInvitation: mocks.createInvitation } }),
}));

vi.mock("../api/_lib/workspace.js", () => ({
  resolveWorkspaceSession: mocks.resolveWorkspaceSession,
}));

import handler from "../api/invitations.js";

describe("invitation entry route", () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousAppUrl = process.env.SPLITWISER_APP_URL;

  beforeEach(() => {
    process.env.VERCEL_ENV = "production";
    process.env.SPLITWISER_APP_URL = "https://splitwiser-xi.vercel.app/";
    mocks.requireAccountId.mockResolvedValue("owner-account");
    mocks.resolveWorkspaceSession.mockResolvedValue({
      envelope: {
        ownerPersonId: "owner-person",
        accountLinks: [],
        state: { people: [{ id: "invitee", name: "Invitee", color: "#456", claimed: false }] },
      },
      session: { capabilities: { manageInvites: true } },
    });
    mocks.createInvitation.mockResolvedValue({
      id: "invitation-safe",
      status: "pending",
      emailAddress: "invitee@example.test",
    });
  });

  afterEach(() => {
    process.env.VERCEL_ENV = previousVercelEnv;
    process.env.SPLITWISER_APP_URL = previousAppUrl;
    vi.clearAllMocks();
  });

  it("sends Clerk invitations to the clean generic join route", async () => {
    const response = await handler.fetch(new Request("https://deployment.example/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: " INVITEE@example.test ", personId: "invitee" }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createInvitation).toHaveBeenCalledWith({
      emailAddress: "invitee@example.test",
      expiresInDays: 7,
      notify: true,
      redirectUrl: "https://splitwiser-xi.vercel.app/join",
      publicMetadata: { splitwiserPersonId: "invitee" },
    });
  });
});
