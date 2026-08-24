import { ClerkProvider, SignIn, useAuth } from "@clerk/react";
import { useEffect, useRef } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { clearOfflineAccount } from "./offline";
import { StoreProvider } from "./store";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { GroupPage } from "./pages/GroupPage";
import { GroupsPage } from "./pages/GroupsPage";
import { FriendPage } from "./pages/FriendPage";
import { ActivityPage } from "./pages/ActivityPage";
import { ReconciliationPage } from "./pages/ReconciliationPage";

function ProductRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/all" element={<Navigate to="/activity?type=expense" replace />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:groupId" element={<GroupPage />} />
          <Route path="/friends/:friendId" element={<FriendPage />} />
          <Route path="/settlements" element={<Navigate to="/?settle=1" replace />} />
          <Route path="/reconciliation" element={<ReconciliationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

function AuthenticatedProduct() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const previousAccount = useRef<string | null>(null);

  useEffect(() => {
    if (userId) previousAccount.current = userId;
    if (isLoaded && !isSignedIn && previousAccount.current) {
      const accountId = previousAccount.current;
      previousAccount.current = null;
      void clearOfflineAccount(accountId);
    }
  }, [isLoaded, isSignedIn, userId]);

  if (!isLoaded) return <main className="account-loading"><p>Opening Splitwiser…</p></main>;
  if (!isSignedIn || !userId) {
    const joining = window.location.pathname.replace(/\/+$/, "") === "/join";
    return (
      <main className="auth-shell">
        <section className="auth-intro" aria-labelledby="auth-title">
          <p className="eyebrow">Private shared ledger</p>
          <h1 id="auth-title">{joining ? "You’re invited to Splitwiser." : "Settle the trip, keep the friendship."}</h1>
          <p>{joining ? "Sign in or create your account. Your invitation securely connects it to the person your host selected, then you’ll see the shared trips you belong to." : "Splitwiser is invitation-only. Sign in with the account that received your invitation."}</p>
          {joining && <p className="muted-copy">One account belongs to one person. The invitation expires after seven days.</p>}
        </section>
        <SignIn routing="hash" />
      </main>
    );
  }
  return (
    <StoreProvider accountId={userId} getToken={getToken}>
      <ProductRoutes />
    </StoreProvider>
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
  return <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/"><AuthenticatedProduct /></ClerkProvider>;
}
