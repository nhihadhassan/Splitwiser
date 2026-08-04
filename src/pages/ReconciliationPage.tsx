import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import { useStore } from "../store";
import type {
  ReconciliationExceptionReason,
  ReconciliationMatchGroup,
  ReconciliationQueue,
  ReconciliationTransaction,
  ReconciliationTripId,
  ReconciliationWorkspace,
} from "../types";
import {
  auditEvent,
  cashSummary,
  compareReconciliationTransactions,
  createExpenseFromStatementTransaction,
  formatReconciliationDate,
  generateSuggestions,
  importedTransaction,
  expenseFromReconciliationTransaction,
  linkedExpenseId,
  normalizeSearch,
  previewDelimitedImport,
  reconciliationTotals,
  statementExpenseId,
  updateReconciliationTransaction,
  type ImportPreviewRow,
} from "../reconciliation";
import { centsToInput, formatMoney, parseMoney } from "../utils/money";
import "./ReconciliationPage.css";

type QueueTab = "unmatched" | "suggested" | "exception" | "reconciled" | "excluded";

const tripMeta: Record<string, { name: string; dates: string; note: string }> = {
  portugal: {
    name: "Portugal",
    dates: "Jun 8 – Jun 24, 2026",
    note: "111 Scotiabank charges, €250 cash",
  },
  peru: {
    name: "Peru",
    dates: "Jul 11 – Jul 27, 2026",
    note: "39 Scotiabank charges, 13 Tangerine bookings, 12 cash withdrawals",
  },
  "new-york": {
    name: "New York",
    dates: "Jun 25 – Jun 28, 2026",
    note: "21 Scotiabank charges",
  },
};

const tripGroupIds: Record<ReconciliationTripId, string> = {
  portugal: "g-portugal",
  peru: "g-peru",
  "new-york": "g-new-york",
};

const queueLabels: Record<QueueTab, string> = {
  unmatched: "Unmatched",
  suggested: "Suggested",
  exception: "Exceptions",
  reconciled: "Reconciled",
  excluded: "Excluded",
};

const exceptionReasons: Array<{ value: ReconciliationExceptionReason; label: string }> = [
  { value: "timing", label: "Timing difference" },
  { value: "fx", label: "Foreign-exchange variance" },
  { value: "fee", label: "Bank fee or tax" },
  { value: "missing-wanderlog", label: "Missing Wanderlog item" },
  { value: "missing-statement", label: "Missing statement charge" },
  { value: "cash", label: "Cash discrepancy" },
  { value: "duplicate", label: "Duplicate" },
  { value: "personal", label: "Personal expense" },
  { value: "refund", label: "Refund or reversal" },
  { value: "other", label: "Other" },
];

function money(cents: number): string {
  return formatMoney(cents);
}

function uid(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function download(name: string, content: string, type: string) {
  const href = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(href);
}

function groupType(leftCount: number, rightCount: number): string {
  return `${leftCount} left ↔ ${rightCount} right`;
}

export function ReconciliationPage() {
  const { state, dispatch } = useStore();
  const workspace = state.reconciliation.workspace as ReconciliationWorkspace;
  const [trip, setTrip] = useState<ReconciliationTripId>("portugal");
  const [queue, setQueue] = useState<QueueTab>("unmatched");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [selectedLeft, setSelectedLeft] = useState<string[]>([]);
  const [selectedRight, setSelectedRight] = useState<string[]>([]);
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState<ReconciliationExceptionReason>("fx");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [supportReason, setSupportReason] = useState<ReconciliationExceptionReason>("missing-statement");
  const [supportNote, setSupportNote] = useState("");
  const [endingCash, setEndingCash] = useState(state.reconciliation.cashRemaining || "0.00");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importSource, setImportSource] = useState("scotia-peru");
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importReport, setImportReport] = useState("");
  const [notice, setNotice] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showNewReconciliation, setShowNewReconciliation] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastLeftIndex = useRef<number | null>(null);
  const lastRightIndex = useRef<number | null>(null);
  const suggestions = useMemo(
    () => workspace ? generateSuggestions(workspace, trip) : [],
    [workspace, trip],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSelectedLeft([]);
        setSelectedRight([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const source = workspace?.sources.find((item) => item.tripId === trip && item.type !== "wanderlog");
    setImportSource(source?.id ?? `scotia-${trip}`);
  }, [trip, workspace?.sources]);

  if (!workspace) {
    return <main className="pane pane-wide reconciliation-page"><p>Preparing reconciliation workspace…</p></main>;
  }

  const period = workspace.periods.find((item) => item.tripId === trip)!;
  const currentMeta = tripMeta[trip] ?? {
    name: period.name ?? trip,
    dates: period.dates ?? "No dates set",
    note: `${workspace.transactions.filter((item) => item.tripId === trip).length} imported items`,
  };
  const isClosed = period.status === "closed";
  const isArchived = Boolean(period.archivedAt);
  const isLocked = isClosed || isArchived;
  const transactions = workspace.transactions.filter((item) => item.tripId === trip);
  const sources = workspace.sources.filter((item) => item.tripId === trip);
  const totals = reconciliationTotals(workspace, trip);
  const cash = cashSummary(workspace, Math.round((Number(endingCash) || 0) * 100));
  const confirmedGroups = workspace.matchGroups.filter((group) => group.tripId === trip && group.status === "confirmed");
  const matchedIds = new Set(confirmedGroups.flatMap((group) => [...group.leftIds, ...group.rightIds]));
  const exceptionIds = new Set(
    workspace.exceptions.filter((item) => item.tripId === trip && !item.resolved).flatMap((item) => item.transactionIds),
  );
  const suggestedIds = new Set(suggestions.flatMap((item) => [...item.leftIds, ...item.rightIds]));
  const searchNeedle = normalizeSearch(query);
  const minCents = minAmount === "" ? null : Math.round(Number(minAmount) * 100);
  const maxCents = maxAmount === "" ? null : Math.round(Number(maxAmount) * 100);

  function queueFor(item: ReconciliationTransaction): QueueTab {
    if (item.status === "excluded") return "excluded";
    if (matchedIds.has(item.id) || item.status === "reconciled") return "reconciled";
    if (exceptionIds.has(item.id) || item.status === "exception") return "exception";
    if (suggestedIds.has(item.id)) return "suggested";
    return "unmatched";
  }

  function matchesFilters(item: ReconciliationTransaction): boolean {
    if (queueFor(item) !== queue) return false;
    if (searchNeedle && !item.normalizedText.includes(searchNeedle)) return false;
    if (sourceFilter !== "all" && item.sourceId !== sourceFilter) return false;
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (minCents !== null && Number.isFinite(minCents) && item.postedCadCents < minCents) return false;
    if (maxCents !== null && Number.isFinite(maxCents) && item.postedCadCents > maxCents) return false;
    return true;
  }

  const visibleLeft = transactions
    .filter((item) => item.side === "left" && matchesFilters(item))
    .sort(compareReconciliationTransactions);
  const visibleRight = transactions
    .filter((item) => item.side === "right" && matchesFilters(item))
    .sort(compareReconciliationTransactions);
  const visibleLeftIds = new Set(visibleLeft.map((item) => item.id));
  const visibleRightIds = new Set(visibleRight.map((item) => item.id));
  const hiddenSelected = selectedLeft.filter((id) => !visibleLeftIds.has(id)).length
    + selectedRight.filter((id) => !visibleRightIds.has(id)).length;
  const byId = new Map(workspace.transactions.map((item) => [item.id, item]));
  const selectedLeftTotal = selectedLeft.reduce((sum, id) => sum + (byId.get(id)?.postedCadCents ?? 0), 0);
  const selectedRightTotal = selectedRight.reduce((sum, id) => sum + (byId.get(id)?.postedCadCents ?? 0), 0);
  const adjustmentCents = Math.round((Number(adjustment) || 0) * 100);
  const remainingDifference = selectedLeftTotal - selectedRightTotal - adjustmentCents;
  const canConfirm = !isClosed
    && selectedLeft.length > 0
    && selectedRight.length > 0
    && remainingDifference === 0
    && (adjustmentCents === 0 || adjustmentNote.trim().length > 0);
  const selectedCount = selectedLeft.length + selectedRight.length;
  const tripUnmatched = transactions.filter((item) => queueFor(item) === "unmatched").length;
  const ambiguousCount = suggestions.filter((item) => item.status === "ambiguous").length;
  const canClose = tripUnmatched === 0 && ambiguousCount === 0 && totals.exceptions === 0;
  const categories = [...new Set(transactions.map((item) => item.category))].sort();

  function updateWorkspace(next: ReconciliationWorkspace) {
    dispatch({
      type: "updateReconciliation",
      reconciliation: { ...state.reconciliation, workspace: next },
    });
  }

  function withAudit(
    next: ReconciliationWorkspace,
    action: Parameters<typeof auditEvent>[1],
    summary: string,
    ids: string[],
  ): ReconciliationWorkspace {
    return { ...next, auditEvents: [...next.auditEvents, auditEvent(trip, action, summary, ids)] };
  }

  function toggleSelection(
    side: "left" | "right",
    id: string,
    event?: MouseEvent,
    visible: ReconciliationTransaction[] = [],
  ) {
    const selected = side === "left" ? selectedLeft : selectedRight;
    const setSelected = side === "left" ? setSelectedLeft : setSelectedRight;
    const lastIndex = side === "left" ? lastLeftIndex : lastRightIndex;
    const currentIndex = visible.findIndex((item) => item.id === id);
    if (event?.shiftKey && lastIndex.current !== null && currentIndex >= 0) {
      const start = Math.min(lastIndex.current, currentIndex);
      const end = Math.max(lastIndex.current, currentIndex);
      setSelected([...new Set([...selected, ...visible.slice(start, end + 1).map((item) => item.id)])]);
    } else {
      setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
    }
    lastIndex.current = currentIndex;
  }

  function selectVisible(side: "left" | "right", visible: ReconciliationTransaction[]) {
    const ids = visible.map((item) => item.id);
    if (side === "left") {
      const allSelected = ids.length > 0 && ids.every((id) => selectedLeft.includes(id));
      setSelectedLeft(allSelected ? selectedLeft.filter((id) => !ids.includes(id)) : [...new Set([...selectedLeft, ...ids])]);
    } else {
      const allSelected = ids.length > 0 && ids.every((id) => selectedRight.includes(id));
      setSelectedRight(allSelected ? selectedRight.filter((id) => !ids.includes(id)) : [...new Set([...selectedRight, ...ids])]);
    }
  }

  function confirmGroup(group?: ReconciliationMatchGroup) {
    if (isLocked) return;
    const leftIds = group?.leftIds ?? selectedLeft;
    const rightIds = group?.rightIds ?? selectedRight;
    const leftTotalCents = leftIds.reduce((sum, id) => sum + (byId.get(id)?.postedCadCents ?? 0), 0);
    const rightTotalCents = rightIds.reduce((sum, id) => sum + (byId.get(id)?.postedCadCents ?? 0), 0);
    const usedIds = new Set(workspace.matchGroups.filter((item) => item.status === "confirmed").flatMap((item) => [...item.leftIds, ...item.rightIds]));
    if ([...leftIds, ...rightIds].some((id) => usedIds.has(id))) {
      setNotice("One of these transactions already belongs to a confirmed group.");
      return;
    }
    const suggestedDifference = leftTotalCents - rightTotalCents;
    const groupAdjustment = group
      ? suggestedDifference === 0
        ? undefined
        : {
            amountCents: suggestedDifference,
            reason: "fx" as const,
            note: `Accepted suggested match with ${money(Math.abs(suggestedDifference))} difference.`,
          }
      : adjustmentCents
        ? { amountCents: adjustmentCents, reason: adjustmentReason, note: adjustmentNote.trim() }
        : undefined;
    const differenceCents = leftTotalCents - rightTotalCents - (groupAdjustment?.amountCents ?? 0);
    if (differenceCents !== 0) {
      setNotice(`This group still has ${money(Math.abs(differenceCents))} to explain.`);
      return;
    }
    const ids = [...leftIds, ...rightIds];
    const confirmed: ReconciliationMatchGroup = {
      id: uid("match"),
      tripId: trip,
      leftIds,
      rightIds,
      matchType: groupType(leftIds.length, rightIds.length),
      status: "confirmed",
      leftTotalCents,
      rightTotalCents,
      differenceCents,
      confidence: group?.confidence,
      explanation: group?.explanation ?? ["Manually selected and confirmed"],
      adjustment: groupAdjustment,
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
    };
    const next = {
      ...workspace,
      transactions: workspace.transactions.map((item) => ids.includes(item.id) ? { ...item, status: "reconciled" as const } : item),
      matchGroups: [...workspace.matchGroups.filter((item) => item.id !== group?.id), confirmed],
    };
    updateWorkspace(withAudit(next, "match", `Confirmed ${confirmed.matchType} match`, ids));
    setSelectedLeft([]);
    setSelectedRight([]);
    setAdjustment("");
    setAdjustmentNote("");
    setNotice("Match confirmed and moved to Reconciled.");
  }

  function reviewSuggestion(group: ReconciliationMatchGroup) {
    if (isLocked) return;
    setSelectedLeft(group.leftIds);
    setSelectedRight(group.rightIds);
    setAdjustment("");
    setAdjustmentNote("");
    setNotice("Suggestion loaded into the manual match controls for review.");
  }

  function reopenGroup(group: ReconciliationMatchGroup) {
    if (isLocked) return;
    const ids = [...group.leftIds, ...group.rightIds];
    const next = {
      ...workspace,
      transactions: workspace.transactions.map((item) => ids.includes(item.id) ? { ...item, status: "unmatched" as const } : item),
      matchGroups: workspace.matchGroups.filter((item) => item.id !== group.id),
    };
    updateWorkspace(withAudit(next, "unmatch", `Reopened ${group.matchType} match`, ids));
    setQueue("unmatched");
  }

  function setTransactionStatus(ids: string[], status: ReconciliationQueue) {
    if (isLocked || ids.length === 0) return;
    const next = {
      ...workspace,
      transactions: workspace.transactions.map((item) => ids.includes(item.id) ? { ...item, status } : item),
    };
    updateWorkspace(withAudit(next, status === "excluded" ? "exclude" : "edit", `${status === "excluded" ? "Excluded" : "Updated"} ${ids.length} transaction${ids.length === 1 ? "" : "s"}`, ids));
    setSelectedLeft([]);
    setSelectedRight([]);
  }

  function supportSelected() {
    const ids = [...selectedLeft, ...selectedRight];
    if (isLocked || ids.length === 0 || !supportNote.trim()) return;
    const amountCents = ids.reduce((sum, id) => sum + (byId.get(id)?.postedCadCents ?? 0), 0);
    const exception = {
      id: uid("exception"),
      tripId: trip,
      transactionIds: ids,
      reason: supportReason,
      note: supportNote.trim(),
      amountCents,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    const next = {
      ...workspace,
      transactions: workspace.transactions.map((item) => ids.includes(item.id) ? { ...item, status: "exception" as const, supportNote: supportNote.trim() } : item),
      exceptions: [...workspace.exceptions, exception],
    };
    updateWorkspace(withAudit(next, "support", `Supported exception: ${exceptionReasons.find((item) => item.value === supportReason)?.label}`, ids));
    setSelectedLeft([]);
    setSelectedRight([]);
    setSupportNote("");
    setQueue("exception");
  }

  function resolveException(id: string) {
    if (isLocked) return;
    const exception = workspace.exceptions.find((item) => item.id === id);
    if (!exception) return;
    const next = {
      ...workspace,
      transactions: workspace.transactions.map((item) => exception.transactionIds.includes(item.id) ? { ...item, status: "unmatched" as const } : item),
      exceptions: workspace.exceptions.map((item) => item.id === id ? { ...item, resolved: true } : item),
    };
    updateWorkspace(withAudit(next, "edit", "Resolved supported exception", exception.transactionIds));
  }

  function editTransaction(id: string, patch: Partial<ReconciliationTransaction>) {
    if (isLocked) return;
    const next = updateReconciliationTransaction(workspace, id, patch);
    const audited = withAudit(next, "edit", "Edited normalized transaction fields", [id]);
    const updated = audited.transactions.find((item) => item.id === id);
    const expenseId = updated ? linkedExpenseId(updated) : null;
    const expense = expenseId ? state.expenses.find((item) => item.id === expenseId) : null;
    if (updated && expense) {
      dispatch({
        type: "updateLinkedExpense",
        expense: expenseFromReconciliationTransaction(expense, updated),
        reconciliation: { ...state.reconciliation, workspace: audited },
      });
      setNotice("Updated the Wanderlog transaction and linked group expense.");
      return;
    }
    updateWorkspace(audited);
  }

  function addStatementToTrip(transaction: ReconciliationTransaction) {
    if (isLocked || transaction.side !== "right") return;
    const group = state.groups.find((item) => item.id === tripGroupIds[transaction.tripId]);
    if (!group) {
      setNotice("This reconciliation is not connected to a trip group.");
      return;
    }
    const expenseId = statementExpenseId(transaction);
    if (state.expenses.some((item) => item.id === expenseId)) {
      setNotice("This statement transaction is already in the trip expenses.");
      return;
    }
    const expense = createExpenseFromStatementTransaction(transaction, group, Date.now());
    dispatch({ type: "addExpense", expense });
    setSelectedLeft([`wl:${transaction.tripId}:${expense.id}`]);
    setSelectedRight([transaction.id]);
    setAdjustment("");
    setAdjustmentNote("");
    setQuery("");
    setSourceFilter("all");
    setCategoryFilter("all");
    setMinAmount("");
    setMaxAmount("");
    setQueue("suggested");
    setNotice(`Added ${transaction.description} to ${group.name} and selected the match for review.`);
  }

  function buildImportPreview() {
    setImportPreview(previewDelimitedImport(importText, workspace.transactions, importSource));
    setImportReport("");
  }

  function commitImport() {
    if (isLocked) return;
    const accepted = importPreview.filter((row) => row.valid && !row.duplicate);
    const created = accepted.map((row) => importedTransaction(row, trip, importSource, uid("import")));
    const skipped = importPreview.length - created.length;
    const next = {
      ...workspace,
      transactions: [...workspace.transactions, ...created],
    };
    updateWorkspace(withAudit(next, "import", `Imported ${created.length} rows; skipped ${skipped}`, created.map((item) => item.id)));
    setImportReport(`${created.length} accepted · ${skipped} skipped or duplicate`);
    setImportText("");
    setImportPreview([]);
  }

  function saveView() {
    if (!query.trim()) return;
    const name = window.prompt("Name this saved search", query.trim());
    if (!name) return;
    updateWorkspace({
      ...workspace,
      savedViews: [...workspace.savedViews, { id: uid("view"), name, query, queue }],
    });
  }

  function closePeriod() {
    if (!canClose || isClosed) return;
    const snapshot = JSON.stringify({
      totals,
      matchGroups: confirmedGroups,
      exceptions: workspace.exceptions.filter((item) => item.tripId === trip),
    });
    const next = {
      ...workspace,
      periods: workspace.periods.map((item) => item.tripId === trip ? { ...item, status: "closed" as const, closedAt: new Date().toISOString(), closeSnapshot: snapshot } : item),
    };
    updateWorkspace(withAudit(next, "close", `Closed ${currentMeta.name} reconciliation`, []));
  }

  function reopenPeriod() {
    const reason = window.prompt("Why are you reopening this trip?");
    if (!reason) return;
    const next = {
      ...workspace,
      periods: workspace.periods.map((item) => item.tripId === trip ? { ...item, status: "open" as const, reopenedAt: new Date().toISOString(), closeSnapshot: undefined } : item),
    };
    updateWorkspace(withAudit(next, "reopen", `Reopened trip: ${reason}`, []));
  }

  function archivePeriod() {
    if (!isClosed || isArchived) return;
    const next = {
      ...workspace,
      periods: workspace.periods.map((item) => item.tripId === trip ? { ...item, archivedAt: new Date().toISOString() } : item),
    };
    updateWorkspace(withAudit(next, "archive", `Archived ${currentMeta.name} reconciliation for future reference`, []));
    setShowArchived(true);
  }

  function revisitPeriod() {
    if (!isArchived) return;
    const next = {
      ...workspace,
      periods: workspace.periods.map((item) => item.tripId === trip ? { ...item, archivedAt: undefined } : item),
    };
    updateWorkspace(withAudit(next, "reopen", `Revisited ${currentMeta.name} reconciliation`, []));
    setShowArchived(false);
  }

  function createReconciliation(name: string, dates: string) {
    const id = `recon-${Date.now().toString(36)}`;
    const sourceIds = { wanderlog: `wanderlog-${id}`, statement: `statement-${id}` };
    const next: ReconciliationWorkspace = {
      ...workspace,
      sources: [
        ...workspace.sources,
        { id: sourceIds.wanderlog, tripId: id, type: "wanderlog", institution: "Wanderlog", account: "Trip expense log", currency: "CAD", importedAt: new Date().toISOString(), fingerprint: id },
        { id: sourceIds.statement, tripId: id, type: "import", institution: "Imported statement", account: "Add a bank or card export", currency: "CAD", importedAt: new Date().toISOString(), fingerprint: `${id}-statement` },
      ],
      periods: [...workspace.periods, { tripId: id, name, dates, status: "open" }],
      auditEvents: [...workspace.auditEvents, auditEvent(id, "import", `Created ${name} reconciliation`, [])],
    };
    updateWorkspace(next);
    setTrip(id);
    setImportSource(sourceIds.statement);
    setShowNewReconciliation(false);
  }

  function exportPackage() {
    const packageData = {
      schemaVersion: workspace.schemaVersion,
      trip: currentMeta,
      exportedAt: new Date().toISOString(),
      totals,
      cashSummary: trip === "peru" ? cash : undefined,
      sources,
      transactions,
      matchGroups: workspace.matchGroups.filter((item) => item.tripId === trip),
      exceptions: workspace.exceptions.filter((item) => item.tripId === trip),
      history: workspace.auditEvents.filter((item) => item.tripId === trip),
      period,
    };
    download(`${trip}-reconciliation.json`, JSON.stringify(packageData, null, 2), "application/json");
  }

  function exportCsv() {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ["side", "date", "description", "source", "currency", "original_amount", "posted_cad", "status", "reference"],
      ...transactions.map((item) => [
        item.side,
        item.postedDate,
        item.description,
        item.sourceId,
        item.currency,
        (item.originalAmountCents / 100).toFixed(2),
        (item.postedCadCents / 100).toFixed(2),
        queueFor(item),
        item.reference,
      ]),
    ];
    download(`${trip}-transactions.csv`, rows.map((row) => row.map(escape).join(",")).join("\n"), "text/csv");
  }

  function restoreRecovery(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      const parsed = JSON.parse(text) as { schemaVersion?: number; transactions?: unknown[]; matchGroups?: unknown[] };
      if (parsed.schemaVersion !== 2 || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.matchGroups)) {
        setNotice("That recovery file is not a valid reconciliation workspace.");
        return;
      }
      const recovered = parsed as unknown as ReconciliationWorkspace;
      updateWorkspace(recovered);
      setNotice("Recovery workspace restored.");
    }).catch(() => setNotice("The recovery file could not be read."));
  }

  return (
    <main className="pane pane-wide reconciliation-page">
      <header className="recon-titlebar">
        <h1>Reconciliation</h1>
        <div className="recon-title-actions">
          <span className={`recon-period-status ${isClosed || isArchived ? "closed" : ""}`}>{isArchived ? "Archived" : isClosed ? "Closed" : "Open"}</span>
          <button type="button" className="btn btn-secondary" onClick={() => setShowNewReconciliation(true)}>New reconciliation</button>
          <button type="button" className="btn btn-secondary" onClick={exportPackage}>Export</button>
        </div>
      </header>

      <nav className="reconciliation-tabs" aria-label="Trips">
        {workspace.periods.filter((item) => showArchived ? Boolean(item.archivedAt) : !item.archivedAt).map((item) => {
          const key = item.tripId;
          const meta = tripMeta[key] ?? { name: item.name ?? key, dates: item.dates ?? "No dates set", note: "User-created reconciliation" };
          return (
          <button
            key={key}
            type="button"
            className={trip === key ? "active" : ""}
            onClick={() => {
              setTrip(key);
              setSelectedLeft([]);
              setSelectedRight([]);
              setQueue("unmatched");
            }}
          >
            <span>{meta.name}</span>
            <small>{meta.dates}</small>
          </button>
          );
        })}
        <button type="button" className="reconciliation-archive-toggle" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "Show active" : `Archived (${workspace.periods.filter((item) => item.archivedAt).length})`}
        </button>
      </nav>

      <section className="recon-overview">
        <div className="recon-trip-context">
          <span>{currentMeta.dates}</span>
          <strong>{currentMeta.note}</strong>
        </div>
        <Metric label="Wanderlog" value={money(totals.left)} detail={`${totals.leftCount} items`} />
        <Metric label="Statements" value={money(totals.right)} detail={`${money(Math.abs(totals.difference))} difference`} />
        <Metric label="Matched" value={`${Math.round(totals.matchRateValue * 100)}%`} detail={`${Math.round(totals.matchRateCount * 100)}% by count`} />
        <Metric label="Exceptions" value={String(totals.exceptions)} detail={`${suggestions.length} suggestions`} />
      </section>

      <section className="recon-commandbar">
        <label className="recon-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search merchant, date, amount, or reference"
            aria-label="Search both ledgers"
          />
          <kbd>/</kbd>
        </label>
        <button type="button" className="recon-tool-button" onClick={() => setShowImport(!showImport)}>Import</button>
        <button type="button" className="recon-tool-button" onClick={saveView} disabled={!query.trim()}>Save view</button>
        <details className="recon-more">
          <summary>More</summary>
          <div>
            <button type="button" onClick={exportCsv}>Export transactions CSV</button>
            <button type="button" onClick={() => download("splitwiser-reconciliation-recovery.json", JSON.stringify(workspace, null, 2), "application/json")}>Download recovery</button>
            <label>Restore recovery<input type="file" accept=".json,application/json" onChange={restoreRecovery} /></label>
          </div>
        </details>
      </section>

      {showImport && (
        <ImportWorkspace
          trip={trip}
          sources={sources}
          sourceId={importSource}
          setSourceId={setImportSource}
          text={importText}
          setText={setImportText}
          preview={importPreview}
          report={importReport}
          onPreview={buildImportPreview}
          onImport={commitImport}
          disabled={isLocked}
        />
      )}

      <nav className="recon-queues" aria-label="Reconciliation queues">
        {(Object.keys(queueLabels) as QueueTab[]).map((key) => {
          const count = key === "suggested"
            ? suggestions.length
            : key === "reconciled"
              ? confirmedGroups.length
              : transactions.filter((item) => queueFor(item) === key).length;
          return (
            <button type="button" className={queue === key ? "active" : ""} key={key} onClick={() => setQueue(key)}>
              {queueLabels[key]} <span>{count}</span>
            </button>
          );
        })}
      </nav>

      <section className="recon-filters">
        <label>Source
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="all">All sources</option>
            {sources.map((item) => <option key={item.id} value={item.id}>{item.institution} · {item.account}</option>)}
          </select>
        </label>
        <label>Category
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>Minimum
          <input value={minAmount} onChange={(event) => setMinAmount(event.target.value)} inputMode="decimal" placeholder="CA$0.00" />
        </label>
        <label>Maximum
          <input value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} inputMode="decimal" placeholder="Any" />
        </label>
        {(query || sourceFilter !== "all" || categoryFilter !== "all" || minAmount || maxAmount) && (
          <button type="button" onClick={() => {
            setQuery("");
            setSourceFilter("all");
            setCategoryFilter("all");
            setMinAmount("");
            setMaxAmount("");
          }}>Clear filters</button>
        )}
        <span>{visibleLeft.length} left · {visibleRight.length} right</span>
      </section>

      {notice && <button type="button" className="recon-notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}

      {queue === "suggested" && (
        <SuggestionList
          suggestions={suggestions}
          byId={byId}
          onConfirm={confirmGroup}
          onReview={reviewSuggestion}
          disabled={isLocked}
        />
      )}

      {queue === "reconciled" ? (
        <ReconciledGroups groups={confirmedGroups} byId={byId} onReopen={reopenGroup} disabled={isLocked} query={searchNeedle} />
      ) : (
        <div className="recon-ledgers">
          <Ledger
            side="left"
            title="Wanderlog"
            subtitle=""
            rows={visibleLeft}
            selected={selectedLeft}
            onToggle={(id, event) => toggleSelection("left", id, event, visibleLeft)}
            onSelectVisible={() => selectVisible("left", visibleLeft)}
            onEdit={editTransaction}
            disabled={isLocked}
            sourceById={new Map(sources.map((item) => [item.id, item.institution]))}
            existingExpenseIds={new Set(state.expenses.map((item) => item.id))}
          />
          <Ledger
            side="right"
            title="Statements"
            subtitle=""
            rows={visibleRight}
            selected={selectedRight}
            onToggle={(id, event) => toggleSelection("right", id, event, visibleRight)}
            onSelectVisible={() => selectVisible("right", visibleRight)}
            onEdit={editTransaction}
            disabled={isLocked}
            sourceById={new Map(sources.map((item) => [item.id, item.institution]))}
            existingExpenseIds={new Set(state.expenses.map((item) => item.id))}
            onAddToTrip={addStatementToTrip}
          />
        </div>
      )}

      {queue === "exception" && (
        <ExceptionRegister
          items={workspace.exceptions.filter((item) => item.tripId === trip && !item.resolved)}
          byId={byId}
          onResolve={resolveException}
          disabled={isLocked}
        />
      )}

      {selectedCount > 0 && (
        <section className="recon-matchbar" aria-label="Selected match totals">
          <div className="recon-match-summary">
            <span>{groupType(selectedLeft.length, selectedRight.length)}</span>
            <strong>{selectedCount} selected</strong>
            {hiddenSelected > 0 && <small>{hiddenSelected} selected item{hiddenSelected === 1 ? " is" : "s are"} hidden by the current view</small>}
          </div>
          <MatchMetric label="Left" count={selectedLeft.length} total={selectedLeftTotal} />
          <span className="recon-match-symbol">↔</span>
          <MatchMetric label="Right" count={selectedRight.length} total={selectedRightTotal} />
          <label className="recon-adjustment">
            <span>Adjustment</span>
            <div><span>CA$</span><input value={adjustment} onChange={(event) => setAdjustment(event.target.value)} inputMode="decimal" placeholder="0.00" /></div>
          </label>
          <div className={`recon-difference ${remainingDifference === 0 ? "balanced" : ""}`}>
            <span>Difference</span>
            <strong>{money(remainingDifference)}</strong>
          </div>
          <div className="recon-match-actions">
            <button type="button" onClick={() => { setSelectedLeft([]); setSelectedRight([]); }}>Clear</button>
            <button type="button" className="recon-confirm" disabled={!canConfirm} onClick={() => confirmGroup()}>Confirm match</button>
          </div>
          {adjustmentCents !== 0 && (
            <div className="recon-adjustment-detail">
              <select value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value as ReconciliationExceptionReason)}>
                {exceptionReasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <input value={adjustmentNote} onChange={(event) => setAdjustmentNote(event.target.value)} placeholder="Required explanation for adjustment" />
            </div>
          )}
          <details className="recon-support">
            <summary>Resolve selected as an exception</summary>
            <div>
              <select value={supportReason} onChange={(event) => setSupportReason(event.target.value as ReconciliationExceptionReason)}>
                {exceptionReasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <input value={supportNote} onChange={(event) => setSupportNote(event.target.value)} placeholder="Required supporting note" />
              <button type="button" disabled={!supportNote.trim() || isClosed} onClick={supportSelected}>Support exception</button>
              <button type="button" disabled={isLocked} onClick={() => setTransactionStatus([...selectedLeft, ...selectedRight], "excluded")}>Exclude selected</button>
            </div>
          </details>
        </section>
      )}

      {trip === "peru" && (
        <section className="cash-control cash-summary">
          <header>
            <h2>Cash</h2>
            <strong>{money(cash.total)} withdrawn</strong>
          </header>
          <div className="cash-equation">
            <Metric label="Earlier cash" value={money(cash.opening)} detail="500 PEN received before Jul 12" />
            <span>+</span>
            <Metric label="Trip withdrawals + fee" value={money(cash.withdrawals)} detail="Tangerine account activity" />
            <span>−</span>
            <label><span>Cash left over (optional)</span><div>CA$ <input value={endingCash} onChange={(event) => {
              setEndingCash(event.target.value);
              dispatch({ type: "updateReconciliation", reconciliation: { ...state.reconciliation, cashRemaining: event.target.value } });
            }} inputMode="decimal" placeholder="0.00" disabled={isLocked} /></div></label>
            <span>=</span>
            <Metric label="Cash used" value={money(cash.used)} detail="Match this spending to Wanderlog activities" />
          </div>
        </section>
      )}

      <section className="recon-close">
        <div>
          <h2>{isArchived ? `${currentMeta.name} is archived` : isClosed ? `${currentMeta.name} is closed` : `Close ${currentMeta.name}`}</h2>
          <ul>
            <li className={tripUnmatched === 0 ? "done" : ""}>{tripUnmatched === 0 ? "✓" : "○"} Zero unexplained transactions</li>
            <li className={ambiguousCount === 0 ? "done" : ""}>{ambiguousCount === 0 ? "✓" : "○"} No ambiguous suggestions</li>
            <li className={totals.exceptions === 0 ? "done" : ""}>{totals.exceptions === 0 ? "✓" : "○"} No open exceptions</li>
          </ul>
        </div>
        <div className="recon-close-actions">
          {isArchived
            ? <button type="button" onClick={revisitPeriod}>Revisit reconciliation</button>
            : isClosed
              ? <><button type="button" onClick={reopenPeriod}>Reopen with reason</button><button type="button" onClick={archivePeriod}>Archive for reference</button></>
            : <button type="button" className="recon-confirm" disabled={!canClose} onClick={closePeriod}>Close and snapshot</button>}
          <button type="button" onClick={() => setShowActivity(!showActivity)}>{showActivity ? "Hide" : "View"} activity</button>
        </div>
      </section>

      {showActivity && (
        <section className="recon-activity">
          <h2>History</h2>
          {workspace.auditEvents.filter((item) => item.tripId === trip).slice().reverse().map((item) => (
            <div key={item.id}><span>{new Date(item.timestamp).toLocaleString()}</span><strong>{item.summary}</strong><small>{item.action}</small></div>
          ))}
        </section>
      )}
      {showNewReconciliation && <NewReconciliationDialog onClose={() => setShowNewReconciliation(false)} onCreate={createReconciliation} />}
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="recon-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function MatchMetric({ label, count, total }: { label: string; count: number; total: number }) {
  return <div className="recon-match-metric"><span>{label} · {count}</span><strong>{money(total)}</strong></div>;
}

function EditableMoneyInput({
  cents,
  disabled,
  onCommit,
}: {
  cents: number;
  disabled: boolean;
  onCommit: (cents: number) => void;
}) {
  const formatted = centsToInput(cents);
  const [draft, setDraft] = useState(formatted);
  const isFocused = useRef(false);
  const cancelOnBlur = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setDraft(formatted);
  }, [formatted]);

  function commit(value: string) {
    const nextCents = parseMoney(value);
    if (!Number.isFinite(nextCents)) {
      setDraft(formatted);
      return;
    }
    setDraft(centsToInput(nextCents));
    if (nextCents !== cents) onCommit(nextCents);
  }

  return (
    <input
      value={draft}
      onFocus={(event) => {
        isFocused.current = true;
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        isFocused.current = false;
        if (cancelOnBlur.current) {
          cancelOnBlur.current = false;
          setDraft(formatted);
          return;
        }
        commit(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelOnBlur.current = true;
          event.currentTarget.blur();
        }
      }}
      inputMode="decimal"
      disabled={disabled}
      aria-label="Posted CAD amount"
    />
  );
}

function EditableDateInput({ value, onCommit, disabled, label }: {
  value: string;
  onCommit: (value: string) => void;
  disabled: boolean;
  label: string;
}) {
  const formatted = formatReconciliationDate(value);
  const [draft, setDraft] = useState(formatted);
  const isFocused = useRef(false);
  const cancelOnBlur = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setDraft(formatted);
  }, [formatted]);

  return (
    <input
      className="recon-date-input"
      value={draft}
      onFocus={(event) => {
        isFocused.current = true;
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        isFocused.current = false;
        if (cancelOnBlur.current) {
          cancelOnBlur.current = false;
          setDraft(formatted);
          return;
        }
        const next = event.currentTarget.value.trim();
        if (next && next !== formatted) onCommit(next);
        else setDraft(formatted);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelOnBlur.current = true;
          event.currentTarget.blur();
        }
      }}
      aria-label={label}
      disabled={disabled}
    />
  );
}

function Ledger({
  side,
  title,
  subtitle,
  rows,
  selected,
  onToggle,
  onSelectVisible,
  onEdit,
  disabled,
  sourceById,
  existingExpenseIds,
  onAddToTrip,
}: {
  side: "left" | "right";
  title: string;
  subtitle: string;
  rows: ReconciliationTransaction[];
  selected: string[];
  onToggle: (id: string, event: MouseEvent) => void;
  onSelectVisible: () => void;
  onEdit: (id: string, patch: Partial<ReconciliationTransaction>) => void;
  disabled: boolean;
  sourceById: Map<string, string>;
  existingExpenseIds: Set<string>;
  onAddToTrip?: (transaction: ReconciliationTransaction) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((item) => selected.includes(item.id));
  return (
    <section className="recon-ledger">
      <header>
        <label>
          <input type="checkbox" checked={allSelected} onChange={onSelectVisible} disabled={rows.length === 0 || disabled} />
          <span><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
        </label>
        <strong>{money(rows.reduce((sum, item) => sum + item.postedCadCents, 0))}</strong>
      </header>
      <div className="recon-ledger-labels"><span>Date</span><span>Transaction</span><span>Source</span><span>Amount</span></div>
      <div className="recon-lines">
        {rows.map((item) => {
          const isAddedToTrip = existingExpenseIds.has(statementExpenseId(item));
          return (
          <article
            key={item.id}
            className={`recon-line ${item.accountType === "cash" ? "cash-line" : ""} ${selected.includes(item.id) ? "selected" : ""}`}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("input, select, button")) return;
              onToggle(item.id, event);
            }}
          >
            <input
              type="checkbox"
              aria-label={`Select ${item.description}`}
              checked={selected.includes(item.id)}
              onChange={() => undefined}
              onClick={(event) => onToggle(item.id, event)}
              disabled={disabled}
            />
            <EditableDateInput
              value={item.date}
              onCommit={(date) => onEdit(item.id, { date, postedDate: date })}
              label={`Date for ${item.description}`}
              disabled={disabled}
            />
            <div className="recon-description">
              <input value={item.description} onChange={(event) => onEdit(item.id, { description: event.target.value })} disabled={disabled} aria-label="Description" />
              <small>{item.reference || item.notes || "No reference"}</small>
              {item.accountType === "cash" && <em className="cash-control-note">Cash source · match to cash-paid activities</em>}
              {item.currency !== "CAD" && <em>{item.currency} {(item.originalAmountCents / 100).toFixed(2)} original</em>}
              {side === "right" && onAddToTrip && item.accountType === "card" && item.status === "unmatched" && (
                <button
                  type="button"
                  className="recon-add-expense"
                  disabled={disabled || isAddedToTrip}
                  onClick={() => onAddToTrip(item)}
                  aria-label={isAddedToTrip ? `${item.description} added to trip expenses` : `Add ${item.description} to trip expenses`}
                  title={isAddedToTrip ? "Already added to trip expenses" : "Add to trip expenses"}
                >
                  {isAddedToTrip ? "Added" : "+ Add"}
                </button>
              )}
            </div>
            <span className="recon-source">{sourceById.get(item.sourceId) ?? item.sourceId}</span>
            <label className="recon-amount-input">
              <span>CA$</span>
              <EditableMoneyInput
                cents={item.postedCadCents}
                disabled={disabled}
                onCommit={(postedCadCents) => onEdit(item.id, { postedCadCents })}
              />
            </label>
          </article>
          );
        })}
        {rows.length === 0 && <p className="recon-empty">No {side === "left" ? "Wanderlog" : "statement"} transactions in this view.</p>}
      </div>
    </section>
  );
}

function SuggestionList({
  suggestions,
  byId,
  onConfirm,
  onReview,
  disabled,
}: {
  suggestions: ReconciliationMatchGroup[];
  byId: Map<string, ReconciliationTransaction>;
  onConfirm: (group: ReconciliationMatchGroup) => void;
  onReview: (group: ReconciliationMatchGroup) => void;
  disabled: boolean;
}) {
  return (
    <section className="recon-suggestions">
      <header><h2>Suggestions ({suggestions.length})</h2><span>Exact CAD any date · rounded Wanderlog entries ±7 days · exact groups up to 3</span></header>
      {suggestions.map((group) => {
        const left = group.leftIds.map((id) => byId.get(id)).filter((item): item is ReconciliationTransaction => Boolean(item)).sort(compareReconciliationTransactions);
        const right = group.rightIds.map((id) => byId.get(id)).filter((item): item is ReconciliationTransaction => Boolean(item)).sort(compareReconciliationTransactions);
        if (left.length !== group.leftIds.length || right.length !== group.rightIds.length) return null;
        return (
          <article key={group.id}>
            <span className={`suggestion-confidence ${group.status === "ambiguous" ? "ambiguous" : group.confidence}`}>{group.status === "ambiguous" ? "Ambiguous" : `${group.confidence} confidence`}</span>
            <div className="suggestion-side">
              <small>Wanderlog · {group.leftIds.length}</small>
              {left.map((item) => <div className="suggestion-transaction" key={item.id}><strong>{item.description}</strong><span>{formatReconciliationDate(item.date)} · {money(item.postedCadCents)}</span></div>)}
              <em>Total {money(group.leftTotalCents)}</em>
            </div>
            <b>↔</b>
            <div className="suggestion-side">
              <small>Statement · {group.rightIds.length}</small>
              {right.map((item) => <div className="suggestion-transaction" key={item.id}><strong>{item.description}</strong><span>{formatReconciliationDate(item.date)} · {money(item.postedCadCents)}</span></div>)}
              <em>Total {money(group.rightTotalCents)}</em>
            </div>
            <ul>{group.explanation.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <button
              type="button"
              onClick={() => group.status === "ambiguous" ? onReview(group) : onConfirm(group)}
              disabled={disabled}
            >
              {group.status === "ambiguous" ? "Review manually" : "Confirm suggestion"}
            </button>
          </article>
        );
      })}
      {suggestions.length === 0 && <p className="recon-empty">No deterministic suggestions are available in this trip.</p>}
    </section>
  );
}

function ReconciledGroups({
  groups,
  byId,
  onReopen,
  disabled,
  query,
}: {
  groups: ReconciliationMatchGroup[];
  byId: Map<string, ReconciliationTransaction>;
  onReopen: (group: ReconciliationMatchGroup) => void;
  disabled: boolean;
  query: string;
}) {
  const visible = groups.filter((group) => {
    if (!query) return true;
    return [...group.leftIds, ...group.rightIds].some((id) => byId.get(id)?.normalizedText.includes(query));
  });
  return (
    <section className="recon-groups">
      {visible.map((group) => (
        <details key={group.id} open>
          <summary>
            <span className="recon-group-check">✓</span>
            <div><strong>{group.matchType}</strong><small>{group.leftIds.length + group.rightIds.length} transactions · {group.explanation.join(" · ")}</small></div>
            <span>{money(group.leftTotalCents)} = {money(group.rightTotalCents + (group.adjustment?.amountCents ?? 0))}</span>
          </summary>
          <div className="recon-group-body">
            <GroupColumn label="Wanderlog" ids={group.leftIds} byId={byId} />
            <GroupColumn label="Statement" ids={group.rightIds} byId={byId} />
            {group.adjustment && <p className="recon-group-adjustment">Adjustment {money(group.adjustment.amountCents)} · {group.adjustment.note}</p>}
            <button type="button" onClick={() => onReopen(group)} disabled={disabled}>Reopen group</button>
          </div>
        </details>
      ))}
      {visible.length === 0 && <p className="recon-empty">Confirmed matches will collect here as complete groups.</p>}
    </section>
  );
}

function GroupColumn({ label, ids, byId }: { label: string; ids: string[]; byId: Map<string, ReconciliationTransaction> }) {
  const transactions = ids
    .map((id) => byId.get(id))
    .filter((item): item is ReconciliationTransaction => Boolean(item))
    .sort(compareReconciliationTransactions);
  return (
    <div className="recon-group-column"><strong>{label}</strong>{transactions.map((item) => (
      <div key={item.id}><span>{formatReconciliationDate(item.date)}</span><b>{item.description}</b><strong>{money(item.postedCadCents)}</strong></div>
    ))}</div>
  );
}

function ExceptionRegister({
  items,
  byId,
  onResolve,
  disabled,
}: {
  items: ReconciliationWorkspace["exceptions"];
  byId: Map<string, ReconciliationTransaction>;
  onResolve: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="exception-register">
      <header><h2>Exceptions</h2></header>
      {items.map((item) => (
        <article key={item.id}>
          <span>{exceptionReasons.find((reason) => reason.value === item.reason)?.label}</span>
          <div><strong>{item.transactionIds.map((id) => byId.get(id)?.description).filter(Boolean).join(" + ")}</strong><small>{item.note}</small></div>
          <b>{money(item.amountCents)}</b>
          <button type="button" onClick={() => onResolve(item.id)} disabled={disabled}>Resolve / return</button>
        </article>
      ))}
      {items.length === 0 && <p className="recon-empty">No open exceptions.</p>}
    </section>
  );
}

function ImportWorkspace({
  trip,
  sources,
  sourceId,
  setSourceId,
  text,
  setText,
  preview,
  report,
  onPreview,
  onImport,
  disabled,
}: {
  trip: ReconciliationTripId;
  sources: ReconciliationWorkspace["sources"];
  sourceId: string;
  setSourceId: (value: string) => void;
  text: string;
  setText: (value: string) => void;
  preview: ImportPreviewRow[];
  report: string;
  onPreview: () => void;
  onImport: () => void;
  disabled: boolean;
}) {
  const accepted = preview.filter((item) => item.valid && !item.duplicate);
  return (
    <section className="recon-import">
      <header><h2>Import transactions</h2><span>Raw files stay private</span></header>
      <div className="recon-import-controls">
        <label>Trip<input value={tripMeta[trip]?.name ?? trip} disabled /></label>
        <label>Mapping
          <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
            {sources.map((item) => <option value={item.id} key={item.id}>{item.institution} · {item.account}</option>)}
          </select>
        </label>
        <label className="recon-import-paste">Paste rows
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={"Date,Description,Amount,Reference\n2026-07-14,Example merchant,22.15,ABC123"} />
        </label>
        <button type="button" onClick={onPreview} disabled={!text.trim()}>Preview import</button>
      </div>
      {preview.length > 0 && (
        <>
          <div className="recon-import-summary">
            <span>{preview.length} parsed</span><span>{accepted.length} ready</span><span>{preview.filter((item) => item.duplicate).length} duplicates</span><span>{preview.filter((item) => !item.valid).length} invalid</span>
            <strong>{money(accepted.reduce((sum, item) => sum + item.amountCents, 0))}</strong>
          </div>
          <div className="recon-import-preview">
            {preview.slice(0, 12).map((item) => <div key={item.row} className={!item.valid || item.duplicate ? "flagged" : ""}><span>Row {item.row}</span><span>{item.date || "Invalid date"}</span><strong>{item.description || item.error}</strong><b>{money(item.amountCents)}</b><em>{item.duplicate ? "Duplicate" : item.valid ? "Ready" : "Invalid"}</em></div>)}
          </div>
          <button type="button" className="recon-confirm" onClick={onImport} disabled={accepted.length === 0 || disabled}>Import {accepted.length} valid rows</button>
        </>
      )}
      {report && <p className="recon-import-report">{report}</p>}
    </section>
  );
}

function NewReconciliationDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, dates: string) => void;
}) {
  const [name, setName] = useState("");
  const [dates, setDates] = useState("");
  const [error, setError] = useState("");

  function create() {
    if (!name.trim()) {
      setError("Add a name so this workspace is easy to find later.");
      return;
    }
    onCreate(name.trim(), dates.trim() || "Dates to be confirmed");
  }

  return (
    <div className="recon-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="recon-dialog" role="dialog" aria-modal="true" aria-labelledby="new-reconciliation-title">
        <header><div><span className="eyebrow">New workspace</span><h2 id="new-reconciliation-title">Create a reconciliation</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <p>Start a private workspace for a new trip or statement period. Import the Wanderlog and bank files when you are ready.</p>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mexico 2027" autoFocus /></label>
        <label>Dates<input value={dates} onChange={(event) => setDates(event.target.value)} placeholder="e.g. Feb 3 – Feb 18, 2027" /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="recon-confirm" onClick={create}>Create reconciliation</button></footer>
      </section>
    </div>
  );
}
