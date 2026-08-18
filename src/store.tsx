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
  SessionProfile,
  Settlement,
  FinancialMutation,
  MutationCommand,
} from "./types";
import {
  CloudSyncError,
  loadAuthorizedState,
  sendMutation,
  type TokenProvider,
} from "./cloud";
import { applyFinancialMutation } from "./domain";
import { cancelQueuedExpenseCreate, loadOfflineAccount, replayOfflineOutbox, saveOfflineAccount } from "./offline";
import { ensureReconciliationWorkspace, removeExpenseFromReconciliation, syncExpenseToReconciliation } from "./reconciliation";
import { seedState } from "./seed";
import { normalizeExpenseCategory } from "./utils/categories";

export const ME = "me";

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
  | { type: "setTripStatus"; groupId: string; status: "open" | "closed"; reason?: string; allowUnreconciled?: boolean }
  | { type: "updateReconciliation"; reconciliation: ReconciliationState }
  | { type: "applyCommand"; mutation: FinancialMutation; actorPersonId: string }
  | { type: "replace"; state: AppState }
  | { type: "hydrate"; state: AppState };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "applyCommand":
      return applyFinancialMutation(state, action.mutation, action.actorPersonId);
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
        reconciliation: syncExpenseToReconciliation(state.reconciliation, action.expense, [...state.expenses, action.expense]),
      };
    case "updateExpense":
      return {
        ...state,
        expenses: state.expenses.map((e) => (e.id === action.expense.id ? action.expense : e)),
        reconciliation: syncExpenseToReconciliation(state.reconciliation, action.expense, state.expenses),
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
    case "setTripStatus":
      return applyFinancialMutation(state, action, state.people[0]?.id ?? ME);
    case "replace":
      return normalizeState(action.state);
    case "hydrate":
      return action.state;
  }
}

function normalizeState(
  state: Omit<AppState, "reconciliation"> & Partial<AppState>,
): AppState {
  const fallback = seedState().reconciliation;
  const saved = state.reconciliation ?? fallback;
  const normalized: AppState = {
    ...state,
    dataMigrations: state.dataMigrations ?? [],
    reconciliation: {
      ...fallback,
      ...saved,
      decisions: saved.decisions ?? {},
      matches: saved.matches ?? {},
      cashTransactions: saved.cashTransactions ?? [],
      secondaryCashTransactions: saved.secondaryCashTransactions ?? [],
      cardTransactions: saved.cardTransactions ?? {},
      exportTransactions: saved.exportTransactions ?? {},
    },
  } as AppState;
  normalized.expenses = normalized.expenses.map((expense) => ({
    ...expense,
    category: normalizeExpenseCategory(expense.category, expense.description),
    homeCurrency: expense.homeCurrency ?? normalized.groups.find((group) => group.id === expense.groupId)?.homeCurrency ?? state.defaultCurrency ?? "CAD",
    originalCurrency: expense.originalCurrency ?? expense.homeCurrency ?? normalized.groups.find((group) => group.id === expense.groupId)?.homeCurrency ?? state.defaultCurrency ?? "CAD",
    originalAmountMinor: expense.originalAmountMinor ?? expense.amount,
    fx: expense.fx ?? { rate: "1", rateDate: expense.date, source: "identity" },
  }));
  normalized.defaultCurrency = normalized.defaultCurrency ?? "CAD";
  normalized.groups = normalized.groups.map((group) => ({ ...group, homeCurrency: group.homeCurrency ?? normalized.defaultCurrency }));
  normalized.settlements = normalized.settlements.map((settlement) => ({ ...settlement, currency: settlement.currency ?? normalized.groups.find((group) => group.id === settlement.groupId)?.homeCurrency ?? normalized.defaultCurrency }));
  normalized.reconciliation.workspace = ensureReconciliationWorkspace(
    normalized.reconciliation,
    normalized.expenses.filter((expense) => expense.groupId),
  );
  return normalized;
}

function emptyState(): AppState {
  return normalizeState(seedState());
}

export type CloudStatus = "local" | "connecting" | "saving" | "synced" | "error" | "conflict";

interface CloudControls {
  status: CloudStatus;
  error: string | null;
  lastSavedAt: string | null;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
  useCloudVersion: () => Promise<void>;
  keepLocalVersion: () => Promise<void>;
}

interface StoreValue {
  state: AppState;
  dispatch: (action: Action) => void;
  peopleById: Map<string, Person>;
  session: SessionProfile;
  currentPersonId: string;
  getToken: TokenProvider | null;
  undo: { message: string; run: () => void } | null;
  cloud: CloudControls;
}

const StoreContext = createContext<StoreValue | null>(null);

const LOCAL_SESSION: SessionProfile = {
  accountId: "local-owner",
  personId: ME,
  role: "owner",
  displayName: "You",
  capabilities: { manageInvites: true, manageAllGroups: true, reconcile: true, moderateSocial: true },
};

type StoreProviderProps = {
  children: ReactNode;
  accountId: string;
  getToken?: TokenProvider;
  localOnly?: boolean;
};

function isMutationAction(action: Action): action is FinancialMutation {
  return action.type !== "replace" && action.type !== "hydrate" && action.type !== "applyCommand";
}

export function StoreProvider({ children, accountId, getToken, localOnly = false }: StoreProviderProps) {
  const [state, rawDispatch] = useReducer(reducer, undefined, emptyState);
  const [session, setSession] = useState<SessionProfile | null>(localOnly ? LOCAL_SESSION : null);
  const [outbox, setOutbox] = useState<MutationCommand[]>([]);
  const [bootstrapped, setBootstrapped] = useState(localOnly);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(localOnly ? "local" : "connecting");
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [undoTarget, setUndoTarget] = useState<{ expenseId: string; commandId: string; description: string } | null>(null);
  const stateRef = useRef(state);
  const outboxRef = useRef(outbox);
  const sessionRef = useRef(session);
  const cloudRevision = useRef(0);
  const flushing = useRef(false);
  const inFlightCommandId = useRef<string | null>(null);
  const undoTimer = useRef<number | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { outboxRef.current = outbox; }, [outbox]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const adoptSnapshot = useCallback((snapshot: Awaited<ReturnType<typeof loadAuthorizedState>>, pending: MutationCommand[] = []) => {
    cloudRevision.current = snapshot.revision;
    setSession(snapshot.session);
    const normalized = normalizeState(snapshot.state);
    rawDispatch({ type: "hydrate", state: replayOfflineOutbox(normalized, pending, snapshot.session.personId) });
    setLastSavedAt(snapshot.updatedAt);
    setCloudError(null);
    setCloudStatus(pending.length ? "saving" : "synced");
  }, []);

  const pullFromCloud = useCallback(async (background = false, signal?: AbortSignal) => {
    if (localOnly || !getToken) return;
    if (!background) {
      setCloudStatus("connecting");
      setCloudError(null);
    }
    try {
      const snapshot = await loadAuthorizedState(getToken, signal);
      if (signal?.aborted) return;
      if (outboxRef.current.length) {
        if (snapshot.revision !== cloudRevision.current) {
          setSession(snapshot.session);
          setCloudError("This ledger changed on another device while you had offline edits. Choose which version to keep.");
          setCloudStatus("conflict");
        } else {
          adoptSnapshot(snapshot, outboxRef.current);
        }
        return;
      }
      if (background && snapshot.revision === cloudRevision.current) return;
      adoptSnapshot(snapshot);
    } catch (error) {
      if (signal?.aborted) return;
      setCloudError(error instanceof Error ? error.message : "Could not open the private ledger.");
      setCloudStatus("error");
    }
  }, [adoptSnapshot, getToken, localOnly]);

  useEffect(() => {
    const controller = new AbortController();
    if (localOnly) return () => controller.abort();
    void (async () => {
      try {
        const cached = await loadOfflineAccount(accountId);
        if (controller.signal.aborted) return;
        if (cached) {
          cloudRevision.current = cached.revision;
          outboxRef.current = cached.outbox;
          setOutbox(cached.outbox);
          rawDispatch({ type: "hydrate", state: normalizeState(cached.state) });
        }
      } catch {
        // An unavailable cache must not prevent authenticated online access.
      }
      setBootstrapped(true);
      await pullFromCloud(false, controller.signal);
    })();
    return () => controller.abort();
  }, [accountId, localOnly, pullFromCloud]);

  useEffect(() => {
    const refreshIfIdle = () => {
      if (document.visibilityState !== "visible" || outboxRef.current.length) return;
      void pullFromCloud(true);
    };
    window.addEventListener("focus", refreshIfIdle);
    window.addEventListener("online", refreshIfIdle);
    document.addEventListener("visibilitychange", refreshIfIdle);
    return () => {
      window.removeEventListener("focus", refreshIfIdle);
      window.removeEventListener("online", refreshIfIdle);
      document.removeEventListener("visibilitychange", refreshIfIdle);
    };
  }, [pullFromCloud]);

  useEffect(() => {
    if (!bootstrapped) return;
    void saveOfflineAccount({ accountId, revision: cloudRevision.current, state, outbox, updatedAt: Date.now() }).catch(() => undefined);
  }, [accountId, bootstrapped, outbox, state]);

  const flushOutbox = useCallback(async () => {
    if (localOnly || !getToken || flushing.current || !outboxRef.current.length || !sessionRef.current) return;
    flushing.current = true;
    setCloudStatus("saving");
    setCloudError(null);
    try {
      while (outboxRef.current.length) {
        const command = outboxRef.current[0];
        inFlightCommandId.current = command.id;
        const snapshot = await sendMutation(getToken, command);
        const pending = outboxRef.current.filter((item) => item.id !== command.id);
        inFlightCommandId.current = null;
        outboxRef.current = pending;
        setOutbox(pending);
        adoptSnapshot(snapshot, pending);
      }
      setCloudStatus("synced");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Offline changes could not be saved.");
      setCloudStatus(error instanceof CloudSyncError && error.status === 409 ? "conflict" : "error");
    } finally {
      inFlightCommandId.current = null;
      flushing.current = false;
    }
  }, [adoptSnapshot, getToken, localOnly]);

  useEffect(() => { void flushOutbox(); }, [flushOutbox, outbox]);

  const enqueueMutation = useCallback((action: FinancialMutation, offerUndo = false) => {
    const activeSession = sessionRef.current;
    if (!activeSession) return;
    const command: MutationCommand = {
      id: crypto.randomUUID(),
      baseRevision: cloudRevision.current + outboxRef.current.length,
      createdAt: Date.now(),
      mutation: action,
    };
    rawDispatch({ type: "applyCommand", mutation: action, actorPersonId: activeSession.personId });
    if (!localOnly) {
      const pending = [...outboxRef.current, command];
      outboxRef.current = pending;
      setOutbox(pending);
      setCloudStatus(navigator.onLine ? "saving" : "local");
    }
    if (offerUndo && action.type === "addExpense") {
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      setUndoTarget({ expenseId: action.expense.id, commandId: command.id, description: action.expense.description });
      undoTimer.current = window.setTimeout(() => setUndoTarget(null), 8_000);
    }
  }, [localOnly]);

  const dispatch = useCallback((action: Action) => {
    if (!isMutationAction(action)) {
      rawDispatch(action);
      return;
    }
    enqueueMutation(action, action.type === "addExpense");
  }, [enqueueMutation]);

  const undoLastExpense = useCallback(() => {
    if (!undoTarget) return;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    const pendingIndex = outboxRef.current.findIndex((command) => command.id === undoTarget.commandId);
    if (pendingIndex >= 0 && inFlightCommandId.current !== undoTarget.commandId) {
      const cancelled = cancelQueuedExpenseCreate(outboxRef.current, undoTarget.commandId);
      const pending = cancelled.commands;
      outboxRef.current = pending;
      setOutbox(pending);
      const removed = reducer(stateRef.current, { type: "deleteExpense", expenseId: undoTarget.expenseId });
      rawDispatch({
        type: "hydrate",
        state: {
          ...removed,
          financialActivity: removed.financialActivity?.filter((event) => event.entityId !== undoTarget.expenseId),
        },
      });
    } else {
      enqueueMutation({ type: "deleteExpense", expenseId: undoTarget.expenseId });
    }
    setUndoTarget(null);
  }, [enqueueMutation, undoTarget]);

  const retryCloud = useCallback(async () => {
    if (outboxRef.current.length) await flushOutbox();
    else await pullFromCloud(false);
  }, [flushOutbox, pullFromCloud]);

  const useCloudVersion = useCallback(async () => {
    outboxRef.current = [];
    setOutbox([]);
    await pullFromCloud(false);
  }, [pullFromCloud]);

  const keepLocalVersion = useCallback(async () => {
    if (!getToken || !sessionRef.current) return;
    try {
      const snapshot = await loadAuthorizedState(getToken);
      const rebased = outboxRef.current.map((command, index) => ({ ...command, baseRevision: snapshot.revision + index }));
      outboxRef.current = rebased;
      setOutbox(rebased);
      adoptSnapshot(snapshot, rebased);
      await flushOutbox();
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not reapply the offline changes.");
      setCloudStatus("conflict");
    }
  }, [adoptSnapshot, flushOutbox, getToken]);

  const peopleById = useMemo(
    () => new Map(state.people.map((p) => [p.id, p])),
    [state.people],
  );

  const cloud = useMemo<CloudControls>(
    () => ({
      status: cloudStatus,
      error: cloudError,
      lastSavedAt,
      retry: retryCloud,
      refresh: () => pullFromCloud(false),
      useCloudVersion,
      keepLocalVersion,
    }),
    [
      cloudError,
      cloudStatus,
      lastSavedAt,
      keepLocalVersion,
      pullFromCloud,
      retryCloud,
      useCloudVersion,
    ],
  );

  const value = useMemo(
    () => session ? ({
      state,
      dispatch,
      peopleById,
      cloud,
      session,
      currentPersonId: session.personId,
      getToken: getToken ?? null,
      undo: undoTarget ? { message: `Added ${undoTarget.description}`, run: undoLastExpense } : null,
    }) : null,
    [cloud, dispatch, getToken, peopleById, session, state, undoLastExpense, undoTarget],
  );
  if (!value) {
    return (
      <main className="account-loading" aria-live="polite">
        <p className="eyebrow">Private ledger</p>
        <h1>Opening your workspace…</h1>
        {cloudError && <p role="alert">{cloudError}</p>}
      </main>
    );
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}
