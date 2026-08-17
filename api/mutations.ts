import type { MutationCommand } from "../src/types.js";
import { authorizedSnapshot, sessionFor } from "./_lib/authorization.js";
import { requireAccountId } from "./_lib/auth.js";
import { errorResponse, json, methodNotAllowed, readJson } from "./_lib/http.js";
import { applyMutationCommand } from "./_lib/workspace.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      const accountId = await requireAccountId(request);
      const command = await readJson<MutationCommand>(request);
      const envelope = await applyMutationCommand(accountId, command);
      return json(authorizedSnapshot(envelope, sessionFor(envelope, accountId)));
    } catch (error) {
      return errorResponse(error, "The financial change could not be saved.");
    }
  },
};
