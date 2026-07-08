import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { StoreProvider } from "./store";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { GroupPage } from "./pages/GroupPage";
import { FriendPage } from "./pages/FriendPage";
import { ActivityPage } from "./pages/ActivityPage";
import { AllExpensesPage } from "./pages/AllExpensesPage";

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/all" element={<AllExpensesPage />} />
            <Route path="/groups/:groupId" element={<GroupPage />} />
            <Route path="/friends/:friendId" element={<FriendPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  );
}
