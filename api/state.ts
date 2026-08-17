import { authorizedSnapshot } from "./_lib/authorization.js";
import { requireAccountId } from "./_lib/auth.js";
import { errorResponse, methodNotAllowed } from "./_lib/http.js";
import { resolveWorkspaceSession } from "./_lib/workspace.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      const accountId = await requireAccountId(request);
      const { envelope, session } = await resolveWorkspaceSession(accountId);
      return Response.json(authorizedSnapshot(envelope, session), {
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    } catch (error) {
      return errorResponse(error, "The private ledger is temporarily unavailable.");
    }
  },
};
