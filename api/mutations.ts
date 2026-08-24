import type { MutationCommand } from "../src/types.js";
import { authorizedSnapshot, sessionFor } from "./_lib/authorization.js";
import { requireAccountId } from "./_lib/auth.js";
import { errorResponse, json, methodNotAllowed, readGzipJson, readJson } from "./_lib/http.js";
import { applyMutationCommand } from "./_lib/workspace.js";

const COMPRESSED_MUTATION_CONTENT_TYPE = "application/vnd.splitwiser.mutation+gzip";
const MAX_COMPRESSED_MUTATION_BYTES = 4_000_000;
const MAX_DECODED_MUTATION_BYTES = 12_000_000;

async function readMutation(request: Request): Promise<MutationCommand> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() === COMPRESSED_MUTATION_CONTENT_TYPE) {
    return readGzipJson<MutationCommand>(request, MAX_COMPRESSED_MUTATION_BYTES, MAX_DECODED_MUTATION_BYTES);
  }
  return readJson<MutationCommand>(request, MAX_COMPRESSED_MUTATION_BYTES);
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      const accountId = await requireAccountId(request);
      const command = await readMutation(request);
      const envelope = await applyMutationCommand(accountId, command);
      return json(authorizedSnapshot(envelope, sessionFor(envelope, accountId)));
    } catch (error) {
      return errorResponse(error, "The financial change could not be saved.");
    }
  },
};
