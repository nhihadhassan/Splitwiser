import { useMemo, useState } from "react";
import { ME, uid, useStore } from "../store";
import { buildLedger, simplifyDebts, type SimplifiedDebt } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { today } from "../utils/dates";
import { Avatar } from "../components/Avatar";
import { SettleUpModal } from "../components/SettleUpModal";
import { AddExpenseModal } from "../components/AddExpenseModal";

export function SettlementsPage() {
  const { state, dispatch, peopleById } = useStore();
  const [settling, setSettling] = useState<SimplifiedDebt | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);

  const debts = useMemo(() => simplifyDebts(buildLedger(state)), [state]);
  const payable = debts.filter((debt) => debt.fromId === ME);
  const inbound = debts.filter((debt) => debt.toId === ME);
  const otherDebts = debts.filter((debt) => debt.fromId !== ME && debt.toId !== ME);
  const totalPayable = payable.reduce((sum, debt) => sum + debt.amount, 0);
  const totalInbound = inbound.reduce((sum, debt) => sum + debt.amount, 0);

  function settleAllPayable() {
    if (payable.length === 0) return;
    if (!confirm(`Record ${payable.length} payment${payable.length === 1 ? "" : "s"} totaling ${formatMoney(totalPayable)}?`)) {
      return;
    }
    for (const debt of payable) {
      dispatch({
        type: "addSettlement",
        settlement: {
          id: uid(),
          fromId: debt.fromId,
          toId: debt.toId,
          amount: debt.amount,
          date: today(),
          groupId: null,
          createdAt: Date.now(),
          createdBy: ME,
        },
      });
    }
  }

  return (
    <>
      <main className="pane pane-wide">
        <div className="pane-header hero-header">
          <div>
            <p className="eyebrow">Settlement Center</p>
            <h1>Settlement Overview</h1>
          </div>
          <button className="btn btn-plain" onClick={() => setAddingExpense(true)}>
            Add Expense
          </button>
        </div>

        <section className="settlement-hero">
          <div>
            <span>Total Payable</span>
            <strong>{formatMoney(totalPayable)}</strong>
          </div>
          <div>
            <span>Total Expected</span>
            <strong className="pos">{formatMoney(totalInbound)}</strong>
          </div>
          <button className="btn btn-gold" disabled={payable.length === 0} onClick={settleAllPayable}>
            Settle All
          </button>
        </section>

        <section className="bento-grid two">
          <div className="module-card">
            <div className="module-heading">
              <h2>Action Required</h2>
              <span className="status-chip owed">{payable.length}</span>
            </div>
            {payable.length === 0 ? (
              <div className="empty-inline">You have no outbound payments due.</div>
            ) : (
              payable.map((debt) => (
                <SettlementAction key={`${debt.fromId}-${debt.toId}`} debt={debt} onSettle={setSettling} />
              ))
            )}
          </div>

          <div className="module-card">
            <div className="module-heading">
              <h2>Inbound</h2>
              <span className="status-chip settled">{inbound.length}</span>
            </div>
            {inbound.length === 0 ? (
              <div className="empty-inline">No one owes you right now.</div>
            ) : (
              inbound.map((debt) => {
                const from = peopleById.get(debt.fromId);
                return (
                  <div className="settlement-row-card" key={`${debt.fromId}-${debt.toId}`}>
                    <Avatar person={from} size={38} />
                    <div>
                      <strong>{from?.name}</strong>
                      <span>owes you</span>
                    </div>
                    <strong className="pos">{formatMoney(debt.amount)}</strong>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {otherDebts.length > 0 && (
          <section className="module-card">
            <div className="module-heading">
              <h2>Other Member Transfers</h2>
            </div>
            {otherDebts.map((debt) => (
              <SettlementAction key={`${debt.fromId}-${debt.toId}`} debt={debt} onSettle={setSettling} />
            ))}
          </section>
        )}
      </main>
      <aside className="rail">
        <div className="rail-card">
          <h3>Recent Payments</h3>
          {state.settlements.slice(-5).reverse().map((settlement) => {
            const from = peopleById.get(settlement.fromId);
            const to = peopleById.get(settlement.toId);
            return (
              <div className="debt-line" key={settlement.id}>
                <span className="who">
                  {from?.id === ME ? "You" : from?.name} paid {to?.id === ME ? "you" : to?.name}
                </span>
                <span className="pos">{formatMoney(settlement.amount)}</span>
              </div>
            );
          })}
          {state.settlements.length === 0 && <p className="muted-copy">No payments recorded yet.</p>}
        </div>
      </aside>

      {settling && (
        <SettleUpModal prefill={settling} onClose={() => setSettling(null)} />
      )}
      {addingExpense && <AddExpenseModal onClose={() => setAddingExpense(false)} />}
    </>
  );
}

function SettlementAction({
  debt,
  onSettle,
}: {
  debt: SimplifiedDebt;
  onSettle: (debt: SimplifiedDebt) => void;
}) {
  const { peopleById } = useStore();
  const from = peopleById.get(debt.fromId);
  const to = peopleById.get(debt.toId);

  return (
    <div className="settlement-action">
      <Avatar person={from} size={44} />
      <div>
        <h3>{from?.id === ME ? "You" : from?.name}</h3>
        <p>
          Pay {to?.id === ME ? "you" : to?.name} <strong>{formatMoney(debt.amount)}</strong>
        </p>
      </div>
      <div className="settlement-tools">
        <button title="Wire transfer" className="tool-button">
          WT
        </button>
        <button title="Record payment" className="btn btn-gold" onClick={() => onSettle(debt)}>
          Settle
        </button>
      </div>
    </div>
  );
}
