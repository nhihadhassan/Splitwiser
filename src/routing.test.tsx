import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NotFoundPage } from "./pages/NotFoundPage";
import { legacyHashDestination, resolveRouteTitle } from "./routing";

describe("application routing", () => {
  it("recognizes clean routes and compatibility titles", () => {
    const context = { authState: "signed-in" as const };
    expect(resolveRouteTitle("/", context)).toBe("Overview · Splitwiser");
    expect(resolveRouteTitle("/groups", context)).toBe("Groups · Splitwiser");
    expect(resolveRouteTitle("/all", context)).toBe("Activity · Splitwiser");
    expect(resolveRouteTitle("/settlements", context)).toBe("Overview · Splitwiser");
  });

  it("uses authorized client-side names only when they are available", () => {
    const context = {
      authState: "signed-in" as const,
      groupNames: new Map([["group-safe", "Weekend trip"]]),
      friendNames: new Map([["friend-safe", "Taylor"]]),
    };
    expect(resolveRouteTitle("/groups/group-safe", context)).toBe("Weekend trip · Splitwiser");
    expect(resolveRouteTitle("/friends/friend-safe", context)).toBe("Taylor · Splitwiser");
    expect(resolveRouteTitle("/groups/missing", context)).toBe("Group · Splitwiser");
  });

  it("keeps authentication and error titles generic", () => {
    expect(resolveRouteTitle("/join", { authState: "signed-out" })).toBe("Invitation · Splitwiser");
    expect(resolveRouteTitle("/groups", { authState: "loading" })).toBe("Opening · Splitwiser");
    expect(resolveRouteTitle("/groups", { authState: "signed-out" })).toBe("Sign in · Splitwiser");
    expect(resolveRouteTitle("/not-a-route", { authState: "signed-in" })).toBe("Page not found · Splitwiser");
  });

  it("moves recognized legacy hashes to clean URLs once", () => {
    expect(legacyHashDestination("/", "", "#/groups/group-safe")).toBe("/groups/group-safe");
    expect(legacyHashDestination("/", "?from=bookmark", "#/activity?type=expense"))
      .toBe("/activity?type=expense&from=bookmark");
    expect(legacyHashDestination("/join", "?__clerk_ticket=safe-ticket", "#/verify"))
      .toBeNull();
    expect(legacyHashDestination("/", "", "#/unknown"))
      .toBeNull();
    expect(legacyHashDestination("/", "", "#clerk-db-jwt=fragment"))
      .toBeNull();
  });

  it("renders a semantic, privacy-safe 404 through MemoryRouter", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/missing/private-looking-id"]}>
        <Routes><Route path="*" element={<NotFoundPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(markup).toContain("This page could not be found");
    expect(markup).toContain("Back to Overview");
    expect(markup).not.toContain("private-looking-id");
  });

  it("preserves clean-route query strings, including invitation tickets", () => {
    function LocationProbe() {
      const location = useLocation();
      return <output>{`${location.pathname}${location.search}`}</output>;
    }
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/join?__clerk_ticket=safe-ticket"]}>
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(markup).toContain("/join?__clerk_ticket=safe-ticket");
  });
});
