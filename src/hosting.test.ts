import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type VercelConfig = {
  rewrites?: Array<{ source: string; destination: string }>;
};

const EXPECTED_SPA_ROUTES = [
  "/activity",
  "/all",
  "/groups",
  "/groups/:groupId",
  "/friends/:friendId",
  "/settlements",
  "/reconciliation",
  "/join",
  "/join/:path*",
];

function matchesRewrite(source: string, pathname: string): boolean {
  const sourceParts = source.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);

  for (let index = 0; index < sourceParts.length; index += 1) {
    const sourcePart = sourceParts[index];
    if (sourcePart?.endsWith("*")) return pathParts.length >= index;
    if (sourcePart?.startsWith(":")) {
      if (!pathParts[index]) return false;
    } else if (sourcePart !== pathParts[index]) {
      return false;
    }
  }

  return sourceParts.length === pathParts.length;
}

describe("Vercel SPA entry routes", () => {
  it("rewrites only the supported clean application routes", async () => {
    const contents = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
    const config = JSON.parse(contents) as VercelConfig;
    const rewrites = config.rewrites ?? [];

    expect(rewrites.map((rewrite) => rewrite.source)).toEqual(EXPECTED_SPA_ROUTES);
    expect(rewrites.every((rewrite) => rewrite.destination === "/index.html")).toBe(true);
    expect(rewrites.some((rewrite) => rewrite.source.includes("(("))).toBe(false);
  });

  it("leaves unrelated misses and nested-invalid routes outside the SPA", async () => {
    const contents = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
    const config = JSON.parse(contents) as VercelConfig;
    const sources = (config.rewrites ?? []).map((rewrite) => rewrite.source);
    const reachesSpa = (pathname: string) => sources.some((source) => matchesRewrite(source, pathname));

    expect(reachesSpa("/groups/group-safe")).toBe(true);
    expect(reachesSpa("/friends/friend-safe")).toBe(true);
    expect(reachesSpa("/join/sso-callback")).toBe(true);
    expect(reachesSpa("/sitemap.xml")).toBe(false);
    expect(reachesSpa("/arbitrary-path")).toBe(false);
    expect(reachesSpa("/missing-script.js")).toBe(false);
    expect(reachesSpa("/groups/group-safe/invalid")).toBe(false);
    expect(reachesSpa("/activity/invalid")).toBe(false);
  });
});

describe("static 404 document", () => {
  it("is branded, generic, and strictly non-indexable", async () => {
    const page = await readFile(new URL("../public/404.html", import.meta.url), "utf8");
    const lowerPage = page.toLowerCase();

    expect(page).toContain("Page not found · Splitwiser");
    expect(page).toContain('content="noindex, nofollow, noarchive, nosnippet"');
    expect(page).toContain('<a href="/">Go to Splitwiser</a>');
    expect(page).toContain("#E7BF67");
    for (const privateMarker of ["groupid", "friendid", "balance", "receipt", "clerk", "__clerk_ticket", "workspace-v3"]) {
      expect(lowerPage).not.toContain(privateMarker);
    }
  });
});
