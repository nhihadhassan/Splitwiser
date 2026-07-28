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
  ReconciliationMatchGroup,
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
import { DEFAULT_EXPENSE_EXPORT_TRANSACTIONS, DEFAULT_NEW_YORK_MATCHES, DEFAULT_PERU_CASH_TRANSACTIONS, DEFAULT_SCOTIABANK_TRANSACTIONS } from "./reconciliationData";
import { ensureReconciliationWorkspace } from "./reconciliation";
import { seedState } from "./seed";
import { splitEqually } from "./utils/money";

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
  const normalized = addCentralAmericaTrip({
    ...state,
    dataMigrations: state.dataMigrations ?? [],
    reconciliation: {
      ...loadLegacyReconciliation(),
      ...state.reconciliation,
      matches: state.reconciliation?.matches ?? {},
      cashTransactions: state.reconciliation?.cashTransactions ?? DEFAULT_PERU_CASH_TRANSACTIONS,
      cardTransactions: {
        ...DEFAULT_SCOTIABANK_TRANSACTIONS,
        ...state.reconciliation?.cardTransactions,
      },
      exportTransactions: {
        ...DEFAULT_EXPENSE_EXPORT_TRANSACTIONS,
        ...state.reconciliation?.exportTransactions,
      },
    },
  });
  const seededTripExpenses = seedState().expenses.filter((expense) => expense.id.startsWith("e-ny-card-"));
  const existingExpenseIds = new Set(normalized.expenses.map((expense) => expense.id));
  normalized.expenses = normalized.expenses.concat(
    seededTripExpenses.filter((expense) => !existingExpenseIds.has(expense.id)),
  );
  normalized.expenses = normalized.expenses.map((expense) => {
    if (expense.id !== "e-ny-019" || expense.amount !== 584) return expense;
    const owes = splitEqually(583, expense.splits.length);
    return {
      ...expense,
      amount: 583,
      splits: expense.splits.map((split, index) => ({
        ...split,
        owes: owes[index],
        paid: split.personId === ME ? 583 : 0,
      })),
    };
  });
  const mergedNewYorkMatches = { ...normalized.reconciliation.matches };
  Object.entries(DEFAULT_NEW_YORK_MATCHES).forEach(([expenseId, rightKeys]) => {
    const key = `new-york-${expenseId}`;
    if (!mergedNewYorkMatches[key]) mergedNewYorkMatches[key] = rightKeys;
  });
  normalized.reconciliation = {
    ...normalized.reconciliation,
    matches: mergedNewYorkMatches,
  };
  const savedTripExpenses = normalized.expenses.filter(
    (expense) => expense.groupId === "g-portugal"
      || expense.groupId === "g-peru"
      || expense.groupId === "g-new-york",
  );
  const reconciliationExpenses = savedTripExpenses.length > 0
    ? savedTripExpenses
    : seedState().expenses.filter(
      (expense) => expense.groupId === "g-portugal"
        || expense.groupId === "g-peru"
        || expense.groupId === "g-new-york",
    );
  normalized.reconciliation.workspace = ensureReconciliationWorkspace(
    normalized.reconciliation,
    reconciliationExpenses,
  );
  const workspace = normalized.reconciliation.workspace;
  const workspaceById = new Map(workspace.transactions.map((transaction) => [transaction.id, transaction]));
  const existingMatchIds = new Set(workspace.matchGroups.flatMap((group) => [...group.leftIds, ...group.rightIds]));
  const autoGroups: ReconciliationMatchGroup[] = [];
  Object.entries(DEFAULT_NEW_YORK_MATCHES).forEach(([expenseId, legacyRightKeys]) => {
    const leftId = `wl:new-york:${expenseId}`;
    const rightIds = legacyRightKeys.map((key) => `scotia:new-york:${key.replace("scotia:", "")}`);
    const left = workspaceById.get(leftId);
    const right = rightIds.map((id) => workspaceById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const totalRight = right.reduce((sum, item) => sum + item.postedCadCents, 0);
    if (!left || right.length !== rightIds.length || left.postedCadCents !== totalRight) return;
    if ([left.id, ...rightIds].some((id) => existingMatchIds.has(id))) return;
    const group: ReconciliationMatchGroup = {
      id: `auto:new-york:${expenseId}`,
      tripId: "new-york",
      leftIds: [left.id],
      rightIds,
      matchType: "1 left ↔ 1 right",
      status: "confirmed",
      leftTotalCents: left.postedCadCents,
      rightTotalCents: totalRight,
      differenceCents: 0,
      confidence: "high",
      explanation: ["Matched to the imported Scotiabank charge by amount and trip context"],
      createdAt: new Date(0).toISOString(),
      confirmedAt: new Date(0).toISOString(),
    };
    autoGroups.push(group);
    existingMatchIds.add(left.id);
    rightIds.forEach((id) => existingMatchIds.add(id));
  });
  if (autoGroups.length > 0) {
    const autoIds = new Set(autoGroups.flatMap((group) => [...group.leftIds, ...group.rightIds]));
    normalized.reconciliation.workspace = {
      ...workspace,
      transactions: workspace.transactions.map((transaction) => autoIds.has(transaction.id) ? { ...transaction, status: "reconciled" as const } : transaction),
      matchGroups: [...workspace.matchGroups, ...autoGroups],
      auditEvents: [...workspace.auditEvents, {
        id: "audit-new-york-card-import",
        tripId: "new-york",
        action: "match",
        timestamp: new Date(0).toISOString(),
        summary: `Auto-matched ${autoGroups.length} New York card charges from the imported statement`,
        transactionIds: [...autoIds],
      }],
    };
  }
  return normalized;
}

function emptyState(): AppState {
  return normalizeState(seedState());
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

export type CloudStatus = "local" | "connecting" | "saving" | "synced" | "error" | "conflict";

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
  useCloudVersion: () => Promise<void>;
  keepLocalVersion: () => Promise<void>;
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
  const cloudRevision = useRef(0);
  const conflictActive = useRef(false);

  useEffect(() => {
    stateRef.current = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    if (!syncKey || !remoteReady || conflictActive.current) return;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setCloudStatus("saving");
    saveTimer.current = window.setTimeout(async () => {
      try {
        const result = await saveCloudState(syncKey, stateRef.current, cloudRevision.current);
        cloudRevision.current = result.revision;
        setLastSavedAt(result.updatedAt);
        setCloudError(null);
        setCloudStatus("synced");
      } catch (error) {
        setCloudError(error instanceof Error ? error.message : "Online saving failed.");
        if (error instanceof CloudSyncError && error.status === 409) {
          conflictActive.current = true;
          setCloudStatus("conflict");
        } else {
          setCloudStatus("error");
        }
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
        cloudRevision.current = ledger.revision;
        conflictActive.current = false;
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
      const result = await saveCloudState(key, stateRef.current, 0);
      cloudRevision.current = result.revision;
      conflictActive.current = false;
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
      cloudRevision.current = ledger.revision;
      conflictActive.current = false;
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
    cloudRevision.current = 0;
    conflictActive.current = false;
    setCloudStatus("local");
  }, []);

  const retryCloud = useCallback(async () => {
    if (!syncKey) return;
    setCloudStatus("saving");
    setCloudError(null);
    try {
      const result = await saveCloudState(syncKey, stateRef.current, cloudRevision.current);
      cloudRevision.current = result.revision;
      setRemoteReady(true);
      setLastSavedAt(result.updatedAt);
      setCloudStatus("synced");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Online saving failed.");
      if (error instanceof CloudSyncError && error.status === 409) {
        conflictActive.current = true;
        setCloudStatus("conflict");
      } else {
        setCloudStatus("error");
      }
    }
  }, [syncKey]);

  const useCloudVersion = useCallback(async () => {
    if (!syncKey) return;
    setCloudStatus("connecting");
    try {
      const ledger = await loadCloudState(syncKey);
      if (!ledger) throw new CloudSyncError("The online ledger was not found.", 404);
      cloudRevision.current = ledger.revision;
      conflictActive.current = false;
      dispatch({ type: "replace", state: ledger.state });
      setLastSavedAt(ledger.updatedAt);
      setCloudError(null);
      setRemoteReady(true);
      setCloudStatus("synced");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not load the online version.");
      setCloudStatus("error");
    }
  }, [syncKey]);

  const keepLocalVersion = useCallback(async () => {
    if (!syncKey) return;
    setCloudStatus("saving");
    try {
      const result = await saveCloudState(syncKey, stateRef.current, cloudRevision.current, true);
      cloudRevision.current = result.revision;
      conflictActive.current = false;
      setLastSavedAt(result.updatedAt);
      setCloudError(null);
      setRemoteReady(true);
      setCloudStatus("synced");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not keep the local version.");
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
      useCloudVersion,
      keepLocalVersion,
    }),
    [
      cloudError,
      cloudStatus,
      connectCloud,
      disconnectCloud,
      enableCloud,
      lastSavedAt,
      keepLocalVersion,
      retryCloud,
      syncKey,
      useCloudVersion,
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
