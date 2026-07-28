import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ME, useStore } from "../store";
import { balancesWith, buildLedger, netBalances } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "../components/Avatar";
import { relativeTime } from "../utils/dates";
import { CategoryIcon, GroupBadge, NavIcon } from "../components/Icons";

const RECONCILIATION_TRIPS = [
  {
    key: "peru",
    name: "Peru",
    reviewIds: [
      "peru-desert",
      "peru-hostel-1",
      "peru-hostel-2",
      "peru-viator",
      "peru-los-portales",
      "peru-kafi",
      "peru-waya",
      "peru-refund",
    ],
  },
  {
    key: "new-york",
    name: "New York",
    reviewIds: ["ny-birria", "ny-radical", "ny-cash"],
  },
] as const;

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
  const myGroups = state.groups
    .filter((group) => group.memberIds.includes(ME))
    .map((group) => {
      const expenseCount = state.expenses.filter(
        (expense) => expense.groupId === group.id,
      ).length;
      const myBalance =
        netBalances(buildLedger(state, { groupId: group.id })).get(ME) ?? 0;
      return { group, expenseCount, myBalance };
    });
  const ongoingReconciliations = RECONCILIATION_TRIPS.map((trip) => {
    const pending = trip.reviewIds.filter(
      (id) =>
        (state.reconciliation.decisions[`${trip.key}-${id}`] ?? "review") ===
        "review",
    ).length;
    return { ...trip, pending };
  }).filter((trip) => trip.pending > 0);
  const pendingReconciliationItems = ongoingReconciliations.reduce(
    (sum, trip) => sum + trip.pending,
    0,
  );

  return (
    <main className="pane pane-wide overview-page">
      <div className="pane-header hero-header">
        <h1>Overview</h1>
      </div>

      <section
        className="overview-balances"
        aria-labelledby="overview-balances-title"
      >
        <div className="overview-section-heading">
          <h2 id="overview-balances-title">Balances</h2>
          <Link to="/settlements">Settlements</Link>
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
            <Link to="/activity">Activity</Link>
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

      <div className="overview-columns overview-secondary">
        <section
          className="overview-section"
          aria-labelledby="overview-groups-title"
        >
          <div className="overview-section-heading">
            <h2 id="overview-groups-title">Your groups</h2>
            <Link to="/groups">All groups</Link>
          </div>
          <div className="overview-list">
            {myGroups.map(({ group, expenseCount, myBalance }) => (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                className="person-row overview-group-row"
              >
                <GroupBadge type={group.type} name={group.name} size={34} />
                <span className="name">
                  {group.name}
                  <small>
                    {group.memberIds.length} members, {expenseCount} expenses
                  </small>
                </span>
                <span
                  className={`detail ${
                    myBalance > 0 ? "pos" : myBalance < 0 ? "neg" : "zero"
                  }`}
                >
                  {myBalance === 0
                    ? "Settled"
                    : `${myBalance > 0 ? "+" : "-"}${formatMoney(
                        Math.abs(myBalance),
                      )}`}
                </span>
              </Link>
            ))}
            {myGroups.length === 0 && (
              <div className="empty-inline">You are not in any groups yet.</div>
            )}
          </div>
        </section>

        <section
          className="overview-section"
          aria-labelledby="overview-reconciliations-title"
        >
          <div className="overview-section-heading">
            <h2 id="overview-reconciliations-title">Reconciliation</h2>
            <Link to="/reconciliation">Review</Link>
          </div>
          {ongoingReconciliations.length > 0 ? (
            <Link
              to="/reconciliation"
              className="overview-reconciliation-row"
            >
              <span className="activity-icon" aria-hidden="true">
                <NavIcon type="reconciliation" />
              </span>
              <span className="name">
                {ongoingReconciliations.map((trip) => trip.name).join(" and ")}
                <small>
                  {pendingReconciliationItems}{" "}
                  {pendingReconciliationItems === 1 ? "charge needs" : "charges need"} a
                  decision
                </small>
              </span>
              <span className="status-chip owed">In progress</span>
            </Link>
          ) : (
            <div className="empty-inline">All reconciliations are up to date.</div>
          )}
        </section>
      </div>
    </main>
  );
}
