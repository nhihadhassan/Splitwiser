import { get } from "@vercel/blob";
import { requireAccountId } from "../_lib/auth.js";
import { errorResponse, HttpError, methodNotAllowed } from "../_lib/http.js";
import { blobToken, resolveWorkspaceSession } from "../_lib/workspace.js";
import { canAccessExpense } from "../_lib/authorization.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      const accountId = await requireAccountId(request);
      const { envelope, session } = await resolveWorkspaceSession(accountId);
      const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
      const expense = envelope.state.expenses.find((item) => item.receipt?.id === id);
      if (!expense?.receipt) throw new HttpError(404, "Receipt was not found.");
      if (!canAccessExpense(envelope, session, expense.id)) throw new HttpError(403, "You cannot view this receipt.");
      const blob = await get(expense.receipt.storagePath, { access: "private", token: blobToken(), useCache: true });
      if (!blob || blob.statusCode !== 200) throw new HttpError(404, "Receipt image was not found.");
      return new Response(blob.stream, {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=60",
          "Content-Disposition": "inline",
          "Content-Type": blob.blob.contentType,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      return errorResponse(error, "The receipt could not be loaded.");
    }
  },
};
