import { describe, expect, it } from "vitest";
import { readGzipJson } from "./http";

describe("compressed JSON requests", () => {
  it("decodes a large authenticated mutation body within the configured limit", async () => {
    const value = { id: "large-command", payload: "statement row ".repeat(30_000) };
    const compressedStream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = await new Response(compressedStream).blob();
    const request = new Request("https://splitwiser.test/api/mutations", { method: "POST", body: compressed });

    await expect(readGzipJson<typeof value>(request, 4_000_000, 12_000_000)).resolves.toEqual(value);
  });

  it("rejects decoded data beyond the configured safety limit", async () => {
    const compressedStream = new Blob([JSON.stringify({ payload: "x".repeat(20_000) })]).stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = await new Response(compressedStream).blob();
    const request = new Request("https://splitwiser.test/api/mutations", { method: "POST", body: compressed });

    await expect(readGzipJson(request, 4_000_000, 1_000)).rejects.toMatchObject({ status: 413 });
  });
});
