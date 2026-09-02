import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "../store";
import { buildLedger, pairBalance } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "../components/Avatar";
import { ExpenseList } from "../components/ExpenseList";
import { DeferredAddExpenseModal, preloadAddExpenseModal } from "../components/DeferredAddExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";
import { NotFoundPage } from "./NotFoundPage";

export function FriendPage() {
  const { friendId } = useParams();
  const { state, peopleById, currentPersonId } = useStore();
  const [addingExpense, setAddingExpense] = useState(false);
  const [settling, setSettling] = useState(false);

  const friend = friendId ? peopleById.get(friendId) : undefined;

  const balance = useMemo(() => {
    if (!friend) return 0;
    const ledger = buildLedger(state);
    // positive = friend owes me
    return -pairBalance(ledger, currentPersonId, friend.id);
  }, [currentPersonId, state, friend]);

  if (!friend || friend.id === currentPersonId) return <NotFoundPage />;

  const expenses = state.expenses.filter(
    (e) =>
      e.splits.some((s) => s.personId === currentPersonId) &&
      e.splits.some((s) => s.personId === friend.id),
  );
  const settlements = state.settlements.filter(
    (s) =>
      (s.fromId === currentPersonId && s.toId === friend.id) || (s.fromId === friend.id && s.toId === currentPersonId),
  );

  const sharedGroups = state.groups.filter(
    (g) => g.memberIds.includes(currentPersonId) && g.memberIds.includes(friend.id),
  );

  return (
    <>
      <main className="pane">
        <div className="pane-header">
          <h1>
            <Avatar person={friend} size={34} /> {friend.name}
          </h1>
          <button
            className="btn btn-primary"
            type="button"
            onPointerEnter={preloadAddExpenseModal}
            onFocus={preloadAddExpenseModal}
            onPointerDown={preloadAddExpenseModal}
            onClick={() => setAddingExpense(true)}
          >
            Add expense
          </button>
          <button className="btn btn-primary" onClick={() => setSettling(true)}>
            Settle
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
          <h2>About</h2>
          <div className="friend-about-copy">
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
        <DeferredAddExpenseModal friendId={friend.id} onClose={() => setAddingExpense(false)} />
      )}
      {settling && (
        <SettleUpModal
          prefill={
            balance < 0
              ? { fromId: currentPersonId, toId: friend.id, amount: -balance }
              : { fromId: friend.id, toId: currentPersonId, amount: balance }
          }
          onClose={() => setSettling(false)}
        />
      )}
    </>
  );
}
