import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ME, useStore } from "../store";
import { balancesWith, buildLedger } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "../components/Avatar";
import { relativeTime } from "../utils/dates";
import { CategoryIcon } from "../components/Icons";

export function Dashboard() {
  const { state, peopleById } = useStore();

  const balances = useMemo(() => {
    const ledger = buildLedger(state);
    return balancesWith(ledger, ME);
  }, [state]);

  const owedToMe = [...balances.entries()].filter(([, v]) => v > 0);
  const iOwe = [...balances.entries()].filter(([, v]) => v < 0);
  const totalOwedToMe = owedToMe.reduce((sum, [, v]) => sum + v, 0);
  const totalIOwe = iOwe.reduce((sum, [, v]) => sum - v, 0);
  const recentExpenses = [...state.expenses]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);
  const openBalances = [...balances.entries()]
    .filter(([, value]) => value !== 0)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));

  return (
    <main className="pane pane-wide overview-page">
      <div className="pane-header hero-header">
        <div>
          <p className="eyebrow">Shared Ledger</p>
          <h1>Overview</h1>
        </div>
      </div>

      <section
        className="overview-balances"
        aria-labelledby="overview-balances-title"
      >
        <div className="overview-section-heading">
          <div>
            <p className="eyebrow">Current position</p>
            <h2 id="overview-balances-title">Balances</h2>
          </div>
          <Link to="/settlements">Review settlements</Link>
        </div>

        <div className="overview-totals">
          <div>
            <span>You are owed</span>
            <strong className={totalOwedToMe > 0 ? "pos" : "zero"}>
              {formatMoney(totalOwedToMe)}
            </strong>
          </div>
          <div>
            <span>You owe</span>
            <strong className={totalIOwe > 0 ? "neg" : "zero"}>
              {formatMoney(totalIOwe)}
            </strong>
          </div>
        </div>
      </section>

      <div className="overview-columns">
        <section
          className="overview-section"
          aria-labelledby="recent-expenses-title"
        >
          <div className="overview-section-heading">
            <h2 id="recent-expenses-title">Recent expenses</h2>
            <Link to="/activity">View activity</Link>
          </div>
          <div className="overview-list">
            {recentExpenses.map((expense) => {
              const payer = expense.splits.find((split) => split.paid > 0);
              const payerPerson = payer
                ? peopleById.get(payer.personId)
                : undefined;
              return (
                <div className="feed-line" key={expense.id}>
                  <span
                    className={`activity-icon activity-icon-${expense.category}`}
                  >
                    <CategoryIcon category={expense.category} size={20} />
                  </span>
                  <div>
                    <strong>{expense.description}</strong>
                    <span>
                      {payerPerson?.id === ME ? "You" : payerPerson?.name} paid,{" "}
                      {relativeTime(expense.createdAt)}
                    </span>
                  </div>
                  <strong>{formatMoney(expense.amount)}</strong>
                </div>
              );
            })}
            {recentExpenses.length === 0 && (
              <div className="empty-inline">No expenses yet.</div>
            )}
          </div>
        </section>

        <section
          className="overview-section"
          aria-labelledby="open-balances-title"
        >
          <div className="overview-section-heading">
            <h2 id="open-balances-title">Open balances</h2>
          </div>
          <div className="overview-list">
            {openBalances.length === 0 && (
              <div className="empty-inline">Everyone is settled.</div>
            )}
            {openBalances.map(([id, value]) => {
              const person = peopleById.get(id);
              const owedToMe = value > 0;
              return (
                <Link key={id} to={`/friends/${id}`} className="person-row">
                  <Avatar person={person} size={32} />
                  <span className="name">
                    {person?.name}
                    <small>{owedToMe ? "Owes you" : "You owe"}</small>
                  </span>
                  <span className={`detail ${owedToMe ? "pos" : "neg"}`}>
                    {formatMoney(Math.abs(value))}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
