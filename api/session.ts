import { requireAccountId } from "./_lib/auth.js";
import { errorResponse, json, methodNotAllowed } from "./_lib/http.js";
import { resolveWorkspaceSession } from "./_lib/workspace.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      const accountId = await requireAccountId(request);
      const { session } = await resolveWorkspaceSession(accountId);
      return json(session);
    } catch (error) {
      return errorResponse(error, "Account access is temporarily unavailable.");
    }
  },
};
