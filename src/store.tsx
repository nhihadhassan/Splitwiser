import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppState,
  Expense,
  Group,
  Person,
  ReconciliationState,
  Settlement,
} from "./types";
import {
  CloudSyncError,
  generateSyncKey,
  loadCloudState,
  saveCloudState,
  SYNC_KEY_STORAGE_KEY,
} from "./cloud";
import { addCentralAmericaTrip } from "./centralAmericaTrip";
import { DEFAULT_EXPENSE_EXPORT_TRANSACTIONS, DEFAULT_PERU_CASH_TRANSACTIONS, DEFAULT_SCOTIABANK_TRANSACTIONS } from "./reconciliationData";

export const ME = "me";

const STORAGE_KEY = "splitwiser-state-v2";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

type Action =
  | { type: "addPerson"; person: Person }
  | { type: "addGroup"; group: Group }
  | { type: "updateGroup"; group: Group }
  | { type: "deleteGroup"; groupId: string }
  | { type: "addExpense"; expense: Expense }
  | { type: "updateExpense"; expense: Expense }
  | { type: "deleteExpense"; expenseId: string }
  | { type: "addSettlement"; settlement: Settlement }
  | { type: "deleteSettlement"; settlementId: string }
  | { type: "updateReconciliation"; reconciliation: ReconciliationState }
  | { type: "replace"; state: AppState };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "addPerson":
      return { ...state, people: [...state.people, action.person] };
    case "addGroup":
      return { ...state, groups: [...state.groups, action.group] };
    case "updateGroup":
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.group.id ? action.group : g)),
      };
    case "deleteGroup":
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.groupId),
        expenses: state.expenses.filter((e) => e.groupId !== action.groupId),
        settlements: state.settlements.filter((s) => s.groupId !== action.groupId),
      };
    case "addExpense":
      return { ...state, expenses: [...state.expenses, action.expense] };
    case "updateExpense":
      return {
        ...state,
        expenses: state.expenses.map((e) => (e.id === action.expense.id ? action.expense : e)),
      };
    case "deleteExpense":
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.expenseId) };
    case "addSettlement":
      return { ...state, settlements: [...state.settlements, action.settlement] };
    case "deleteSettlement":
      return {
        ...state,
        settlements: state.settlements.filter((s) => s.id !== action.settlementId),
      };
    case "updateReconciliation":
      return { ...state, reconciliation: action.reconciliation };
    case "replace":
      return normalizeState(action.state);
  }
}

function loadLegacyReconciliation(): ReconciliationState {
  let decisions: ReconciliationState["decisions"] = {};
  try {
    decisions = JSON.parse(
      localStorage.getItem("splitwiser-reconciliation-decisions") ?? "{}",
    ) as ReconciliationState["decisions"];
  } catch {
    decisions = {};
  }

  return {
    decisions,
    matches: {},
    cashRemaining: localStorage.getItem("splitwiser-peru-cash-remaining") ?? "",
    cashTransactions: DEFAULT_PERU_CASH_TRANSACTIONS,
    cardTransactions: DEFAULT_SCOTIABANK_TRANSACTIONS,
    exportTransactions: DEFAULT_EXPENSE_EXPORT_TRANSACTIONS,
  };
}

function normalizeState(state: Omit<AppState, "reconciliation"> & Partial<AppState>): AppState {
  return addCentralAmericaTrip({
    ...state,
    dataMigrations: state.dataMigrations ?? [],
    reconciliation: {
      ...loadLegacyReconciliation(),
      ...state.reconciliation,
      matches: state.reconciliation?.matches ?? {},
      cashTransactions: state.reconciliation?.cashTransactions ?? DEFAULT_PERU_CASH_TRANSACTIONS,
      cardTransactions: state.reconciliation?.cardTransactions ?? DEFAULT_SCOTIABANK_TRANSACTIONS,
      exportTransactions: state.reconciliation?.exportTransactions ?? DEFAULT_EXPENSE_EXPORT_TRANSACTIONS,
    },
  });
}

function emptyState(): AppState {
  return addCentralAmericaTrip({
    people: [{ id: ME, name: "Nhihad", color: "#5BC5A7" }],
    groups: [],
    expenses: [],
    settlements: [],
    reconciliation: loadLegacyReconciliation(),
    dataMigrations: [],
  });
}

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppState>;
  return (
    Array.isArray(candidate.people) &&
    Array.isArray(candidate.groups) &&
    Array.isArray(candidate.expenses) &&
    Array.isArray(candidate.settlements)
  );
}

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isAppState(parsed)) return normalizeState(parsed);
    }
  } catch {
    // Corrupted browser storage falls through to a clean ledger.
  }
  return emptyState();
}

export type CloudStatus = "local" | "connecting" | "saving" | "synced" | "error";

interface CloudControls {
  status: CloudStatus;
  hasKey: boolean;
  key: string | null;
  error: string | null;
  lastSavedAt: string | null;
  enable: () => Promise<string | null>;
  connect: (syncKey: string) => Promise<boolean>;
  disconnect: () => void;
  retry: () => Promise<void>;
}

interface StoreValue {
  state: AppState;
  dispatch: (action: Action) => void;
  peopleById: Map<string, Person>;
  cloud: CloudControls;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const [syncKey, setSyncKey] = useState<string | null>(
    () => localStorage.getItem(SYNC_KEY_STORAGE_KEY),
  );
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(
    syncKey ? "connecting" : "local",
  );
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const stateRef = useRef(state);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    if (!syncKey || !remoteReady) return;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setCloudStatus("saving");
    saveTimer.current = window.setTimeout(async () => {
      try {
        const result = await saveCloudState(syncKey, stateRef.current);
        setLastSavedAt(result.updatedAt);
        setCloudError(null);
        setCloudStatus("synced");
      } catch (error) {
        setCloudError(error instanceof Error ? error.message : "Online saving failed.");
        setCloudStatus("error");
      }
    }, 700);

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [remoteReady, state, syncKey]);

  useEffect(() => {
    if (!syncKey) return;
    const controller = new AbortController();
    setCloudStatus("connecting");
    setCloudError(null);

    void loadCloudState(syncKey, controller.signal)
      .then((ledger) => {
        if (!ledger) {
          throw new CloudSyncError("This sync key does not have an online ledger.", 404);
        }
        dispatch({ type: "replace", state: ledger.state });
        setLastSavedAt(ledger.updatedAt);
        setRemoteReady(true);
        setCloudStatus("synced");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRemoteReady(false);
        setCloudError(error instanceof Error ? error.message : "Could not open the online ledger.");
        setCloudStatus("error");
      });

    return () => controller.abort();
  }, [syncKey]);

  const enableCloud = useCallback(async (): Promise<string | null> => {
    const key = generateSyncKey();
    setCloudStatus("connecting");
    setCloudError(null);
    try {
      const result = await saveCloudState(key, stateRef.current);
      localStorage.setItem(SYNC_KEY_STORAGE_KEY, key);
      setSyncKey(key);
      setRemoteReady(true);
      setLastSavedAt(result.updatedAt);
      setCloudStatus("synced");
      return key;
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not enable online saving.");
      setCloudStatus("error");
      return null;
    }
  }, []);

  const connectCloud = useCallback(async (key: string): Promise<boolean> => {
    if (!key) return false;
    setCloudStatus("connecting");
    setCloudError(null);
    try {
      const ledger = await loadCloudState(key);
      if (!ledger) {
        throw new CloudSyncError("No online ledger was found for that sync key.", 404);
      }
      dispatch({ type: "replace", state: ledger.state });
      localStorage.setItem(SYNC_KEY_STORAGE_KEY, key);
      setSyncKey(key);
      setRemoteReady(true);
      setLastSavedAt(ledger.updatedAt);
      setCloudStatus("synced");
      return true;
    } catch (error) {
      setRemoteReady(false);
      setCloudError(error instanceof Error ? error.message : "Could not connect this ledger.");
      setCloudStatus("error");
      return false;
    }
  }, []);

  const disconnectCloud = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    localStorage.removeItem(SYNC_KEY_STORAGE_KEY);
    setSyncKey(null);
    setRemoteReady(false);
    setLastSavedAt(null);
    setCloudError(null);
    setCloudStatus("local");
  }, []);

  const retryCloud = useCallback(async () => {
    if (!syncKey) return;
    setCloudStatus("saving");
    setCloudError(null);
    try {
      const result = await saveCloudState(syncKey, stateRef.current);
      setRemoteReady(true);
      setLastSavedAt(result.updatedAt);
      setCloudStatus("synced");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Online saving failed.");
      setCloudStatus("error");
    }
  }, [syncKey]);

  const peopleById = useMemo(
    () => new Map(state.people.map((p) => [p.id, p])),
    [state.people],
  );

  const cloud = useMemo<CloudControls>(
    () => ({
      status: cloudStatus,
      hasKey: !!syncKey,
      key: syncKey,
      error: cloudError,
      lastSavedAt,
      enable: enableCloud,
      connect: connectCloud,
      disconnect: disconnectCloud,
      retry: retryCloud,
    }),
    [
      cloudError,
      cloudStatus,
      connectCloud,
      disconnectCloud,
      enableCloud,
      lastSavedAt,
      retryCloud,
      syncKey,
    ],
  );

  const value = useMemo(
    () => ({ state, dispatch, peopleById, cloud }),
    [cloud, state, peopleById],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}
