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
import { DEFAULT_EXPENSE_EXPORT_TRANSACTIONS, DEFAULT_NEW_YORK_MATCHES, DEFAULT_PERU_CASH_TRANSACTIONS, DEFAULT_PORTUGAL_CASH_TRANSACTIONS, DEFAULT_SCOTIABANK_TRANSACTIONS } from "./reconciliationData";
import { ensureReconciliationWorkspace, removeExpenseFromReconciliation, resizeExpenseAmount, syncExpenseToReconciliation } from "./reconciliation";
import { seedState } from "./seed";
import { normalizeExpenseCategory } from "./utils/categories";
import { splitEqually } from "./utils/money";

export const ME = "me";

const STORAGE_KEY = "splitwiser-state-v2";
export const GREEN_HEART_PAYMENT_MIGRATION = "portugal-green-heart-linked-payments-2026-08-04";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export type Action =
  | { type: "addPerson"; person: Person }
  | { type: "addGroup"; group: Group }
  | { type: "updateGroup"; group: Group }
  | { type: "deleteGroup"; groupId: string }
  | { type: "addExpense"; expense: Expense }
  | { type: "updateExpense"; expense: Expense }
  | { type: "updateLinkedExpense"; expense: Expense; reconciliation: ReconciliationState }
  | { type: "deleteExpense"; expenseId: string }
  | { type: "addSettlement"; settlement: Settlement }
  | { type: "deleteSettlement"; settlementId: string }
  | { type: "updateReconciliation"; reconciliation: ReconciliationState }
  | { type: "replace"; state: AppState }
  | { type: "hydrate"; state: AppState };

export function reducer(state: AppState, action: Action): AppState {
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
      {
        const groupExpenseIds = state.expenses
          .filter((expense) => expense.groupId === action.groupId)
          .map((expense) => expense.id);
        const reconciliation = groupExpenseIds.reduce(
          (current, expenseId) => removeExpenseFromReconciliation(current, expenseId),
          state.reconciliation,
        );
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.groupId),
        expenses: state.expenses.filter((e) => e.groupId !== action.groupId),
        settlements: state.settlements.filter((s) => s.groupId !== action.groupId),
        reconciliation,
      };
      }
    case "addExpense":
      return {
        ...state,
        expenses: [...state.expenses, action.expense],
        reconciliation: syncExpenseToReconciliation(state.reconciliation, action.expense),
      };
    case "updateExpense":
      return {
        ...state,
        expenses: state.expenses.map((e) => (e.id === action.expense.id ? action.expense : e)),
        reconciliation: syncExpenseToReconciliation(state.reconciliation, action.expense),
      };
    case "updateLinkedExpense":
      return {
        ...state,
        expenses: state.expenses.map((e) => (e.id === action.expense.id ? action.expense : e)),
        reconciliation: action.reconciliation,
      };
    case "deleteExpense":
      return {
        ...state,
        expenses: state.expenses.filter((e) => e.id !== action.expenseId),
        reconciliation: removeExpenseFromReconciliation(state.reconciliation, action.expenseId),
      };
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
    case "hydrate":
      return action.state;
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
    portugalCashTransactions: DEFAULT_PORTUGAL_CASH_TRANSACTIONS,
    cardTransactions: DEFAULT_SCOTIABANK_TRANSACTIONS,
    exportTransactions: DEFAULT_EXPENSE_EXPORT_TRANSACTIONS,
  };
}

function emptyReconciliation(): ReconciliationState {
  return {
    decisions: {},
    matches: {},
    cashRemaining: "",
    cashTransactions: DEFAULT_PERU_CASH_TRANSACTIONS,
    portugalCashTransactions: DEFAULT_PORTUGAL_CASH_TRANSACTIONS,
    cardTransactions: DEFAULT_SCOTIABANK_TRANSACTIONS,
    exportTransactions: DEFAULT_EXPENSE_EXPORT_TRANSACTIONS,
  };
}

function mergeStatementTransactions<T extends { id: string }>(
  canonical: T[],
  saved: T[] | undefined,
): T[] {
  if (!saved) return canonical;
  const savedIds = new Set(saved.map((item) => item.id));
  return [...saved, ...canonical.filter((item) => !savedIds.has(item.id))];
}

export function applyGreenHeartPaymentMigration(state: AppState): AppState {
  if (state.dataMigrations.includes(GREEN_HEART_PAYMENT_MIGRATION)) return state;
  const expense = state.expenses.find((item) => item.id === "e-pt-049");
  if (!expense) return state;
  const paymentNote = "Paid in two card payments: Hostelworld and Green Heart Hostel.";
  const updatedExpense = {
    ...resizeExpenseAmount(expense, 45500),
    notes: expense.notes?.includes(paymentNote)
      ? expense.notes
      : [expense.notes, paymentNote].filter(Boolean).join(" "),
  };
  return {
    ...state,
    expenses: state.expenses.map((item) => item.id === updatedExpense.id ? updatedExpense : item),
    reconciliation: syncExpenseToReconciliation(state.reconciliation, updatedExpense),
    dataMigrations: [...state.dataMigrations, GREEN_HEART_PAYMENT_MIGRATION],
  };
}

/** Where a ledger came from. Legacy browser-storage keys belong to a single
 * device, so they are only folded in for state read off this device. Merging
 * them into a ledger pulled from the cloud would let one phone push its own
 * private history over everyone else's numbers. */
type StateSource = "local" | "remote";

function normalizeState(
  state: Omit<AppState, "reconciliation"> & Partial<AppState>,
  source: StateSource = "local",
): AppState {
  const savedReconciliation = state.reconciliation;
  const legacy = source === "local" ? loadLegacyReconciliation() : emptyReconciliation();
  let normalized = addCentralAmericaTrip({
    ...state,
    dataMigrations: state.dataMigrations ?? [],
    reconciliation: {
      ...legacy,
      ...savedReconciliation,
      matches: savedReconciliation?.matches ?? {},
      cashTransactions: mergeStatementTransactions(
        DEFAULT_PERU_CASH_TRANSACTIONS,
        savedReconciliation?.cashTransactions,
      ),
      portugalCashTransactions: mergeStatementTransactions(
        DEFAULT_PORTUGAL_CASH_TRANSACTIONS,
        savedReconciliation?.portugalCashTransactions,
      ),
      cardTransactions: {
        portugal: mergeStatementTransactions(
          DEFAULT_SCOTIABANK_TRANSACTIONS.portugal,
          savedReconciliation?.cardTransactions?.portugal,
        ),
        peru: mergeStatementTransactions(
          DEFAULT_SCOTIABANK_TRANSACTIONS.peru,
          savedReconciliation?.cardTransactions?.peru,
        ),
        newYork: mergeStatementTransactions(
          DEFAULT_SCOTIABANK_TRANSACTIONS.newYork,
          savedReconciliation?.cardTransactions?.newYork,
        ),
      },
      exportTransactions: {
        portugal: mergeStatementTransactions(
          DEFAULT_EXPENSE_EXPORT_TRANSACTIONS.portugal,
          savedReconciliation?.exportTransactions?.portugal,
        ),
        peru: mergeStatementTransactions(
          DEFAULT_EXPENSE_EXPORT_TRANSACTIONS.peru,
          savedReconciliation?.exportTransactions?.peru,
        ),
        newYork: mergeStatementTransactions(
          DEFAULT_EXPENSE_EXPORT_TRANSACTIONS.newYork,
          savedReconciliation?.exportTransactions?.newYork,
        ),
      },
    },
  });
  normalized.expenses = normalized.expenses.map((expense) => ({
    ...expense,
    category: normalizeExpenseCategory(expense.category, expense.description),
  }));
  const seededTripExpenses = seedState().expenses
    .filter((expense) => expense.id.startsWith("e-ny-card-"))
    .map((expense) => ({
      ...expense,
      category: normalizeExpenseCategory(expense.category, expense.description),
    }));
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
  normalized = applyGreenHeartPaymentMigration(normalized);
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
  refresh: () => Promise<void>;
  useCloudVersion: () => Promise<void>;
  keepLocalVersion: () => Promise<void>;
}

/** How often a connected device re-reads the online ledger while it is the
 * visible tab, so two devices left open converge without anyone tapping. */
const POLL_INTERVAL_MS = 15_000;

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
  /** Serialized copy of the ledger as it last stood online. Anything equal to
   * this needs no upload, which keeps a freshly pulled ledger from bouncing
   * straight back and bumping the revision on every device that opens it. */
  const syncedSnapshot = useRef<string | null>(null);

  useEffect(() => {
    const serialized = JSON.stringify(state);
    stateRef.current = state;
    localStorage.setItem(STORAGE_KEY, serialized);

    if (!syncKey || !remoteReady || conflictActive.current) return;
    if (serialized === syncedSnapshot.current) {
      setCloudStatus("synced");
      return;
    }

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setCloudStatus("saving");
    saveTimer.current = window.setTimeout(async () => {
      try {
        const pending = JSON.stringify(stateRef.current);
        const result = await saveCloudState(syncKey, stateRef.current, cloudRevision.current);
        cloudRevision.current = result.revision;
        syncedSnapshot.current = pending;
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

  /** Adopt a ledger read from the server as the truth for this device. */
  const adoptRemoteLedger = useCallback(
    (ledger: { state: AppState; revision: number; updatedAt: string }) => {
      const normalized = normalizeState(ledger.state, "remote");
      cloudRevision.current = ledger.revision;
      // Compare against what the server holds, not the normalized copy: if
      // normalizing added anything the server has not seen, the save effect
      // uploads it once and both devices settle on the same ledger.
      syncedSnapshot.current = JSON.stringify(ledger.state);
      conflictActive.current = false;
      dispatch({ type: "hydrate", state: normalized });
      setLastSavedAt(ledger.updatedAt);
      setCloudError(null);
      setRemoteReady(true);
      setCloudStatus("synced");
    },
    [],
  );

  /** Re-read the online ledger. `background` keeps the routine polls quiet so
   * the badge does not flicker while nothing has actually changed. */
  const pullFromCloud = useCallback(
    async (background = false, signal?: AbortSignal) => {
      if (!syncKey) return;
      if (!background) {
        setCloudStatus("connecting");
        setCloudError(null);
      }
      try {
        const ledger = await loadCloudState(syncKey, signal);
        if (signal?.aborted) return;
        if (!ledger) {
          throw new CloudSyncError("This sync key does not have an online ledger.", 404);
        }
        if (background) {
          // Nothing new online: leave this device alone.
          if (ledger.revision === cloudRevision.current) return;
          // Something newer is online, but this device also holds edits that
          // were never uploaded. Never silently drop them — ask instead.
          const local = JSON.stringify(stateRef.current);
          if (syncedSnapshot.current !== null && local !== syncedSnapshot.current) {
            conflictActive.current = true;
            setCloudError("This ledger changed on another device. Choose which version to keep.");
            setCloudStatus("conflict");
            return;
          }
        }
        adoptRemoteLedger(ledger);
      } catch (error) {
        if (signal?.aborted) return;
        if (!background) setRemoteReady(false);
        setCloudError(
          error instanceof Error ? error.message : "Could not open the online ledger.",
        );
        setCloudStatus("error");
      }
    },
    [adoptRemoteLedger, syncKey],
  );

  useEffect(() => {
    if (!syncKey) return;
    const controller = new AbortController();
    void pullFromCloud(false, controller.signal);
    return () => controller.abort();
  }, [pullFromCloud, syncKey]);

  // Keep every connected device current: poll while visible, and pull again
  // the moment the tab is brought back or the network returns. Phones freeze
  // background tabs rather than reload them, so without this a phone can sit
  // on a snapshot from days ago.
  useEffect(() => {
    if (!syncKey) return;

    const refreshIfIdle = () => {
      if (document.visibilityState !== "visible") return;
      if (conflictActive.current) return;
      void pullFromCloud(true);
    };

    const interval = window.setInterval(refreshIfIdle, POLL_INTERVAL_MS);
    window.addEventListener("focus", refreshIfIdle);
    window.addEventListener("online", refreshIfIdle);
    document.addEventListener("visibilitychange", refreshIfIdle);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfIdle);
      window.removeEventListener("online", refreshIfIdle);
      document.removeEventListener("visibilitychange", refreshIfIdle);
    };
  }, [pullFromCloud, syncKey]);

  const enableCloud = useCallback(async (): Promise<string | null> => {
    const key = generateSyncKey();
    setCloudStatus("connecting");
    setCloudError(null);
    try {
      const uploaded = JSON.stringify(stateRef.current);
      const result = await saveCloudState(key, stateRef.current, 0);
      cloudRevision.current = result.revision;
      syncedSnapshot.current = uploaded;
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
      adoptRemoteLedger(ledger);
      localStorage.setItem(SYNC_KEY_STORAGE_KEY, key);
      setSyncKey(key);
      return true;
    } catch (error) {
      setRemoteReady(false);
      setCloudError(error instanceof Error ? error.message : "Could not connect this ledger.");
      setCloudStatus("error");
      return false;
    }
  }, [adoptRemoteLedger]);

  const disconnectCloud = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    localStorage.removeItem(SYNC_KEY_STORAGE_KEY);
    setSyncKey(null);
    setRemoteReady(false);
    setLastSavedAt(null);
    setCloudError(null);
    cloudRevision.current = 0;
    conflictActive.current = false;
    syncedSnapshot.current = null;
    setCloudStatus("local");
  }, []);

  const retryCloud = useCallback(async () => {
    if (!syncKey) return;
    setCloudStatus("saving");
    setCloudError(null);
    try {
      const pending = JSON.stringify(stateRef.current);
      const result = await saveCloudState(syncKey, stateRef.current, cloudRevision.current);
      cloudRevision.current = result.revision;
      syncedSnapshot.current = pending;
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
      adoptRemoteLedger(ledger);
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not load the online version.");
      setCloudStatus("error");
    }
  }, [adoptRemoteLedger, syncKey]);

  const keepLocalVersion = useCallback(async () => {
    if (!syncKey) return;
    setCloudStatus("saving");
    try {
      const pending = JSON.stringify(stateRef.current);
      const result = await saveCloudState(syncKey, stateRef.current, cloudRevision.current, true);
      cloudRevision.current = result.revision;
      syncedSnapshot.current = pending;
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
      refresh: () => pullFromCloud(false),
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
      pullFromCloud,
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
