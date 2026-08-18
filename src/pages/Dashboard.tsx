import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { balancesWith, buildLedger, netBalances } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "../components/Avatar";
import { relativeTime } from "../utils/dates";
import { CategoryIcon, GroupBadge, NavIcon } from "../components/Icons";
import { SettleUpModal } from "../components/SettleUpModal";
import { loadSocial } from "../social";

export function Dashboard() {
  const { state, peopleById, currentPersonId, session, getToken } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settling, setSettling] = useState<null | { fromId: string; toId: string; amount: number }>(null);
  const [unreadSocial, setUnreadSocial] = useState<number | null>(null);

  useEffect(() => {
    if (searchParams.get("settle") === "1") setSettling({ fromId: currentPersonId, toId: "", amount: 0 });
  }, [currentPersonId, searchParams]);

  function closeSettlement() {
    setSettling(null);
    if (searchParams.has("settle")) {
      const next = new URLSearchParams(searchParams);
      next.delete("settle");
      setSearchParams(next, { replace: true });
    }
  }

  const balances = useMemo(() => {
    const ledger = buildLedger(state);
    return balancesWith(ledger, currentPersonId);
  }, [currentPersonId, state]);

  const owedToMe = [...balances.entries()].filter(([, v]) => v > 0);
  const iOwe = [...balances.entries()].filter(([, v]) => v < 0);
  const totalOwedToMe = owedToMe.reduce((sum, [, v]) => sum + v, 0);
  const totalIOwe = iOwe.reduce((sum, [, v]) => sum - v, 0);
  const groupCurrencies = new Set(myGroupCurrencies(state, currentPersonId));
  const singleCurrency = groupCurrencies.size <= 1;
  const overallBalance = totalOwedToMe - totalIOwe;
  const recentExpenses = [...state.expenses]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);
  const openBalances = [...balances.entries()]
    .filter(([, value]) => value !== 0)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));
  const myGroups = state.groups
    .filter((group) => group.memberIds.includes(currentPersonId))
    .map((group) => {
      const expenseCount = state.expenses.filter(
        (expense) => expense.groupId === group.id,
      ).length;
      const myBalance =
        netBalances(buildLedger(state, { groupId: group.id })).get(currentPersonId) ?? 0;
      return { group, expenseCount, myBalance };
    });
  useEffect(() => {
    if (!getToken) {
      setUnreadSocial(null);
      return;
    }
    let active = true;
    const refresh = async () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      const results = await Promise.allSettled(myGroups.map(({ group }) => loadSocial(getToken, group.id)));
      if (active) setUnreadSocial(results.reduce((sum, result) => sum + (result.status === "fulfilled" ? result.value.unread : 0), 0));
    };
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.removeEventListener("focus", onFocus); };
  }, [getToken, myGroups.map(({ group }) => group.id).join("|")]);
  const ongoingReconciliations = (state.reconciliation.workspace?.periods ?? []).map((period) => {
    const pending = state.reconciliation.workspace?.transactions.filter((item) => item.tripId === period.tripId && (item.status === "unmatched" || item.status === "suggested" || item.status === "exception")).length ?? 0;
    return { key: period.tripId, name: period.name ?? period.tripId.replace(/[-_]/g, " "), pending };
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
          <div className="overview-total-primary">
            <span>Overall balance</span>
            <strong className={overallBalance > 0 ? "pos" : overallBalance < 0 ? "neg" : "zero"}>
              {singleCurrency ? `${overallBalance > 0 ? "+" : overallBalance < 0 ? "-" : ""}${formatMoney(Math.abs(overallBalance))}` : "By currency"}
            </strong>
            {!singleCurrency && <small>Balances stay separate when groups use different home currencies.</small>}
          </div>
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
            <h2 id="recent-expenses-title">Recent changes</h2>
            <Link to="/activity">Activity{unreadSocial ? ` · ${unreadSocial} unread` : ""}</Link>
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
                      {payerPerson?.id === currentPersonId ? "You" : payerPerson?.name} paid,{" "}
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
                <div key={id} className="person-row">
                  <Avatar person={person} size={32} />
                  <Link to={`/friends/${id}`} className="name">
                    {person?.name}
                    <small>{owedToMe ? "Owes you" : "You owe"}</small>
                  </Link>
                  <span className={`detail ${owedToMe ? "pos" : "neg"}`}>
                    {formatMoney(Math.abs(value))}
                  </span>
                  <button className="btn btn-secondary settle-inline" type="button" onClick={() => setSettling({
                    fromId: owedToMe ? id : currentPersonId,
                    toId: owedToMe ? currentPersonId : id,
                    amount: Math.abs(value),
                  })}>Settle</button>
                </div>
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

        {session.capabilities.reconcile && <section
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
        </section>}
      </div>
      {settling && <SettleUpModal prefill={settling.toId ? settling : undefined} onClose={closeSettlement} />}
    </main>
  );
}

function myGroupCurrencies(state: import("../types").AppState, personId: string): string[] {
  return state.groups.filter((group) => group.memberIds.includes(personId)).map((group) => group.homeCurrency ?? state.defaultCurrency ?? "CAD");
}
