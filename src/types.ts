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
  status?: "open" | "closed";
  closedAt?: number;
}

export interface ExpenseSplit {
  personId: string;
  /** amount this person owes, in cents */
  owes: number;
  /** amount this person paid, in cents */
  paid: number;
}

export type ExpenseCategory =
  | "flights"
  | "lodging"
  | "car-rental"
  | "transit"
  | "food"
  | "drinks"
  | "sightseeing"
  | "activities"
  | "shopping"
  | "gas"
  | "groceries"
  | "other"
  // Legacy values remain readable so older local and cloud ledgers can be
  // normalized without rejecting or erasing their expenses.
  | "general"
  | "rent"
  | "utilities"
  | "transport"
  | "travel"
  | "entertainment"
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

export type ReconciliationDecision = "include" | "exclude" | "personal" | "review";

export interface StatementTransaction {
  id: string;
  date: string;
  description: string;
  detail: string;
  amount: number;
}

export type CashTransaction = StatementTransaction;

/** Stable slug for a reconciliation workspace. Seeded trips use the three
 * well-known slugs below, while user-created workspaces get their own ids. */
export type ReconciliationTripId = string;
export type ReconciliationSide = "left" | "right";
export type ReconciliationQueue =
  | "unmatched"
  | "suggested"
  | "exception"
  | "excluded"
  | "reconciled";
export type ReconciliationAccountType = "wanderlog" | "card" | "cash";

export interface ReconciliationSource {
  id: string;
  tripId: ReconciliationTripId;
  type: "wanderlog" | "bank" | "cash" | "import";
  institution: string;
  account: string;
  currency: string;
  importedAt: string;
  filename?: string;
  fingerprint: string;
}

export interface ReconciliationTransaction {
  id: string;
  sourceId: string;
  tripId: ReconciliationTripId;
  side: ReconciliationSide;
  accountType: ReconciliationAccountType;
  date: string;
  postedDate: string;
  description: string;
  merchant: string;
  reference: string;
  category: string;
  currency: string;
  originalAmountCents: number;
  postedCadCents: number;
  status: ReconciliationQueue;
  normalizedText: string;
  duplicateFingerprint: string;
  raw: Record<string, string>;
  notes?: string;
  supportNote?: string;
}

export interface ReconciliationAdjustment {
  amountCents: number;
  reason: ReconciliationExceptionReason;
  note: string;
}

export interface ReconciliationMatchGroup {
  id: string;
  tripId: ReconciliationTripId;
  leftIds: string[];
  rightIds: string[];
  matchType: string;
  status: "draft" | "suggested" | "ambiguous" | "confirmed";
  leftTotalCents: number;
  rightTotalCents: number;
  differenceCents: number;
  confidence?: "high" | "medium" | "low";
  explanation: string[];
  adjustment?: ReconciliationAdjustment;
  createdAt: string;
  confirmedAt?: string;
}

export interface ReconciliationMatchRule {
  id: string;
  name: string;
  priority: number;
  tripId?: ReconciliationTripId;
  sourceIds: string[];
  merchantContains?: string;
  referenceContains?: string;
  dateToleranceDays: number;
  amountToleranceCents: number;
  enabled: boolean;
}

export type ReconciliationExceptionReason =
  | "timing"
  | "fx"
  | "fee"
  | "missing-wanderlog"
  | "missing-statement"
  | "cash"
  | "duplicate"
  | "personal"
  | "refund"
  | "other";

export interface ReconciliationException {
  id: string;
  tripId: ReconciliationTripId;
  transactionIds: string[];
  reason: ReconciliationExceptionReason;
  note: string;
  amountCents: number;
  resolved: boolean;
  createdAt: string;
}

export interface ReconciliationAuditEvent {
  id: string;
  tripId: ReconciliationTripId;
  action: "migrate" | "import" | "edit" | "match" | "unmatch" | "exclude" | "support" | "adjust" | "close" | "reopen" | "archive";
  timestamp: string;
  summary: string;
  transactionIds: string[];
  before?: string;
  after?: string;
}

export interface ReconciliationPeriod {
  tripId: ReconciliationTripId;
  status: "open" | "closed";
  name?: string;
  dates?: string;
  closedAt?: string;
  reopenedAt?: string;
  closeSnapshot?: string;
  archivedAt?: string;
}

export interface ReconciliationWorkspace {
  schemaVersion: 2;
  sources: ReconciliationSource[];
  transactions: ReconciliationTransaction[];
  matchGroups: ReconciliationMatchGroup[];
  rules: ReconciliationMatchRule[];
  exceptions: ReconciliationException[];
  auditEvents: ReconciliationAuditEvent[];
  periods: ReconciliationPeriod[];
  savedViews: Array<{ id: string; name: string; query: string; queue: ReconciliationQueue }>;
  importMappings: Array<{ id: string; name: string; sourceType: string; columns: Record<string, string> }>;
}

export interface ReconciliationState {
  decisions: Record<string, ReconciliationDecision>;
  /** Wanderlog line key -> statement/cash transaction keys linked to it. */
  matches: Record<string, string[]>;
  cashRemaining: string;
  cashTransactions: CashTransaction[];
  portugalCashTransactions: CashTransaction[];
  cardTransactions: {
    portugal: StatementTransaction[];
    peru: StatementTransaction[];
    newYork: StatementTransaction[];
  };
  exportTransactions: {
    portugal: StatementTransaction[];
    peru: StatementTransaction[];
    newYork: StatementTransaction[];
  };
  /** Versioned transaction-matching model. Legacy fields remain for migration compatibility. */
  workspace?: ReconciliationWorkspace;
}

export interface AppState {
  people: Person[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  reconciliation: ReconciliationState;
  dataMigrations: string[];
}
