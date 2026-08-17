import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { buildLedger, netBalances } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "../components/Avatar";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { GroupModal } from "../components/GroupModal";
import { GroupBadge } from "../components/Icons";

export function GroupsPage() {
  const { state, peopleById, currentPersonId, session } = useStore();
  const [addingGroup, setAddingGroup] = useState(false);
  const [addingExpenseFor, setAddingExpenseFor] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const groups = useMemo(
    () =>
      state.groups.filter((group) => showClosed ? group.status === "closed" : group.status !== "closed").map((group) => {
        const expenses = state.expenses.filter((expense) => expense.groupId === group.id);
        const ledger = buildLedger(state, { groupId: group.id });
        const net = netBalances(ledger);
        const myBalance = net.get(currentPersonId) ?? 0;
        const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        return { group, expenses, myBalance, total };
      }),
    [currentPersonId, state, showClosed],
  );

  return (
    <>
      <main className="pane pane-wide">
        <div className="pane-header hero-header">
          <h1>Groups</h1>
          <div className="pane-actions">
            <button className="btn btn-secondary" onClick={() => setShowClosed(!showClosed)}>
              {showClosed ? "Show open groups" : `Closed groups (${state.groups.filter((group) => group.status === "closed").length})`}
            </button>
            {session.capabilities.manageAllGroups && <button className="btn btn-primary" onClick={() => setAddingGroup(true)}>New group</button>}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="empty-state">
            <div className="big">G</div>
            <div>Create a group to start tracking shared expenses.</div>
          </div>
        ) : (
          <div className="group-grid">
            {groups.map(({ group, expenses, myBalance, total }) => (
              <article key={group.id} className="ledger-card">
                <div className="ledger-card-top">
                  <span className="ledger-icon"><GroupBadge type={group.type} name={group.name} /></span>
                  <span className={`status-chip ${myBalance === 0 ? "settled" : "owed"}`}>
                    {myBalance === 0 ? "Settled" : myBalance > 0 ? "Owed" : "Payable"}
                  </span>
                </div>
                <h2>{group.name}</h2>
                <p>{group.memberIds.length} members, {expenses.length} entries</p>
                {group.status === "closed" && <span className="lifecycle-note">Closed {group.closedAt ? new Date(group.closedAt).toLocaleDateString() : ""} · read-only</span>}
                <div className="ledger-stats">
                  <div>
                    <span>Total</span>
                    <strong>{formatMoney(total)}</strong>
                  </div>
                  <div>
                    <span>Your balance</span>
                    <strong className={myBalance > 0 ? "pos" : myBalance < 0 ? "neg" : "zero"}>
                      {myBalance === 0
                        ? "$0.00"
                        : `${myBalance > 0 ? "+" : "-"}${formatMoney(Math.abs(myBalance))}`}
                    </strong>
                  </div>
                </div>
                <div className="member-stack">
                  {group.memberIds.slice(0, 5).map((id) => (
                    <Avatar key={id} person={peopleById.get(id)} size={28} />
                  ))}
                  {group.memberIds.length > 5 && <span>+{group.memberIds.length - 5}</span>}
                </div>
                <div className="ledger-actions">
                  <Link className="btn btn-secondary" to={`/groups/${group.id}`}>
                    Open
                  </Link>
                  <button className="btn btn-primary" disabled={group.status === "closed"} onClick={() => setAddingExpenseFor(group.id)}>
                    Add expense
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      {addingGroup && <GroupModal onClose={() => setAddingGroup(false)} />}
      {addingExpenseFor && (
        <AddExpenseModal groupId={addingExpenseFor} onClose={() => setAddingExpenseFor(null)} />
      )}
    </>
  );
}
