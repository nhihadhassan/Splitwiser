import { describe, expect, it } from "vitest";
import { COMPRESSED_MUTATION_CONTENT_TYPE, mutationRequestBody } from "./cloud";
import type { MutationCommand, ReconciliationState } from "./types";

describe("cloud mutation transport", () => {
  it("compresses a large queued reconciliation change", async () => {
    const command: MutationCommand = {
      id: "large-reconciliation-command",
      baseRevision: 12,
      createdAt: 1,
      mutation: {
        type: "updateReconciliation",
        reconciliation: { repeatedTestData: "statement row ".repeat(30_000) } as unknown as ReconciliationState,
      },
    };

    const encoded = await mutationRequestBody(command);
    expect(encoded.contentType).toBe(COMPRESSED_MUTATION_CONTENT_TYPE);
    expect(encoded.body).toBeInstanceOf(Blob);
    expect((encoded.body as Blob).size).toBeLessThan(JSON.stringify(command).length / 10);
  });
});
