import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ME, useStore } from "../store";
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
import { GroupModal, GROUP_ICONS } from "../components/GroupModal";

export function GroupPage() {
  const { groupId } = useParams();
  const { state, dispatch, peopleById } = useStore();
  const navigate = useNavigate();
  const [addingExpense, setAddingExpense] = useState(false);
  const [settling, setSettling] = useState<null | { fromId: string; toId: string; amount: number }>(null);
  const [settlingBlank, setSettlingBlank] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);

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

  return (
    <>
      <main className="pane">
        <div className="pane-header">
          <h1>
            {GROUP_ICONS[group.type]} {group.name}
            <span className="sub">{group.memberIds.length} people</span>
          </h1>
          <button className="btn btn-orange" onClick={() => setAddingExpense(true)}>
            Add an expense
          </button>
          <button className="btn btn-teal" onClick={() => setSettlingBlank(true)}>
            Settle up
          </button>
        </div>

        <ExpenseList
          expenses={expenses}
          settlements={settlements}
          emptyMessage="No expenses in this group yet. Add one to get started!"
        />
      </main>

      <aside className="rail">
        <div className="rail-card">
          <h3>Group balances</h3>
          {group.memberIds.map((id) => {
            const person = peopleById.get(id);
            const bal = net.get(id) ?? 0;
            return (
              <div key={id} className="debt-line">
                <Avatar person={person} size={22} />
                <span className="who">{person?.id === ME ? "You" : person?.name}</span>
                <span className={bal > 0 ? "pos" : bal < 0 ? "neg" : "zero"}>
                  {bal === 0 ? "settled" : (bal > 0 ? "+" : "-") + formatMoney(Math.abs(bal))}
                </span>
              </div>
            );
          })}
        </div>

        <div className="rail-card">
          <h3>{group.simplifyDebts ? "Suggested repayments" : "Who owes whom"}</h3>
          {debts.length === 0 && <div className="all-settled">All settled up! 🎉</div>}
          {debts.map((d, i) => {
            const from = peopleById.get(d.fromId);
            const to = peopleById.get(d.toId);
            return (
              <div key={i} className="debt-line">
                <span className="who">
                  <strong>{from?.id === ME ? "You" : from?.name}</strong> →{" "}
                  <strong>{to?.id === ME ? "you" : to?.name}</strong>
                </span>
                <span className="neg">{formatMoney(d.amount)}</span>
                <button
                  className="btn-danger-link"
                  style={{ color: "var(--teal-dark)" }}
                  title="Record this payment"
                  onClick={() => setSettling({ fromId: d.fromId, toId: d.toId, amount: d.amount })}
                >
                  ✓
                </button>
              </div>
            );
          })}
        </div>

        <div className="rail-card">
          <h3>Group settings</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <button className="btn btn-plain" onClick={() => setEditingGroup(true)}>
              Edit group
            </button>
            <button className="btn-danger-link" onClick={deleteGroup}>
              Delete group
            </button>
          </div>
        </div>
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
