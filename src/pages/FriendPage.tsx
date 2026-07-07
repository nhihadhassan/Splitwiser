import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ME, useStore } from "../store";
import { buildLedger, pairBalance } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "../components/Avatar";
import { ExpenseList } from "../components/ExpenseList";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";

export function FriendPage() {
  const { friendId } = useParams();
  const { state, peopleById } = useStore();
  const [addingExpense, setAddingExpense] = useState(false);
  const [settling, setSettling] = useState(false);

  const friend = friendId ? peopleById.get(friendId) : undefined;

  const balance = useMemo(() => {
    if (!friend) return 0;
    const ledger = buildLedger(state);
    // positive = friend owes me
    return -pairBalance(ledger, ME, friend.id);
  }, [state, friend]);

  if (!friend || friend.id === ME) return <Navigate to="/" replace />;

  const expenses = state.expenses.filter(
    (e) =>
      e.splits.some((s) => s.personId === ME) &&
      e.splits.some((s) => s.personId === friend.id),
  );
  const settlements = state.settlements.filter(
    (s) =>
      (s.fromId === ME && s.toId === friend.id) || (s.fromId === friend.id && s.toId === ME),
  );

  const sharedGroups = state.groups.filter(
    (g) => g.memberIds.includes(ME) && g.memberIds.includes(friend.id),
  );

  return (
    <>
      <main className="pane">
        <div className="pane-header">
          <h1>
            <Avatar person={friend} size={34} /> {friend.name}
          </h1>
          <button className="btn btn-orange" onClick={() => setAddingExpense(true)}>
            Add an expense
          </button>
          <button className="btn btn-teal" onClick={() => setSettling(true)}>
            Settle up
          </button>
        </div>

        <div className="balance-strip" style={{ gridTemplateColumns: "1fr" }}>
          <div className="cell">
            <div className="label">Balance</div>
            <div className={`value ${balance > 0 ? "pos" : balance < 0 ? "neg" : "zero"}`}>
              {balance === 0
                ? "You are all settled up"
                : balance > 0
                  ? `${friend.name} owes you ${formatMoney(balance)}`
                  : `You owe ${friend.name} ${formatMoney(-balance)}`}
            </div>
          </div>
        </div>

        <ExpenseList
          expenses={expenses}
          settlements={settlements}
          emptyMessage={`No shared expenses with ${friend.name} yet.`}
        />
      </main>

      <aside className="rail">
        <div className="rail-card">
          <h3>About</h3>
          <div style={{ fontSize: 13, color: "#666", lineHeight: 1.7 }}>
            {friend.email && <div>✉️ {friend.email}</div>}
            <div>
              👥 {sharedGroups.length === 0 ? "No shared groups" : "Groups together:"}
            </div>
            {sharedGroups.map((g) => (
              <div key={g.id} style={{ paddingLeft: 18 }}>
                {g.name}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {addingExpense && (
        <AddExpenseModal friendId={friend.id} onClose={() => setAddingExpense(false)} />
      )}
      {settling && (
        <SettleUpModal
          prefill={
            balance < 0
              ? { fromId: ME, toId: friend.id, amount: -balance }
              : { fromId: friend.id, toId: ME, amount: balance }
          }
          onClose={() => setSettling(false)}
        />
      )}
    </>
  );
}
