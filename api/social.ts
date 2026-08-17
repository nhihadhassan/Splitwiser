import type { Reaction } from "../src/types.js";
import { requireAccountId } from "./_lib/auth.js";
import { errorResponse, HttpError, json, methodNotAllowed, readJson } from "./_lib/http.js";
import { createSocial, deleteSocial, editSocial, listSocial, markSocialRead, reactToSocial } from "./_lib/social.js";
import { resolveWorkspaceSession } from "./_lib/workspace.js";

type SocialBody = {
  action?: "create" | "react" | "read";
  id?: string;
  groupId?: string;
  scope?: "group" | "expense";
  scopeId?: string;
  body?: string;
  emoji?: Reaction["emoji"];
  cursor?: number;
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) return methodNotAllowed(["GET", "POST", "PATCH", "DELETE"]);
    try {
      const accountId = await requireAccountId(request);
      const { envelope, session } = await resolveWorkspaceSession(accountId);
      if (request.method === "GET") {
        const url = new URL(request.url);
        const groupId = url.searchParams.get("groupId")?.trim();
        if (!groupId) throw new HttpError(400, "A group is required.");
        try {
          return json(await listSocial(envelope, session, groupId, Number(url.searchParams.get("after") ?? 0)));
        } catch (error) {
          if (error instanceof HttpError && error.status !== 503) throw error;
          return json({ items: [], unread: 0, readOnly: true, message: "Discussion is temporarily read-only." });
        }
      }
      const body = await readJson<SocialBody>(request, 24_000);
      if (request.method === "POST" && body.action === "read") {
        if (!body.groupId) throw new HttpError(400, "A group is required.");
        await markSocialRead(envelope, session, body.groupId, Number(body.cursor ?? Date.now()));
        return json({ ok: true });
      }
      if (request.method === "POST" && body.action === "react") {
        if (!body.id || !body.emoji) throw new HttpError(400, "A message and reaction are required.");
        return json(await reactToSocial(envelope, session, body.id, body.emoji));
      }
      if (request.method === "POST") return json(await createSocial(envelope, session, body), 201);
      if (!body.id) throw new HttpError(400, "A message is required.");
      if (request.method === "PATCH") return json(await editSocial(envelope, session, body.id, body.body ?? ""));
      return json(await deleteSocial(envelope, session, body.id));
    } catch (error) {
      return errorResponse(error, request.method === "GET" ? "Discussion could not be loaded." : "Discussion is temporarily read-only.");
    }
  },
};
