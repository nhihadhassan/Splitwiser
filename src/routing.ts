import { matchPath } from "react-router-dom";

export const PRODUCT_ROUTE_PATHS = [
  "/",
  "/activity",
  "/all",
  "/groups",
  "/groups/:groupId",
  "/friends/:friendId",
  "/settlements",
  "/reconciliation",
] as const;

export type RouteTitleContext = {
  authState: "loading" | "signed-out" | "signed-in";
  groupNames?: ReadonlyMap<string, string>;
  friendNames?: ReadonlyMap<string, string>;
};

function title(label: string): string {
  return `${label} · Splitwiser`;
}

export function resolveRouteTitle(pathname: string, context: RouteTitleContext): string {
  if (pathname === "/join" || pathname.startsWith("/join/")) return title("Invitation");
  if (!PRODUCT_ROUTE_PATHS.some((pattern) => matchPath({ path: pattern, end: true }, pathname))) {
    return title("Page not found");
  }
  if (context.authState === "loading") return title("Opening");
  if (context.authState === "signed-out") return title("Sign in");

  const groupMatch = matchPath("/groups/:groupId", pathname);
  if (groupMatch?.params.groupId) {
    return title(context.groupNames?.get(groupMatch.params.groupId) ?? "Group");
  }
  const friendMatch = matchPath("/friends/:friendId", pathname);
  if (friendMatch?.params.friendId) {
    return title(context.friendNames?.get(friendMatch.params.friendId) ?? "Friend");
  }
  if (pathname === "/groups") return title("Groups");
  if (pathname === "/activity" || pathname === "/all") return title("Activity");
  if (pathname === "/reconciliation") return title("Reconciliation");
  return title("Overview");
}

export function legacyHashDestination(
  pathname: string,
  search: string,
  hash: string,
): string | null {
  if (pathname !== "/" || !hash.startsWith("#/")) return null;
  const candidate = hash.slice(1);
  const [candidatePath = "/"] = candidate.split("?");
  const isKnown = PRODUCT_ROUTE_PATHS.some((pattern) =>
    matchPath({ path: pattern, end: true }, candidatePath),
  );
  if (!isKnown) return null;
  if (!search) return candidate;
  const separator = candidate.includes("?") ? "&" : "?";
  return `${candidate}${separator}${search.slice(1)}`;
}
