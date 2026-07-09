import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ME, useStore } from "../store";
import { buildLedger, netBalances } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "../components/Avatar";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { GroupModal, GROUP_ICONS } from "../components/GroupModal";

export function GroupsPage() {
  const { state, peopleById } = useStore();
  const [addingGroup, setAddingGroup] = useState(false);
  const [addingExpenseFor, setAddingExpenseFor] = useState<string | null>(null);

  const groups = useMemo(
    () =>
      state.groups.map((group) => {
        const expenses = state.expenses.filter((expense) => expense.groupId === group.id);
        const ledger = buildLedger(state, { groupId: group.id });
        const net = netBalances(ledger);
        const myBalance = net.get(ME) ?? 0;
        const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        const lastActivity = Math.max(
          group.createdAt,
          ...expenses.map((expense) => expense.createdAt),
          ...state.settlements
            .filter((settlement) => settlement.groupId === group.id)
            .map((settlement) => settlement.createdAt),
        );
        return { group, expenses, myBalance, total, lastActivity };
      }),
    [state],
  );

  return (
    <>
      <main className="pane pane-wide">
        <div className="pane-header hero-header">
          <div>
            <p className="eyebrow">Private Ledgers</p>
            <h1>Active Groups</h1>
          </div>
          <button className="btn btn-gold" onClick={() => setAddingGroup(true)}>
            New Group
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="empty-state">
            <div className="big">G</div>
            <div>Create a group to start tracking shared expenses.</div>
          </div>
        ) : (
          <div className="group-grid">
            {groups.map(({ group, expenses, myBalance, total, lastActivity }) => (
              <article key={group.id} className="ledger-card">
                <div className="ledger-card-top">
                  <span className="ledger-icon">{GROUP_ICONS[group.type]}</span>
                  <span className={`status-chip ${myBalance === 0 ? "settled" : "owed"}`}>
                    {myBalance === 0 ? "Settled" : myBalance > 0 ? "Owed" : "Payable"}
                  </span>
                </div>
                <h2>{group.name}</h2>
                <p>
                  {group.memberIds.length} members, {expenses.length} entries
                </p>
                <div className="ledger-stats">
                  <div>
                    <span>Total volume</span>
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
                  <Link className="btn btn-plain" to={`/groups/${group.id}`}>
                    Open Ledger
                  </Link>
                  <button className="btn btn-gold" onClick={() => setAddingExpenseFor(group.id)}>
                    Add Expense
                  </button>
                </div>
                <p className="card-footnote">
                  Last updated {new Date(lastActivity).toLocaleDateString()}
                </p>
              </article>
            ))}
          </div>
        )}
      </main>
      <aside className="rail">
        <div className="rail-card">
          <h3>Group Command</h3>
          <p className="muted-copy">
            Groups gather expenses, member balances, repayment suggestions, and settlement history
            into one ledger.
          </p>
        </div>
      </aside>

      {addingGroup && <GroupModal onClose={() => setAddingGroup(false)} />}
      {addingExpenseFor && (
        <AddExpenseModal groupId={addingExpenseFor} onClose={() => setAddingExpenseFor(null)} />
      )}
    </>
  );
}
