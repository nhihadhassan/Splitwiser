import { ClerkProvider, SignIn, useAuth } from "@clerk/react";
import { lazy, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { clearOfflineAccount } from "./offline";
import { StoreProvider, useStore } from "./store";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PRODUCT_ROUTE_PATHS, resolveRouteTitle, type RouteTitleContext } from "./routing";

const GroupsPage = lazy(() => import("./pages/GroupsPage").then((module) => ({ default: module.GroupsPage })));
const GroupPage = lazy(() => import("./pages/GroupPage").then((module) => ({ default: module.GroupPage })));
const FriendPage = lazy(() => import("./pages/FriendPage").then((module) => ({ default: module.FriendPage })));
const ActivityPage = lazy(() => import("./pages/ActivityPage").then((module) => ({ default: module.ActivityPage })));
const ReconciliationPage = lazy(() => import("./pages/ReconciliationPage").then((module) => ({ default: module.ReconciliationPage })));

function DocumentTitle({ context }: { context: RouteTitleContext }) {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = resolveRouteTitle(pathname, context);
  }, [context, pathname]);
  return null;
}

function RouteLoading() {
  return (
    <main className="pane route-loading" aria-busy="true" aria-live="polite">
      <span className="route-loading-line route-loading-title" />
      <span className="route-loading-line" />
      <span className="route-loading-line route-loading-short" />
      <span className="sr-only">Opening page…</span>
    </main>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

function PrivateTitle() {
  const { state } = useStore();
  const groupNames = useMemo(
    () => new Map(state.groups.map((group) => [group.id, group.name])),
    [state.groups],
  );
  const friendNames = useMemo(
    () => new Map(state.people.map((person) => [person.id, person.name])),
    [state.people],
  );
  const context = useMemo<RouteTitleContext>(
    () => ({ authState: "signed-in", groupNames, friendNames }),
    [friendNames, groupNames],
  );
  return <DocumentTitle context={context} />;
}

function ProductRoutes() {
  return (
    <>
      <PrivateTitle />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/activity" element={<LazyPage><ActivityPage /></LazyPage>} />
          <Route path="/all" element={<Navigate to="/activity?type=expense" replace />} />
          <Route path="/groups" element={<LazyPage><GroupsPage /></LazyPage>} />
          <Route path="/groups/:groupId" element={<LazyPage><GroupPage /></LazyPage>} />
          <Route path="/friends/:friendId" element={<LazyPage><FriendPage /></LazyPage>} />
          <Route path="/settlements" element={<Navigate to="/?settle=1" replace />} />
          <Route path="/reconciliation" element={<LazyPage><ReconciliationPage /></LazyPage>} />
        </Route>
        <Route path="/join/*" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

function AuthShell({ joining = false }: { joining?: boolean }) {
  return (
    <main className="auth-shell">
      <section className="auth-intro" aria-labelledby="auth-title">
        <p className="eyebrow">Private shared ledger</p>
        <h1 id="auth-title">{joining ? "You’re invited to Splitwiser." : "Settle the trip, keep the friendship."}</h1>
        <p>{joining ? "Sign in or create your account. Your invitation securely connects it to the person your host selected, then you’ll see the shared trips you belong to." : "Splitwiser is invitation-only. Sign in with the account that received your invitation."}</p>
        {joining && <p className="muted-copy">One account belongs to one person. The invitation expires after seven days.</p>}
      </section>
      {joining
        ? <SignIn routing="path" path="/join" />
        : <SignIn routing="hash" />}
    </main>
  );
}

function SignedOutRoutes() {
  const titleContext = useMemo<RouteTitleContext>(() => ({ authState: "signed-out" }), []);
  return (
    <>
      <DocumentTitle context={titleContext} />
      <Routes>
        <Route path="/join/*" element={<AuthShell joining />} />
        {PRODUCT_ROUTE_PATHS.map((path) => <Route key={path} path={path} element={<AuthShell />} />)}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

function AuthenticatedProduct() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const previousAccount = useRef<string | null>(null);
  const loadingContext = useMemo<RouteTitleContext>(() => ({ authState: "loading" }), []);

  useEffect(() => {
    if (userId) previousAccount.current = userId;
    if (isLoaded && !isSignedIn && previousAccount.current) {
      const accountId = previousAccount.current;
      previousAccount.current = null;
      void clearOfflineAccount(accountId);
    }
  }, [isLoaded, isSignedIn, userId]);

  if (!isLoaded) {
    return (
      <>
        <DocumentTitle context={loadingContext} />
        <main className="account-loading"><p>Opening Splitwiser…</p></main>
      </>
    );
  }
  if (!isSignedIn || !userId) return <SignedOutRoutes />;
  return (
    <StoreProvider accountId={userId} getToken={getToken}>
      <ProductRoutes />
    </StoreProvider>
  );
}

function ClerkProduct({ publishableKey }: { publishableKey: string }) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <AuthenticatedProduct />
    </ClerkProvider>
  );
}

export default function App() {
  const publishableKey = import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ?? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    if (import.meta.env.PROD) {
      return (
        <main className="account-loading" role="alert">
          <p className="eyebrow">Private ledger</p>
          <h1>Account access is not configured.</h1>
          <p>No financial data is available until the private account service is connected.</p>
        </main>
      );
    }
    return <StoreProvider accountId="local-owner" localOnly><ProductRoutes /></StoreProvider>;
  }
  return <ClerkProduct publishableKey={publishableKey} />;
}
