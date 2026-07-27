import { useEffect, useMemo, useState } from "react";

type TripKey = "peru" | "new-york";
type ReviewItem = {
  id: string;
  label: string;
  detail: string;
  amount: string;
  tone?: "warning" | "muted";
};

const reviewItems: Record<TripKey, ReviewItem[]> = {
  peru: [
    { id: "peru-desert", label: "Desert Xtremo", detail: "Scotiabank only · Lima · Jul 25", amount: "CA$69.66" },
    { id: "peru-hostel-1", label: "Hostelworld", detail: "Scotiabank only · Dublin descriptor · Jul 25", amount: "CA$11.65" },
    { id: "peru-hostel-2", label: "Hostelworld", detail: "Scotiabank only · Dublin descriptor · Jul 21", amount: "CA$15.06" },
    { id: "peru-viator", label: "Viator Tripadvisor", detail: "Likely Vinicunca · Wanderlog says CA$239.00", amount: "CA$238.98" },
    { id: "peru-los-portales", label: "Los Portalitos de Chivay", detail: "Wanderlog says CA$56.00 · statement differs", amount: "CA$61.10" },
    { id: "peru-kafi", label: "Kafi Wasi", detail: "Wanderlog says PEN 20.00 · statement amount", amount: "CA$6.64" },
    { id: "peru-waya", label: "Waya Lookout", detail: "Wanderlog says PEN 55.00 · statement amount", amount: "CA$22.86" },
    { id: "peru-refund", label: "Thank You Tan credit", detail: "CA$408.77 credit to Scotiabank · identify before netting", amount: "-CA$408.77", tone: "muted" },
  ],
  "new-york": [
    { id: "ny-birria", label: "Birria-Landia", detail: "Statement only · Astoria · Jun 27", amount: "CA$25.50" },
    { id: "ny-radical", label: "Radical New York", detail: "Statement only · Jun 25", amount: "CA$25.34" },
    { id: "ny-cash", label: "Cash expenses", detail: "Casa Adela and Joe's Pizza are recorded in USD", amount: "US$69.50", tone: "muted" },
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
  const [trip, setTrip] = useState<TripKey>("peru");
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("splitwiser-reconciliation-checked") ?? "{}");
    } catch {
      return {};
    }
  });
  const [cashRemaining, setCashRemaining] = useState(() => localStorage.getItem("splitwiser-peru-cash-remaining") ?? "");
  const meta = tripMeta[trip];
  const items = reviewItems[trip];
  const completed = items.filter((item) => checked[`${trip}-${item.id}`]).length;
  const progress = items.length === 0 ? 0 : Math.round((completed / items.length) * 100);
  const cashSpent = cashRemaining === "" ? null : Math.max(0, peruCashRecorded - Number(cashRemaining));

  useEffect(() => {
    localStorage.setItem("splitwiser-reconciliation-checked", JSON.stringify(checked));
  }, [checked]);

  useEffect(() => {
    localStorage.setItem("splitwiser-peru-cash-remaining", cashRemaining);
  }, [cashRemaining]);

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

  function toggle(itemId: string) {
    const key = `${trip}-${itemId}`;
    setChecked((current) => ({ ...current, [key]: !current[key] }));
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
            <div className="balance-meter" aria-label={`${progress}% complete`}><span style={{ width: `${progress}%` }} /></div>
          </div>
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
                <div className="amount-input"><span className="currency">CA$</span><input type="number" min="0" step="0.01" value={cashRemaining} onChange={(event) => setCashRemaining(event.target.value)} placeholder="0.00" /></div>
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
              <p className="eyebrow">Decision queue</p>
              <h2>Needs your confirmation</h2>
            </div>
            <span className="status-chip owed">{items.length - completed} open</span>
          </div>
          <div className="review-list">
            {items.map((item) => {
              const isChecked = checked[`${trip}-${item.id}`];
              return (
                <label className={`review-item ${isChecked ? "is-checked" : ""}`} key={item.id}>
                  <input type="checkbox" checked={isChecked} onChange={() => toggle(item.id)} />
                  <span className="review-check" aria-hidden="true">{isChecked ? "✓" : ""}</span>
                  <span className="review-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <span className={`review-amount ${item.tone === "muted" ? "muted" : ""}`}>{item.amount}</span>
                </label>
              );
            })}
          </div>
        </section>
      </main>

      <aside className="rail">
        <div className="rail-card">
          <h3>How to finish</h3>
          <p className="muted-copy">Check an item when you have matched it to Wanderlog, identified it as unrelated, or decided to keep it as a separate cash expense.</p>
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
