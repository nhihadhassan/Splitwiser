export type SplitMethod = "equally" | "exact" | "percentage" | "shares" | "adjustment";

export type GroupType = "trip" | "home" | "couple" | "other";

export interface Person {
  id: string;
  name: string;
  email?: string;
  /** color used for the avatar */
  color: string;
  /** the app user is the person with id "me" */
}

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  memberIds: string[];
  createdAt: number;
  simplifyDebts: boolean;
}

export interface ExpenseSplit {
  personId: string;
  /** amount this person owes, in cents */
  owes: number;
  /** amount this person paid, in cents */
  paid: number;
}

export type ExpenseCategory =
  | "general"
  | "food"
  | "groceries"
  | "rent"
  | "utilities"
  | "transport"
  | "travel"
  | "entertainment"
  | "shopping"
  | "medical";

export interface Expense {
  id: string;
  description: string;
  /** total in cents */
  amount: number;
  category: ExpenseCategory;
  date: string; // yyyy-mm-dd
  groupId: string | null; // null = non-group expense
  splitMethod: SplitMethod;
  splits: ExpenseSplit[];
  notes?: string;
  createdAt: number;
  createdBy: string;
}

export interface Settlement {
  id: string;
  fromId: string;
  toId: string;
  /** cents */
  amount: number;
  date: string;
  groupId: string | null;
  createdAt: number;
  createdBy: string;
}

export interface AppState {
  people: Person[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
}
