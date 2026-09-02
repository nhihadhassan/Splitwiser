import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("private application metadata", () => {
  it("uses a generic canonical and strict indexing directives", async () => {
    const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
    expect(index).toContain('<link rel="canonical" href="https://splitwiser-xi.vercel.app/"');
    expect(index).toContain('content="noindex, nofollow, noarchive, nosnippet"');
    expect(index).toContain('property="og:type" content="website"');
    expect(index).toContain('name="twitter:card" content="summary_large_image"');
    expect(index).toContain('content="https://splitwiser-xi.vercel.app/social-share.png"');
  });

  it("keeps robots conservative and publishes no sitemap", async () => {
    const robots = await readFile(new URL("../public/robots.txt", import.meta.url), "utf8");
    expect(robots).toContain("Allow: /$");
    expect(robots).toContain("Disallow: /");
    expect(robots).not.toMatch(/sitemap/i);
  });
});
