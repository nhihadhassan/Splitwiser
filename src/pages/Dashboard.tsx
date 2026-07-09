import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ME, useStore } from "../store";
import { balancesWith, buildLedger } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "../components/Avatar";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";
import { GROUP_ICONS } from "../components/GroupModal";
import { relativeTime } from "../utils/dates";

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
  const recentExpenses = [...state.expenses].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const activeGroups = state.groups.slice(0, 4).map((group) => {
    const groupLedger = buildLedger(state, { groupId: group.id });
    const groupBalances = balancesWith(groupLedger, ME);
    const balance = [...groupBalances.values()].reduce((sum, value) => sum + value, 0);
    return { group, balance };
  });

  return (
    <>
      <main className="pane pane-wide">
        <div className="pane-header hero-header">
          <div>
            <p className="eyebrow">Executive Ledger</p>
            <h1>Overview</h1>
          </div>
          <button className="btn btn-gold" onClick={() => setAddingExpense(true)}>
            Add Expense
          </button>
          <button className="btn btn-plain" onClick={() => setSettling(true)}>
            Settle Up
          </button>
        </div>

        <section className="bento-grid">
          <div className="module-card balance-module span-8">
            <p className="eyebrow">Total Balance</p>
            <strong className={total > 0 ? "pos" : total < 0 ? "neg" : "zero"}>
              {total === 0 ? "$0.00" : `${total > 0 ? "+" : "-"}${formatMoney(Math.abs(total))}`}
            </strong>
            <div className="balance-meter" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.max(8, (totalOwedToMe / Math.max(1, totalOwedToMe + totalIOwe)) * 100))}%` }} />
            </div>
            <div className="ledger-stats">
              <div>
                <span>You owe</span>
                <strong className={totalIOwe > 0 ? "neg" : "zero"}>{formatMoney(totalIOwe)}</strong>
              </div>
              <div>
                <span>You are owed</span>
                <strong className={totalOwedToMe > 0 ? "pos" : "zero"}>{formatMoney(totalOwedToMe)}</strong>
              </div>
            </div>
          </div>

          <div className="module-card quick-add span-4">
            <h2>Quick Add</h2>
            <p className="muted-copy">Log a shared cost, record a repayment, or open a new ledger.</p>
            <button className="btn btn-gold" onClick={() => setAddingExpense(true)}>
              Add Expense
            </button>
            <button className="btn btn-plain" onClick={() => setSettling(true)}>
              Record Payment
            </button>
          </div>

          <div className="module-card span-6">
            <div className="module-heading">
              <h2>Recent Activity</h2>
              <Link to="/activity">View all</Link>
            </div>
            {recentExpenses.map((expense) => {
              const payer = expense.splits.find((split) => split.paid > 0);
              const payerPerson = payer ? peopleById.get(payer.personId) : undefined;
              return (
                <div className="feed-line" key={expense.id}>
                  <Avatar person={payerPerson} size={34} />
                  <div>
                    <strong>{expense.description}</strong>
                    <span>{payerPerson?.id === ME ? "You" : payerPerson?.name} paid, {relativeTime(expense.createdAt)}</span>
                  </div>
                  <strong>{formatMoney(expense.amount)}</strong>
                </div>
              );
            })}
            {recentExpenses.length === 0 && <div className="empty-inline">No expenses yet.</div>}
          </div>

          <div className="module-card span-6">
            <div className="module-heading">
              <h2>Active Ledgers</h2>
              <Link to="/groups">Manage</Link>
            </div>
            {activeGroups.map(({ group, balance }) => (
              <Link className="ledger-shortcut" key={group.id} to={`/groups/${group.id}`}>
                <span className="ledger-icon">{GROUP_ICONS[group.type]}</span>
                <div>
                  <strong>{group.name}</strong>
                  <span>{group.memberIds.length} members</span>
                </div>
                <span className={`status-chip ${balance === 0 ? "settled" : "owed"}`}>
                  {balance === 0 ? "Settled" : formatMoney(Math.abs(balance))}
                </span>
              </Link>
            ))}
            {activeGroups.length === 0 && <div className="empty-inline">No groups yet.</div>}
          </div>

          <div className="module-card span-6">
            <div className="module-heading">
              <h2>You Owe</h2>
            </div>
            {iOwe.length === 0 && <div className="empty-inline">No outbound balances.</div>}
            {iOwe.slice(0, 4).map(([id, v]) => {
              const person = peopleById.get(id);
              return (
                <Link key={id} to={`/friends/${id}`} className="person-row">
                  <Avatar person={person} size={32} />
                  <span className="name">{person?.name}</span>
                  <span className="detail neg">
                    {formatMoney(-v)}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="module-card span-6">
            <div className="module-heading">
              <h2>You Are Owed</h2>
            </div>
            {owedToMe.length === 0 && <div className="empty-inline">No inbound balances.</div>}
            {owedToMe.slice(0, 4).map(([id, v]) => {
              const person = peopleById.get(id);
              return (
                <Link key={id} to={`/friends/${id}`} className="person-row">
                  <Avatar person={person} size={32} />
                  <span className="name">{person?.name}</span>
                  <span className="detail pos">
                    {formatMoney(v)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      <aside className="rail">
        <div className="rail-card">
          <h3>Ledger Notes</h3>
          <p className="muted-copy">
            All balances use cent-accurate math and are stored locally in this browser.
          </p>
        </div>
      </aside>

      {addingExpense && <AddExpenseModal onClose={() => setAddingExpense(false)} />}
      {settling && <SettleUpModal onClose={() => setSettling(false)} />}
    </>
  );
}
