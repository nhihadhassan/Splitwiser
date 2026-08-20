import type { DestinationMotif } from "./utils/destinations.js";

export type SplitMethod = "equally" | "exact" | "percentage" | "shares" | "adjustment";

export type GroupType = "trip" | "home" | "couple" | "other";
export type CurrencyCode = string;

/** A saved quote, expressed as a decimal string so money never passes through
 * floating point arithmetic. `rate` converts originalCurrency to homeCurrency. */
export interface FxSnapshot {
  rate: string;
  rateDate: string;
  source: "identity" | "frankfurter" | "manual";
  fetchedAt?: string;
}

export type AccountRole = "owner" | "member";

export interface CapabilitySet {
  manageInvites: boolean;
  manageAllGroups: boolean;
  reconcile: boolean;
  moderateSocial: boolean;
}

export interface SessionProfile {
  accountId: string;
  personId: string;
  role: AccountRole;
  displayName: string;
  capabilities: CapabilitySet;
}

export interface Person {
  id: string;
  name: string;
  email?: string;
  /** color used for the avatar */
  color: string;
  avatarUrl?: string;
  claimed?: boolean;
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
  startDate?: string;
  endDate?: string;
  createdBy?: string;
  /** Accounting currency for this group. Legacy groups are CAD. */
  homeCurrency?: CurrencyCode;
  /** Manual override for the destination icon; falls back to name-based detection. */
  icon?: DestinationMotif;
}

export interface ReceiptAttachment {
  id: string;
  storagePath: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
  merchant?: string;
  totalCents?: number;
  receiptDate?: string;
  createdAt: number;
  createdBy: string;
}

export interface ReceiptParticipantAllocation {
  personId: string;
  /** Minor units in the receipt's original currency. */
  amountMinor: number;
}

export interface ReceiptLineItem {
  id: string;
  description: string;
  quantity?: number;
  amountMinor: number;
  allocations: ReceiptParticipantAllocation[];
}

export interface ReceiptCharge {
  kind: "tax" | "tip" | "discount" | "fee" | "rounding" | "other";
  label: string;
  amountMinor: number;
  allocations: ReceiptParticipantAllocation[];
}

/** Confirmed receipt allocations only. Raw OCR text never enters AppState. */
export interface ReceiptAllocation {
  currency: CurrencyCode;
  totalMinor: number;
  items: ReceiptLineItem[];
  charges: ReceiptCharge[];
  participantTotalsMinor: ReceiptParticipantAllocation[];
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
  updatedAt?: number;
  updatedBy?: string;
  receipt?: ReceiptAttachment;
  homeCurrency?: CurrencyCode;
  originalCurrency?: CurrencyCode;
  originalAmountMinor?: number;
  fx?: FxSnapshot;
  receiptAllocation?: ReceiptAllocation;
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
  updatedAt?: number;
  updatedBy?: string;
  currency?: CurrencyCode;
}

export type FinancialActivityKind =
  | "expense-created"
  | "expense-updated"
  | "expense-deleted"
  | "settlement-created"
  | "settlement-deleted"
  | "group-created"
  | "group-updated"
  | "group-closed"
  | "group-reopened";

export interface FinancialActivityEvent {
  id: string;
  kind: FinancialActivityKind;
  actorPersonId: string;
  groupId: string | null;
  entityId: string;
  summary: string;
  createdAt: number;
}

export type SocialScope = "group" | "expense";

export interface Reaction {
  emoji: "👍" | "❤️" | "😂" | "👀" | "✅";
  personIds: string[];
}

export interface SocialItem {
  id: string;
  groupId: string;
  scope: SocialScope;
  scopeId: string;
  authorPersonId: string;
  body: string;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
  reactions: Reaction[];
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
  /** Generic home-currency amount. `postedCadCents` remains readable for V3. */
  postedHomeCents?: number;
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
  secondaryCashTransactions: CashTransaction[];
  cardTransactions: Record<string, StatementTransaction[]>;
  exportTransactions: Record<string, StatementTransaction[]>;
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
  financialActivity?: FinancialActivityEvent[];
  /** Workspace display/default currency. Legacy workspaces default to CAD. */
  defaultCurrency?: CurrencyCode;
}

export interface AccountLink {
  accountId: string;
  personId: string;
  role: AccountRole;
  status: "active" | "disabled";
  linkedAt: number;
}

export interface WorkspaceEnvelopeV3 {
  version: 3;
  revision: number;
  updatedAt: string;
  ownerPersonId: string;
  accountLinks: AccountLink[];
  appliedMutationIds: string[];
  receiptUsageBytes: number;
  state: AppState;
}

export interface AuthorizedSnapshot {
  version: 3;
  revision: number;
  updatedAt: string;
  session: SessionProfile;
  state: AppState;
}

export type FinancialMutation =
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
  | { type: "updateReconciliation"; reconciliation: ReconciliationState };

export interface MutationCommand {
  id: string;
  baseRevision: number;
  createdAt: number;
  mutation: FinancialMutation;
}
