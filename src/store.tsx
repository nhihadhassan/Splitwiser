import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { AppState, Expense, Group, Person, Settlement } from "./types";
import { seedState } from "./seed";

export const ME = "me";

// Bumped to v2 to drop the old Apartment/Lisbon demo and load the Portugal seed.
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
  | { type: "reset" };

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
    case "reset":
      return seedState();
  }
}

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.people && parsed.groups && parsed.expenses && parsed.settlements) {
        return parsed;
      }
    }
  } catch {
    // corrupted storage falls through to the seed
  }
  return seedState();
}

interface StoreValue {
  state: AppState;
  dispatch: (action: Action) => void;
  peopleById: Map<string, Person>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const peopleById = useMemo(
    () => new Map(state.people.map((p) => [p.id, p])),
    [state.people],
  );

  const value = useMemo(() => ({ state, dispatch, peopleById }), [state, peopleById]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}
