import { useMemo, useState } from "react";
import { useStore } from "../store";
import { formatMoney } from "../utils/money";
import type { ReconciliationDecision } from "../types";
import "./ReconciliationPage.css";

type TripKey = "peru" | "new-york";
type ReviewItem = {
  id: string;
  label: string;
  detail: string;
  amount: number;
  displayAmount?: string;
  source: "Scotiabank" | "Cash";
};

type ChargeDecision = ReconciliationDecision;
type Charge = {
  id: string;
  date: string;
  label: string;
  detail: string;
  source: "Wanderlog" | "Scotiabank" | "Cash";
  amount: number;
  displayAmount?: string;
  defaultDecision: ChargeDecision;
};

const reviewItems: Record<TripKey, ReviewItem[]> = {
  peru: [
    { id: "peru-desert", label: "Desert Xtremo", detail: "Statement only · Lima · Jul 25", amount: 69.66, source: "Scotiabank" },
    { id: "peru-hostel-1", label: "Hostelworld", detail: "Statement only · Dublin descriptor · Jul 25", amount: 11.65, source: "Scotiabank" },
    { id: "peru-hostel-2", label: "Hostelworld", detail: "Statement only · Dublin descriptor · Jul 21", amount: 15.06, source: "Scotiabank" },
    { id: "peru-viator", label: "Viator Tripadvisor", detail: "Likely Vinicunca · Wanderlog says CA$239.00", amount: 238.98, source: "Scotiabank" },
    { id: "peru-los-portales", label: "Los Portalitos de Chivay", detail: "Wanderlog says CA$56.00 · statement differs", amount: 61.10, source: "Scotiabank" },
    { id: "peru-kafi", label: "Kafi Wasi", detail: "Wanderlog says PEN 20.00 · statement amount", amount: 6.64, source: "Scotiabank" },
    { id: "peru-waya", label: "Waya Lookout", detail: "Wanderlog says PEN 55.00 · statement amount", amount: 22.86, source: "Scotiabank" },
    { id: "peru-refund", label: "Thank You Tan credit", detail: "CA$408.77 credit to Scotiabank · identify before netting", amount: -408.77, source: "Scotiabank" },
  ],
  "new-york": [
    { id: "ny-birria", label: "Birria-Landia", detail: "Statement only · Astoria · Jun 27", amount: 25.50, source: "Scotiabank" },
    { id: "ny-radical", label: "Radical New York", detail: "Statement only · Jun 25", amount: 25.34, source: "Scotiabank" },
    { id: "ny-cash", label: "Cash expenses", detail: "Casa Adela and Joe's Pizza are recorded in USD", amount: 95.22, displayAmount: "US$69.50", source: "Cash" },
  ],
};

const tripMeta: Record<TripKey, { name: string; dates: string; budget: string; status: string; intro: string }> = {
  peru: {
    name: "Peru",
    dates: "Jul 11 - Jul 26, 2026",
    budget: "CA$5,539.30",
    status: "In progress",
    intro: "Match Wanderlog against Scotiabank, then account for the cash withdrawn from Tangerine ATMs.",
  },
  "new-york": {
    name: "New York",
    dates: "Jun 25 - Jun 28, 2026",
    budget: "CA$855.15",
    status: "Mostly matched",
    intro: "The card activity is nearly complete. Only two statement charges and the USD cash entries need a decision.",
  },
};

const peruCashRecorded = 1679.69;

export function ReconciliationPage() {
  const { state, dispatch } = useStore();
  const [trip, setTrip] = useState<TripKey>("peru");
  const { decisions, cashRemaining } = state.reconciliation;
  const [filter, setFilter] = useState<"all" | ChargeDecision>("all");
  const [query, setQuery] = useState("");
  const meta = tripMeta[trip];
  const items = reviewItems[trip];
  const cashSpent = cashRemaining === "" ? null : Math.max(0, peruCashRecorded - Number(cashRemaining));

  const charges = useMemo<Charge[]>(() => {
    const groupId = trip === "peru" ? "g-peru" : "g-new-york";
    const wanderlogCharges = state.expenses
      .filter((expense) => expense.groupId === groupId)
      .map((expense) => ({
        id: expense.id,
        date: expense.date,
        label: expense.description,
        detail: expense.notes?.replace("Imported from Wanderlog: ", "") ?? "Imported from Wanderlog",
        source: "Wanderlog" as const,
        amount: expense.amount / 100,
        defaultDecision: "include" as const,
      }));
    const statementCharges = items.map((item) => ({
      id: item.id,
      date: "To review",
      label: item.label,
      detail: item.detail,
      source: item.source,
      amount: item.amount,
      displayAmount: item.displayAmount,
      defaultDecision: "review" as const,
    }));
    return [...wanderlogCharges, ...statementCharges].sort((a, b) => b.date.localeCompare(a.date));
  }, [items, state.expenses, trip]);

  const decisionFor = (charge: Charge): ChargeDecision => decisions[`${trip}-${charge.id}`] ?? charge.defaultDecision;
  const totals = useMemo(() => {
    return charges.reduce<Record<ChargeDecision, number>>((result, charge) => {
      result[decisionFor(charge)] += charge.amount;
      return result;
    }, { include: 0, exclude: 0, personal: 0, review: 0 });
  // decisions are intentionally the only mutable input to the reconciliation totals
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charges, decisions, trip]);
  const completed = charges.filter((charge) => decisionFor(charge) !== "review").length;
  const progress = charges.length === 0 ? 0 : Math.round((completed / charges.length) * 100);
  const visibleCharges = charges.filter((charge) => {
    const decision = decisionFor(charge);
    const matchesFilter = filter === "all" || decision === filter;
    const needle = query.trim().toLowerCase();
    const matchesQuery = needle === "" || `${charge.label} ${charge.detail} ${charge.source}`.toLowerCase().includes(needle);
    return matchesFilter && matchesQuery;
  });

  const summary = useMemo(() => {
    if (trip === "peru") {
      return [
        ["Wanderlog budget", "CA$5,539.30", "Trip source"],
        ["Tangerine cash withdrawn", "CA$1,470.69", "10 ATM withdrawals + fee"],
        ["Scotiabank card", "Reviewing", "CAD, PEN and USD entries"],
      ];
    }
    return [
      ["Wanderlog logged", "CA$757.24 + US$69.50", "Card and cash"],
      ["Flight included", "CA$521.76", "Not on current statement"],
      ["Items to review", "3", "2 card charges + cash"],
    ];
  }, [trip]);

  function setDecision(chargeId: string, decision: ChargeDecision) {
    dispatch({
      type: "updateReconciliation",
      reconciliation: {
        ...state.reconciliation,
        decisions: { ...decisions, [`${trip}-${chargeId}`]: decision },
      },
    });
  }

  return (
    <>
      <main className="pane pane-wide reconciliation-page">
        <div className="pane-header hero-header">
          <div>
            <p className="eyebrow">Trip Reconciliation</p>
            <h1>Close the loop</h1>
          </div>
          <span className={`status-chip ${progress === 100 ? "settled" : "owed"}`}>{progress === 100 ? "Ready to close" : meta.status}</span>
        </div>

        <div className="reconciliation-tabs" role="tablist" aria-label="Trips">
          {(Object.keys(tripMeta) as TripKey[]).map((key) => (
            <button key={key} className={trip === key ? "active" : ""} onClick={() => setTrip(key)} role="tab" aria-selected={trip === key}>
              <span>{tripMeta[key].name}</span>
              <small>{tripMeta[key].dates}</small>
            </button>
          ))}
        </div>

        <section className="reconciliation-intro">
          <div>
            <p className="eyebrow">{meta.dates}</p>
            <h2>{meta.name} expense review</h2>
            <p>{meta.intro}</p>
          </div>
          <div className="reconciliation-progress">
            <span>{completed} of {items.length} review items checked</span>
            <div
              className="balance-meter"
              role="progressbar"
              aria-label="Reconciliation progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        </section>

        <section className="reconciliation-totals" aria-label="Reconciliation totals">
          <div><span>Included total</span><strong>{formatMoney(Math.round(totals.include * 100))}</strong></div>
          <div><span>Needs review</span><strong>{formatMoney(Math.round(totals.review * 100))}</strong></div>
          <div><span>Excluded or personal</span><strong>{formatMoney(Math.round((totals.exclude + totals.personal) * 100))}</strong></div>
        </section>

        <section className="reconciliation-summary">
          {summary.map(([label, value, detail]) => (
            <div className="reconciliation-summary-cell" key={label}>
              <span className="eyebrow">{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </section>

        {trip === "peru" && (
          <section className="module-card reconciliation-cash">
            <div className="module-heading">
              <div>
                <p className="eyebrow">Cash source</p>
                <h2>Tangerine ATM withdrawals</h2>
              </div>
              <strong className="reconciliation-total">CA$1,679.69</strong>
            </div>
            <p className="muted-copy">CA$212.00 for 500 PEN was withdrawn before July 12. From July 12 onward, CA$1,467.69 was withdrawn across 10 international ATMs, including a CA$3.00 ABM network charge. This is cash recorded, not automatically cash spent.</p>
            <div className="cash-breakdown">
              <span>Before Jul 12 <strong>500 PEN · CA$212.00</strong></span>
              <span>Jul 12 <strong>CA$256.83</strong></span>
              <span>Jul 15 - 19 <strong>CA$678.58</strong></span>
              <span>Jul 21 - 26 <strong>CA$532.28</strong></span>
              <span>ABM fee <strong>CA$3.00</strong></span>
            </div>
            <div className="cash-entry-row">
              <label className="field">
                <span>Cash brought home</span>
                <div className="amount-input"><span className="currency">CA$</span><input type="number" min="0" step="0.01" value={cashRemaining} onChange={(event) => dispatch({ type: "updateReconciliation", reconciliation: { ...state.reconciliation, cashRemaining: event.target.value } })} placeholder="0.00" /></div>
              </label>
              <div className="cash-spent-result">
                <span>Estimated cash spent</span>
                <strong>{cashSpent === null ? "Enter remaining cash" : `CA$${cashSpent.toFixed(2)}`}</strong>
              </div>
            </div>
          </section>
        )}

        <section className="module-card reconciliation-review">
          <div className="module-heading">
            <div>
              <p className="eyebrow">Charge spreadsheet</p>
              <h2>Review every charge</h2>
            </div>
            <span className="status-chip owed">{totals.review > 0 ? `${formatMoney(Math.round(totals.review * 100))} pending` : "All decided"}</span>
          </div>
          <div className="reconciliation-toolbar">
            <label className="reconciliation-search"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Merchant or note" /></label>
            <label className="reconciliation-filter"><span>Show</span><select value={filter} onChange={(event) => setFilter(event.target.value as "all" | ChargeDecision)}><option value="all">All charges</option><option value="review">Needs review</option><option value="include">Included</option><option value="exclude">Excluded</option><option value="personal">Personal</option></select></label>
          </div>
          <div className="reconciliation-table-wrap">
            <table className="reconciliation-table">
              <thead><tr><th>Date</th><th>Charge</th><th>Source</th><th>Amount</th><th>Decision</th></tr></thead>
              <tbody>
                {visibleCharges.map((charge) => {
                  const decision = decisionFor(charge);
                  return <tr key={charge.id} className={`decision-${decision}`}>
                    <td>{charge.date}</td>
                    <td><strong>{charge.label}</strong><small>{charge.detail}</small></td>
                    <td><span className="source-tag">{charge.source}</span></td>
                    <td><strong>{charge.displayAmount ?? formatMoney(Math.round(charge.amount * 100))}</strong></td>
                    <td><select aria-label={`Decision for ${charge.label}`} value={decision} onChange={(event) => setDecision(charge.id, event.target.value as ChargeDecision)}><option value="include">Include</option><option value="review">Needs review</option><option value="personal">Personal</option><option value="exclude">Exclude</option></select></td>
                  </tr>;
                })}
              </tbody>
            </table>
            {visibleCharges.length === 0 && <p className="reconciliation-empty">No charges match this view.</p>}
          </div>
        </section>
      </main>

      <aside className="rail">
        <div className="rail-card">
          <h2>How to finish</h2>
          <p className="muted-copy">Use the dropdown beside each charge to include it, flag it for review, mark it personal, or exclude it. Totals update immediately and follow the ledger's save status.</p>
          <p className="muted-copy">For Peru, enter the amount of cash you brought home so cash withdrawn can be separated from cash spent.</p>
        </div>
        <div className="rail-card">
          <span className="eyebrow">Trip budget</span>
          <strong className="rail-number">{meta.budget}</strong>
          <span className="muted-copy">Wanderlog source total</span>
        </div>
      </aside>
    </>
  );
}
