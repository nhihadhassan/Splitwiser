import { useMemo, useState } from "react";
import { uid, useStore } from "../store";
import type { ReconciliationDecision, StatementTransaction } from "../types";
import { formatMoney } from "../utils/money";
import { seedState } from "../seed";
import "./ReconciliationPage.css";

type TripKey = "peru" | "new-york";
type ChargeDecision = ReconciliationDecision;
type RightSource = "Scotiabank" | "Expense export" | "Tangerine cash";
type RightLine = StatementTransaction & { key: string; source: RightSource };

const tripMeta: Record<TripKey, { name: string; dates: string; note: string; wanderlogTotal: number }> = {
  peru: {
    name: "Peru",
    dates: "Jul 11 - Jul 26, 2026",
    wanderlogTotal: 5539.30,
    note: "The right side includes Scotiabank, earlier Tangerine Mastercard charges from the expense export, and Tangerine cash. Older bookings can be added as you find them.",
  },
  "new-york": {
    name: "New York",
    dates: "Jun 25 - Jun 28, 2026",
    wanderlogTotal: 855.15,
    note: "The Porter flight and USD cash purchases are in Wanderlog but are not present in the supplied Scotiabank statement.",
  },
};

const importedWanderlogExpenses = seedState().expenses.filter((expense) => (
  expense.groupId === "g-peru" || expense.groupId === "g-new-york"
));

function money(amount: number) {
  return formatMoney(Math.round(amount * 100));
}

export function ReconciliationPage() {
  const { state, dispatch } = useStore();
  const [trip, setTrip] = useState<TripKey>("peru");
  const [query, setQuery] = useState("");
  const [selectedWanderlogId, setSelectedWanderlogId] = useState<string | null>(null);
  const meta = tripMeta[trip];
  const { decisions, matches, cashRemaining, cashTransactions, cardTransactions, exportTransactions } = state.reconciliation;
  const groupId = trip === "peru" ? "g-peru" : "g-new-york";
  const cardKey = trip === "peru" ? "peru" : "newYork";
  const currentCardTransactions = cardTransactions[cardKey];
  const currentExportTransactions = exportTransactions[cardKey];

  const wanderlogCharges = useMemo(() => {
    const savedTripExpenses = state.expenses.filter((expense) => expense.groupId === groupId);
    const sourceExpenses = savedTripExpenses.length > 0
      ? savedTripExpenses
      : importedWanderlogExpenses.filter((expense) => expense.groupId === groupId);
    return [...sourceExpenses].sort((a, b) => b.date.localeCompare(a.date));
  }, [groupId, state.expenses]);

  const decisionFor = (id: string): ChargeDecision => decisions[`${trip}-${id}`] ?? "include";
  const excludedWanderlogCharges = wanderlogCharges.filter((charge) => {
    const decision = decisionFor(charge.id);
    return decision === "exclude" || decision === "personal";
  });
  const includedWanderlogCharges = wanderlogCharges.filter((charge) => !excludedWanderlogCharges.includes(charge));
  const importedEstimateTotal = wanderlogCharges.reduce((sum, charge) => sum + charge.amount / 100, 0);
  const wanderlogConversionAdjustment = meta.wanderlogTotal - importedEstimateTotal;
  const excludedWanderlogTotal = excludedWanderlogCharges.reduce((sum, charge) => sum + charge.amount / 100, 0);
  const wanderlogTotal = Math.max(0, meta.wanderlogTotal - excludedWanderlogTotal);
  const statementDecisionFor = (id: string): "include" | "exclude" => (
    decisions[`statement-${trip}-${id}`] === "exclude" ? "exclude" : "include"
  );
  const includedCardTransactions = currentCardTransactions.filter((transaction) => statementDecisionFor(transaction.id) === "include");
  const includedExportTransactions = currentExportTransactions.filter((transaction) => statementDecisionFor(transaction.id) === "include");
  const includedCashTransactions = cashTransactions.filter((transaction) => statementDecisionFor(transaction.id) === "include");
  const cardTotal = includedCardTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const exportTotal = includedExportTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const cashRecorded = includedCashTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const parsedCashRemaining = Math.max(0, Number(cashRemaining) || 0);
  const cashSpent = trip === "peru" ? Math.max(0, cashRecorded - parsedCashRemaining) : 0;
  const statementTotal = cardTotal + exportTotal + cashSpent;
  const variance = wanderlogTotal - statementTotal;
  const isBalanced = Math.abs(variance) < 0.01;
  const searchNeedle = query.trim().toLowerCase();

  const visibleWanderlogCharges = wanderlogCharges.filter((charge) => (
    searchNeedle === ""
    || `${charge.date} ${charge.description} ${charge.notes ?? ""}`.toLowerCase().includes(searchNeedle)
  ));
  const visibleCardTransactions = currentCardTransactions.filter((transaction) => (
    searchNeedle === ""
    || `${transaction.date} ${transaction.description} ${transaction.detail}`.toLowerCase().includes(searchNeedle)
  ));
  const visibleExportTransactions = currentExportTransactions.filter((transaction) => (
    searchNeedle === ""
    || `${transaction.date} ${transaction.description} ${transaction.detail}`.toLowerCase().includes(searchNeedle)
  ));
  const visibleCashTransactions = cashTransactions.filter((transaction) => (
    searchNeedle === ""
    || `${transaction.date} ${transaction.description} ${transaction.detail}`.toLowerCase().includes(searchNeedle)
  ));

  const rightLines = useMemo<RightLine[]>(() => [
    ...currentCardTransactions.map((transaction) => ({ ...transaction, key: `scotia:${transaction.id}`, source: "Scotiabank" as const })),
    ...currentExportTransactions.map((transaction) => ({ ...transaction, key: `export:${transaction.id}`, source: "Expense export" as const })),
    ...(trip === "peru" ? cashTransactions.map((transaction) => ({ ...transaction, key: `cash:${transaction.id}`, source: "Tangerine cash" as const })) : []),
  ], [cashTransactions, currentCardTransactions, currentExportTransactions, trip]);

  const rightLineByKey = useMemo(() => new Map(rightLines.map((line) => [line.key, line])), [rightLines]);
  const matchedLeftKeyByRightKey = useMemo(() => {
    const result = new Map<string, string>();
    Object.entries(matches).forEach(([leftKey, rightKeys]) => {
      rightKeys.forEach((rightKey) => result.set(rightKey, leftKey));
    });
    return result;
  }, [matches]);
  const selectedLeftKey = selectedWanderlogId ? `${trip}-${selectedWanderlogId}` : null;
  const selectedLeft = selectedWanderlogId
    ? wanderlogCharges.find((charge) => charge.id === selectedWanderlogId)
    : undefined;
  const selectedMatchKeys = selectedLeftKey ? matches[selectedLeftKey] ?? [] : [];
  const selectedMatchTotal = selectedMatchKeys.reduce((sum, key) => sum + (rightLineByKey.get(key)?.amount ?? 0), 0);
  const matchedWanderlogCount = includedWanderlogCharges.filter((charge) => (matches[`${trip}-${charge.id}`] ?? []).length > 0).length;
  const unmatchedIncludedCount = includedWanderlogCharges.length - matchedWanderlogCount;

  function updateReconciliation(patch: Partial<typeof state.reconciliation>) {
    dispatch({
      type: "updateReconciliation",
      reconciliation: { ...state.reconciliation, ...patch },
    });
  }

  function setDecision(chargeId: string, decision: ChargeDecision) {
    updateReconciliation({
      decisions: { ...decisions, [`${trip}-${chargeId}`]: decision },
    });
  }

  function setStatementDecision(transactionId: string, decision: "include" | "exclude") {
    updateReconciliation({
      decisions: { ...decisions, [`statement-${trip}-${transactionId}`]: decision },
    });
  }

  function toggleMatch(rightKey: string) {
    if (!selectedLeftKey) return;
    const current = matches[selectedLeftKey] ?? [];
    const isAlreadyMatched = current.includes(rightKey);
    const nextMatches = Object.fromEntries(Object.entries(matches).map(([leftKey, rightKeys]) => [
      leftKey,
      rightKeys.filter((key) => key !== rightKey),
    ]));
    nextMatches[selectedLeftKey] = isAlreadyMatched ? current.filter((key) => key !== rightKey) : [...current, rightKey];
    updateReconciliation({ matches: nextMatches });
  }

  function updateCardTransaction(id: string, patch: Partial<StatementTransaction>) {
    updateReconciliation({
      cardTransactions: {
        ...cardTransactions,
        [cardKey]: currentCardTransactions.map((transaction) => (
          transaction.id === id ? { ...transaction, ...patch } : transaction
        )),
      },
    });
  }

  function addCardTransaction() {
    updateReconciliation({
      cardTransactions: {
        ...cardTransactions,
        [cardKey]: [
          ...currentCardTransactions,
          { id: uid(), date: "", description: "New card charge", detail: "", amount: 0 },
        ],
      },
    });
  }

  function updateCashTransaction(id: string, patch: Partial<StatementTransaction>) {
    updateReconciliation({
      cashTransactions: cashTransactions.map((transaction) => (
        transaction.id === id ? { ...transaction, ...patch } : transaction
      )),
    });
  }

  function updateExportTransaction(id: string, patch: Partial<StatementTransaction>) {
    updateReconciliation({
      exportTransactions: {
        ...exportTransactions,
        [cardKey]: currentExportTransactions.map((transaction) => (
          transaction.id === id ? { ...transaction, ...patch } : transaction
        )),
      },
    });
  }

  function addCashTransaction() {
    updateReconciliation({
      cashTransactions: [
        ...cashTransactions,
        { id: uid(), date: "", description: "New cash withdrawal", detail: "", amount: 0 },
      ],
    });
  }

  return (
    <main className="pane pane-wide reconciliation-page">
      <div className="pane-header hero-header">
        <div>
          <p className="eyebrow">Trip reconciliation</p>
          <h1>Wanderlog vs. statements</h1>
        </div>
        <span className={`status-chip ${isBalanced ? "settled" : "owed"}`}>
          {isBalanced ? "Balanced" : `${money(Math.abs(variance))} to explain`}
        </span>
      </div>

      <div className="reconciliation-tabs" role="tablist" aria-label="Trips">
        {(Object.keys(tripMeta) as TripKey[]).map((key) => (
          <button
            key={key}
            className={trip === key ? "active" : ""}
            onClick={() => {
              setTrip(key);
              setSelectedWanderlogId(null);
            }}
            role="tab"
            aria-selected={trip === key}
          >
            <span>{tripMeta[key].name}</span>
            <small>{tripMeta[key].dates}</small>
          </button>
        ))}
      </div>

      <section className="reconciliation-intro">
        <div>
          <p className="eyebrow">{meta.dates}</p>
          <h2>{meta.name} expense review</h2>
          <p>{meta.note}</p>
        </div>
        <label className="ledger-search">
          <span>Search both sides</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Date, merchant, or note"
          />
        </label>
      </section>

      <section className={`reconciliation-equation ${isBalanced ? "balanced" : ""}`} aria-label="Reconciliation equation">
        <div>
          <span>Wanderlog total</span>
          <strong>{money(wanderlogTotal)}</strong>
          <small>{includedWanderlogCharges.length} included line items</small>
        </div>
        <div className="equation-result" aria-label={isBalanced ? "Totals match" : "Totals do not match"}>
          <span>{isBalanced ? "=" : "≠"}</span>
          <strong>{isBalanced ? "Balanced" : `${variance > 0 ? "Left is higher" : "Right is higher"} by ${money(Math.abs(variance))}`}</strong>
        </div>
        <div>
          <span>Scotiabank + cash spent</span>
          <strong>{money(statementTotal)}</strong>
          <small>{includedCardTransactions.length} of {currentCardTransactions.length} Scotia + {includedExportTransactions.length} export charges included{trip === "peru" ? " + Tangerine cash" : ""}</small>
        </div>
      </section>

      <section className="matching-toolbar" aria-label="Transaction matching workspace">
        <div>
          <p className="eyebrow">Matching workspace</p>
          {selectedLeft ? (
            <strong>Matching “{selectedLeft.description}” · {money(selectedLeft.amount / 100)}</strong>
          ) : (
            <strong>Select a Wanderlog line to match it to the right</strong>
          )}
          <span>{unmatchedIncludedCount} included Wanderlog line{unmatchedIncludedCount === 1 ? "" : "s"} still unmatched · {matchedWanderlogCount} linked</span>
        </div>
        {selectedLeft && (
          <div className="matching-toolbar-summary">
            <span>{selectedMatchKeys.length} linked</span>
            <strong>{money(selectedMatchTotal)}</strong>
            <button type="button" onClick={() => setSelectedWanderlogId(null)}>Clear selection</button>
          </div>
        )}
      </section>

      <div className="reconciliation-compare-grid">
        <section className="comparison-ledger" aria-labelledby="wanderlog-ledger-title">
          <header className="comparison-ledger-header">
            <div>
              <p className="eyebrow">Left side</p>
              <h2 id="wanderlog-ledger-title">Wanderlog items</h2>
              <span>What you recorded as trip spending</span>
            </div>
            <strong>{money(wanderlogTotal)}</strong>
          </header>

          <div className="ledger-column-labels wanderlog-labels" aria-hidden="true">
            <span>Date</span><span>Line item</span><span>Amount</span><span>Status</span>
          </div>
          <div className="statement-lines">
            {visibleWanderlogCharges.map((charge) => {
              const decision = decisionFor(charge.id);
              const matchCount = (matches[`${trip}-${charge.id}`] ?? []).length;
              return (
                <div
                  className={`statement-line wanderlog-line decision-${decision} ${selectedWanderlogId === charge.id ? "match-selected" : ""}`}
                  key={charge.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedWanderlogId(charge.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedWanderlogId(charge.id);
                  }}
                >
                  <span className="statement-date">{charge.date}</span>
                  <div className="statement-description">
                    <strong>{charge.description}</strong>
                    <small>{charge.notes?.replace("Imported from Wanderlog: ", "") ?? "Imported from Wanderlog"}</small>
                  </div>
                  <strong className="statement-amount">{money(charge.amount / 100)}</strong>
                  <div className="wanderlog-status" onClick={(event) => event.stopPropagation()}>
                    <select
                      className="statement-decision"
                      aria-label={`Status for ${charge.description}`}
                      value={decision}
                      onChange={(event) => setDecision(charge.id, event.target.value as ChargeDecision)}
                    >
                      <option value="include">Include</option>
                      <option value="review">Review</option>
                      <option value="personal">Personal</option>
                      <option value="exclude">Exclude</option>
                    </select>
                    {matchCount > 0 && <span className="match-badge">{matchCount} linked</span>}
                  </div>
                </div>
              );
            })}
            {searchNeedle === "" && Math.abs(wanderlogConversionAdjustment) >= 0.01 && (
              <div className="statement-line wanderlog-line conversion-adjustment-line">
                <span className="statement-date">Summary</span>
                <div className="statement-description">
                  <strong>Wanderlog conversion adjustment</strong>
                  <small>Aligns the imported CAD estimates with Wanderlog's published trip total</small>
                </div>
                <strong className="statement-amount">{money(wanderlogConversionAdjustment)}</strong>
                <span className="adjustment-status">Automatic</span>
              </div>
            )}
            {visibleWanderlogCharges.length === 0 && <p className="reconciliation-empty">No Wanderlog items match this search.</p>}
          </div>
        </section>

        <section className="comparison-ledger" aria-labelledby="statement-ledger-title">
          <header className="comparison-ledger-header">
            <div>
              <p className="eyebrow">Right side</p>
              <h2 id="statement-ledger-title">Bank and cash</h2>
              <span>What actually left your accounts</span>
            </div>
            <strong>{money(statementTotal)}</strong>
          </header>

          <div className="statement-source-heading">
            <div>
              <span className="source-mark scotia" aria-hidden="true">S</span>
              <div><strong>Scotiabank credit card</strong><small>Passport Visa Infinite •••• 7283</small></div>
            </div>
            <strong>{money(cardTotal)}</strong>
          </div>
          <div className="ledger-column-labels" aria-hidden="true">
            <span>Date</span><span>Transaction</span><span>Amount</span><span>Status</span>
          </div>
          <div className="statement-lines">
            {visibleCardTransactions.map((transaction) => (
              <EditableStatementLine
                key={transaction.id}
                transaction={transaction}
                onChange={(patch) => updateCardTransaction(transaction.id, patch)}
                decision={statementDecisionFor(transaction.id)}
                onDecisionChange={(decision) => setStatementDecision(transaction.id, decision)}
                matchKey={`scotia:${transaction.id}`}
                matchedLeftKey={matchedLeftKeyByRightKey.get(`scotia:${transaction.id}`)}
                selectedWanderlogId={selectedLeftKey}
                onToggleMatch={() => toggleMatch(`scotia:${transaction.id}`)}
              />
            ))}
            {visibleCardTransactions.length === 0 && <p className="reconciliation-empty">No Scotiabank charges match this search.</p>}
          </div>
          <button className="statement-add-line" type="button" onClick={addCardTransaction}>+ Add card charge</button>

          {currentExportTransactions.length > 0 && (
            <>
              <div className="statement-source-heading export-source-heading">
                <div>
                  <span className="source-mark export" aria-hidden="true">E</span>
                  <div><strong>Tangerine Mastercard — expense export</strong><small>Earlier Peru charges found in EXPENSES_EXPORT</small></div>
                </div>
                <strong>{money(exportTotal)}</strong>
              </div>
              <div className="ledger-column-labels" aria-hidden="true">
                <span>Date</span><span>Transaction</span><span>Amount</span><span>Status</span>
              </div>
              <div className="statement-lines">
                {visibleExportTransactions.map((transaction) => (
                  <EditableStatementLine
                    key={transaction.id}
                    transaction={transaction}
                    onChange={(patch) => updateExportTransaction(transaction.id, patch)}
                    decision={statementDecisionFor(transaction.id)}
                    onDecisionChange={(decision) => setStatementDecision(transaction.id, decision)}
                    matchKey={`export:${transaction.id}`}
                    matchedLeftKey={matchedLeftKeyByRightKey.get(`export:${transaction.id}`)}
                    selectedWanderlogId={selectedLeftKey}
                    onToggleMatch={() => toggleMatch(`export:${transaction.id}`)}
                  />
                ))}
                {visibleExportTransactions.length === 0 && <p className="reconciliation-empty">No export charges match this search.</p>}
              </div>
              <button className="statement-add-line" type="button" onClick={() => updateReconciliation({ exportTransactions: { ...exportTransactions, [cardKey]: [...currentExportTransactions, { id: uid(), date: "", description: "New exported charge", detail: "Tangerine Mastercard", amount: 0 }] } })}>+ Add exported charge</button>
            </>
          )}

          {trip === "peru" && (
            <>
              <div className="statement-source-heading cash-source-heading">
                <div>
                  <span className="source-mark tangerine" aria-hidden="true">T</span>
                  <div><strong>Tangerine cash withdrawals</strong><small>Cash spent = withdrawn minus cash brought home</small></div>
                </div>
                <strong>{money(cashSpent)}</strong>
              </div>
              <div className="ledger-column-labels" aria-hidden="true">
                <span>Date</span><span>Transaction</span><span>Amount</span><span>Status</span>
              </div>
              <div className="statement-lines">
                {visibleCashTransactions.map((transaction) => (
                  <EditableStatementLine
                    key={transaction.id}
                    transaction={transaction}
                    onChange={(patch) => updateCashTransaction(transaction.id, patch)}
                    decision={statementDecisionFor(transaction.id)}
                    onDecisionChange={(decision) => setStatementDecision(transaction.id, decision)}
                    matchKey={`cash:${transaction.id}`}
                    matchedLeftKey={matchedLeftKeyByRightKey.get(`cash:${transaction.id}`)}
                    selectedWanderlogId={selectedLeftKey}
                    onToggleMatch={() => toggleMatch(`cash:${transaction.id}`)}
                  />
                ))}
                {visibleCashTransactions.length === 0 && <p className="reconciliation-empty">No Tangerine withdrawals match this search.</p>}
              </div>
              <button className="statement-add-line" type="button" onClick={addCashTransaction}>+ Add cash withdrawal</button>

              <div className="cash-adjustment-line">
                <div>
                  <strong>Cash brought home</strong>
                  <small>{cashRemaining === "" ? "Currently assuming CA$0 remained" : `${money(cashRecorded)} withdrawn in total`}</small>
                </div>
                <label>
                  <span>CA$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashRemaining}
                    onChange={(event) => updateReconciliation({ cashRemaining: event.target.value })}
                    placeholder="0.00"
                    aria-label="Cash brought home"
                  />
                </label>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function EditableStatementLine({
  transaction,
  onChange,
  decision,
  onDecisionChange,
  matchKey,
  matchedLeftKey,
  selectedWanderlogId,
  onToggleMatch,
}: {
  transaction: StatementTransaction;
  onChange: (patch: Partial<StatementTransaction>) => void;
  decision: "include" | "exclude";
  onDecisionChange: (decision: "include" | "exclude") => void;
  matchKey: string;
  matchedLeftKey?: string;
  selectedWanderlogId: string | null;
  onToggleMatch: () => void;
}) {
  return (
    <div className={`statement-line editable-statement-line decision-${decision}`} data-match-key={matchKey}>
      <input
        className="statement-date-input"
        aria-label="Transaction date"
        value={transaction.date}
        onChange={(event) => onChange({ date: event.target.value })}
      />
      <div className="statement-description editable-description">
        <input
          aria-label="Transaction description"
          value={transaction.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        <input
          aria-label="Transaction detail"
          value={transaction.detail}
          onChange={(event) => onChange({ detail: event.target.value })}
          placeholder="Optional note"
        />
      </div>
      <label className="statement-amount-input">
        <span>CA$</span>
        <input
          aria-label="Transaction amount"
          type="number"
          min="0"
          step="0.01"
          value={transaction.amount}
          onChange={(event) => onChange({ amount: Number(event.target.value) || 0 })}
        />
      </label>
      <div className="statement-actions">
        <select
          className="statement-decision right-statement-decision"
          aria-label={`Status for ${transaction.description}`}
          value={decision}
          onChange={(event) => onDecisionChange(event.target.value as "include" | "exclude")}
        >
          <option value="include">Include</option>
          <option value="exclude">Exclude</option>
        </select>
        {selectedWanderlogId && decision === "include" && (
          <button className={`match-action ${matchedLeftKey === selectedWanderlogId ? "linked" : ""}`} type="button" onClick={onToggleMatch}>
            {matchedLeftKey === selectedWanderlogId ? "Unmatch" : matchedLeftKey ? "Reassign" : "Match"}
          </button>
        )}
        {matchedLeftKey && !selectedWanderlogId && <span className="match-badge">Matched</span>}
      </div>
    </div>
  );
}
