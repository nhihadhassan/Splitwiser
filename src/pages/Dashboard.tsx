import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ME, useStore } from "../store";
import { balancesWith, buildLedger } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "../components/Avatar";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";

export function Dashboard() {
  const { state, peopleById } = useStore();
  const [addingExpense, setAddingExpense] = useState(false);
  const [settling, setSettling] = useState(false);

  const balances = useMemo(() => {
    const ledger = buildLedger(state);
    return balancesWith(ledger, ME);
  }, [state]);

  const owedToMe = [...balances.entries()].filter(([, v]) => v > 0);
  const iOwe = [...balances.entries()].filter(([, v]) => v < 0);
  const totalOwedToMe = owedToMe.reduce((sum, [, v]) => sum + v, 0);
  const totalIOwe = iOwe.reduce((sum, [, v]) => sum - v, 0);
  const total = totalOwedToMe - totalIOwe;

  return (
    <>
      <main className="pane">
        <div className="pane-header">
          <h1>Dashboard</h1>
          <button className="btn btn-orange" onClick={() => setAddingExpense(true)}>
            Add an expense
          </button>
          <button className="btn btn-teal" onClick={() => setSettling(true)}>
            Settle up
          </button>
        </div>

        <div className="balance-strip">
          <div className="cell">
            <div className="label">Total balance</div>
            <div className={`value ${total > 0 ? "pos" : total < 0 ? "neg" : "zero"}`}>
              {total === 0 ? "$0.00" : (total > 0 ? "+ " : "– ") + formatMoney(Math.abs(total))}
            </div>
          </div>
          <div className="cell">
            <div className="label">You owe</div>
            <div className={`value ${totalIOwe > 0 ? "neg" : "zero"}`}>
              {formatMoney(totalIOwe)}
            </div>
          </div>
          <div className="cell">
            <div className="label">You are owed</div>
            <div className={`value ${totalOwedToMe > 0 ? "pos" : "zero"}`}>
              {formatMoney(totalOwedToMe)}
            </div>
          </div>
        </div>

        <div className="owe-columns">
          <div className="col">
            <h3>You owe</h3>
            {iOwe.length === 0 && (
              <div style={{ color: "#999", fontStyle: "italic" }}>
                You do not owe anything 🎉
              </div>
            )}
            {iOwe.map(([id, v]) => {
              const person = peopleById.get(id);
              return (
                <Link key={id} to={`/friends/${id}`} className="person-row" style={{ color: "inherit" }}>
                  <Avatar person={person} size={32} />
                  <span className="name">{person?.name}</span>
                  <span className="detail neg">
                    you owe
                    <br />
                    {formatMoney(-v)}
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="col">
            <h3>You are owed</h3>
            {owedToMe.length === 0 && (
              <div style={{ color: "#999", fontStyle: "italic" }}>
                You are not owed anything
              </div>
            )}
            {owedToMe.map(([id, v]) => {
              const person = peopleById.get(id);
              return (
                <Link key={id} to={`/friends/${id}`} className="person-row" style={{ color: "inherit" }}>
                  <Avatar person={person} size={32} />
                  <span className="name">{person?.name}</span>
                  <span className="detail pos">
                    owes you
                    <br />
                    {formatMoney(v)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </main>

      <aside className="rail">
        <div className="rail-card">
          <h3>Getting around</h3>
          <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
            Add expenses to groups or directly with friends. Splitwiser keeps a running
            tally of who owes whom, and “Settle up” records repayments. Everything is
            saved in your browser.
          </div>
        </div>
      </aside>

      {addingExpense && <AddExpenseModal onClose={() => setAddingExpense(false)} />}
      {settling && <SettleUpModal onClose={() => setSettling(false)} />}
    </>
  );
}
