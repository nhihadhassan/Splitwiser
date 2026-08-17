import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAccountId } from "../_lib/auth.js";
import { errorResponse, HttpError, json, methodNotAllowed, readJson } from "../_lib/http.js";
import { blobToken, resolveWorkspaceSession } from "../_lib/workspace.js";

type ClientPayload = { groupId?: string; receiptId?: string };

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      const body = await readJson<HandleUploadBody>(request, 32_000);
      let accountId: string | null = null;
      if (body.type === "blob.generate-client-token") accountId = await requireAccountId(request);
      const result = await handleUpload({
        request,
        body,
        token: blobToken(),
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          if (!accountId) throw new HttpError(401, "Sign in is required.");
          const { envelope, session } = await resolveWorkspaceSession(accountId);
          let payload: ClientPayload;
          try {
            payload = JSON.parse(clientPayload ?? "{}") as ClientPayload;
          } catch {
            throw new HttpError(400, "Receipt upload details are invalid.");
          }
          const group = envelope.state.groups.find((item) => item.id === payload.groupId);
          if (!group || (session.role !== "owner" && !group.memberIds.includes(session.personId))) {
            throw new HttpError(403, "You cannot attach a receipt to this group.");
          }
          if (group.status === "closed") throw new HttpError(409, "This group is closed and read-only.");
          if (!payload.receiptId || !/^[A-Za-z0-9_-]{8,128}$/.test(payload.receiptId)) throw new HttpError(400, "Receipt identifier is invalid.");
          const expectedPath = `private/receipts/${accountId}/${payload.receiptId}`;
          if (pathname !== expectedPath) throw new HttpError(400, "Receipt upload path is invalid.");
          return {
            allowedContentTypes: ["image/jpeg", "image/webp"],
            maximumSizeInBytes: 1_000_000,
            validUntil: Date.now() + 10 * 60 * 1000,
            addRandomSuffix: false,
            allowOverwrite: false,
            cacheControlMaxAge: 60,
            tokenPayload: JSON.stringify({ accountId, personId: session.personId, receiptId: payload.receiptId }),
          };
        },
        onUploadCompleted: async () => {
          // The authenticated financial mutation validates Blob metadata and
          // links the attachment. An upload alone never exposes a receipt.
        },
      });
      return json(result);
    } catch (error) {
      return errorResponse(error, "The receipt upload could not be authorized.");
    }
  },
};
