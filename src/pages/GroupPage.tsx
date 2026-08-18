import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import {
  buildLedger,
  netBalances,
  rawDebts,
  simplifyDebts,
  type SimplifiedDebt,
} from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "../components/Avatar";
import { ExpenseList } from "../components/ExpenseList";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";
import { GroupModal } from "../components/GroupModal";
import { GroupBadge } from "../components/Icons";
import { SocialThread } from "../components/SocialThread";

export function GroupPage() {
  const { groupId } = useParams();
  const { state, dispatch, peopleById, currentPersonId, session } = useStore();
  const navigate = useNavigate();
  const [addingExpense, setAddingExpense] = useState(false);
  const [settling, setSettling] = useState<null | { fromId: string; toId: string; amount: number }>(null);
  const [settlingBlank, setSettlingBlank] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "expenses" | "discussion">("overview");

  const group = state.groups.find((g) => g.id === groupId);

  const ledger = useMemo(
    () => (group ? buildLedger(state, { groupId: group.id }) : new Map()),
    [state, group],
  );

  if (!group) return <Navigate to="/" replace />;

  const expenses = state.expenses.filter((e) => e.groupId === group.id);
  const settlements = state.settlements.filter((s) => s.groupId === group.id);
  const net = netBalances(ledger);
  const debts: SimplifiedDebt[] = group.simplifyDebts ? simplifyDebts(ledger) : rawDebts(ledger);

  const totalSpent = new Map<string, number>();
  for (const expense of expenses) {
    for (const split of expense.splits) {
      totalSpent.set(split.personId, (totalSpent.get(split.personId) ?? 0) + split.owes);
    }
  }

  function deleteGroup() {
    if (
      confirm(
        `Delete "${group!.name}"? This removes the group and all ${expenses.length} of its expenses.`,
      )
    ) {
      dispatch({ type: "deleteGroup", groupId: group!.id });
      navigate("/");
    }
  }

  function toggleClosed() {
    if (!group) return;
    if (group.status === "closed") {
      const reason = window.prompt("Why are you reopening this trip?");
      if (!reason?.trim()) return;
      dispatch({ type: "setTripStatus", groupId: group.id, status: "open", reason: reason.trim() });
      return;
    }
    const canClose = window.confirm(group.type === "trip"
      ? "Close this trip after confirming repayments are settled. If its reconciliation still has open items, you will be asked to resolve or explicitly skip them."
      : "Close this group? Its ledger will become read-only.");
    if (!canClose) return;
    dispatch({ type: "setTripStatus", groupId: group.id, status: "closed", allowUnreconciled: false });
  }

  return (
    <>
      <main className="pane">
        <div className="pane-header">
          <h1>
            <span className="group-page-title"><GroupBadge type={group.type} name={group.name} size={44} /> {group.name}</span>
            <span className="sub">{group.memberIds.length} members</span>
          </h1>
          <button className="btn btn-primary" disabled={group.status === "closed"} onClick={() => setAddingExpense(true)}>
            Add expense
          </button>
          <button className="btn btn-primary" disabled={group.status === "closed"} onClick={() => setSettlingBlank(true)}>
            Settle
          </button>
        </div>
        <div className="group-tabs" role="tablist" aria-label="Group sections">
          {(["overview", "expenses", "discussion"] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        {activeTab === "overview" && (
          <section className="group-overview" aria-label="Group overview">
            <div className="overview-totals">
              <div><span>Total spend</span><strong>{formatMoney(expenses.reduce((sum, expense) => sum + expense.amount, 0))}</strong></div>
              <div><span>Your spend</span><strong>{formatMoney(totalSpent.get(currentPersonId) ?? 0)}</strong></div>
              <div><span>Settlement progress</span><strong>{debts.length === 0 ? "Settled" : `${debts.length} remaining`}</strong></div>
            </div>
            {(group.startDate || group.endDate) && <p className="group-dates">{group.startDate ?? "Start date open"} to {group.endDate ?? "End date open"}</p>}
            <div className="member-summary">
              <h2>Members</h2>
              {group.memberIds.map((id) => <span key={id}><Avatar person={peopleById.get(id)} size={28} />{id === currentPersonId ? "You" : peopleById.get(id)?.name}</span>)}
            </div>
          </section>
        )}
        {activeTab === "expenses" && (
          <ExpenseList expenses={expenses} settlements={settlements} emptyMessage="No expenses yet." readOnly={group.status === "closed"} />
        )}
        {activeTab === "discussion" && (
          <SocialThread groupId={group.id} scope="group" scopeId={group.id} readOnly={group.status === "closed"} />
        )}
        {group.status === "closed" && <div className="lifecycle-banner">This group is closed. Its ledger is preserved for reference; reopen it from Group settings to make changes.</div>}
      </main>

      <aside className="rail">
        <div className="rail-card">
          <h2>Group balances</h2>
          {group.memberIds.map((id) => {
            const person = peopleById.get(id);
            const bal = net.get(id) ?? 0;
            return (
              <div key={id} className="debt-line">
                <Avatar person={person} size={22} />
                <span className="who">{person?.id === currentPersonId ? "You" : person?.name}</span>
                <span className={bal > 0 ? "pos" : bal < 0 ? "neg" : "zero"}>
                  {bal === 0 ? "settled" : (bal > 0 ? "+" : "-") + formatMoney(Math.abs(bal))}
                </span>
              </div>
            );
          })}
        </div>

        <div className="rail-card">
          <h2>Total spent</h2>
          {group.memberIds.map((id) => {
            const person = peopleById.get(id);
            const spent = totalSpent.get(id) ?? 0;
            return (
              <div key={id} className="debt-line">
                <Avatar person={person} size={22} />
                <span className="who">{person?.id === currentPersonId ? "You" : person?.name}</span>
                <span>{formatMoney(spent)}</span>
              </div>
            );
          })}
        </div>

        <div className="rail-card">
          <h2>{group.simplifyDebts ? "Suggested repayments" : "Who owes whom"}</h2>
          {debts.length === 0 && <div className="all-settled">Settled</div>}
          {debts.map((d, i) => {
            const from = peopleById.get(d.fromId);
            const to = peopleById.get(d.toId);
            return (
              <div key={i} className="debt-line">
                <span className="who">
                  <strong>{from?.id === currentPersonId ? "You" : from?.name}</strong> →{" "}
                  <strong>{to?.id === currentPersonId ? "you" : to?.name}</strong>
                </span>
                <span className="neg">{formatMoney(d.amount)}</span>
                <button
                  className="btn-link-success"
                  title="Record this payment"
                  onClick={() => setSettling({ fromId: d.fromId, toId: d.toId, amount: d.amount })}
                >
                  ✓
                </button>
              </div>
            );
          })}
        </div>

        {session.capabilities.manageAllGroups && <div className="rail-card">
          <h2>Group settings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <button className="btn btn-secondary" disabled={group.status === "closed"} onClick={() => setEditingGroup(true)}>
              Edit group
            </button>
            <button className="btn btn-secondary" onClick={toggleClosed}>
              {group.status === "closed" ? "Reopen trip" : "Close trip"}
            </button>
            <button className="btn-link-danger" onClick={deleteGroup}>
              Delete group
            </button>
          </div>
        </div>}
      </aside>

      {addingExpense && (
        <AddExpenseModal groupId={group.id} onClose={() => setAddingExpense(false)} />
      )}
      {settlingBlank && (
        <SettleUpModal groupId={group.id} onClose={() => setSettlingBlank(false)} />
      )}
      {settling && (
        <SettleUpModal groupId={group.id} prefill={settling} onClose={() => setSettling(null)} />
      )}
      {editingGroup && <GroupModal group={group} onClose={() => setEditingGroup(false)} />}
    </>
  );
}
