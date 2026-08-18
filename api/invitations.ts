import { requireAccountId, clerkClient } from "./_lib/auth.js";
import { errorResponse, HttpError, json, methodNotAllowed, readJson } from "./_lib/http.js";
import { resolveWorkspaceSession } from "./_lib/workspace.js";

type InvitationRequest = { email?: string; personId?: string };

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      const accountId = await requireAccountId(request);
      const { envelope, session } = await resolveWorkspaceSession(accountId);
      if (!session.capabilities.manageInvites) throw new HttpError(403, "Only the owner can invite people.");
      const body = await readJson<InvitationRequest>(request, 16_000);
      const email = body.email?.trim().toLowerCase();
      const personId = body.personId?.trim();
      if (!email || !/^\S+@\S+\.\S+$/.test(email) || !personId) throw new HttpError(400, "Choose a person and enter a valid email address.");
      const person = envelope.state.people.find((item) => item.id === personId);
      if (!person) throw new HttpError(404, "Person was not found.");
      if (person.id === envelope.ownerPersonId) throw new HttpError(409, "The owner account is configured separately.");
      if (envelope.accountLinks.some((link) => link.personId === person.id && link.status === "active")) {
        throw new HttpError(409, "This person has already claimed an account.");
      }
      const appUrl = process.env.VERCEL_ENV === "production"
        ? process.env.SPLITWISER_APP_URL?.trim() || "https://splitwiser-xi.vercel.app"
        : new URL(request.url).origin;
      const redirectUrl = `${appUrl.replace(/\/$/, "")}/join`;
      const invitation = await clerkClient().invitations.createInvitation({
        emailAddress: email,
        expiresInDays: 7,
        notify: true,
        redirectUrl,
        publicMetadata: { splitwiserPersonId: person.id },
      });
      return json({ id: invitation.id, status: invitation.status, emailAddress: invitation.emailAddress }, 201);
    } catch (error) {
      return errorResponse(error, "The invitation could not be sent.");
    }
  },
};
