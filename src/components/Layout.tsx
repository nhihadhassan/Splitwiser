import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ME, useStore } from "../store";
import { balancesWith, buildLedger } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "./Avatar";
import { AddExpenseModal } from "./AddExpenseModal";
import { AddFriendModal } from "./AddFriendModal";
import { GroupModal } from "./GroupModal";
import { BrandMark, GroupBadge, NavIcon } from "./Icons";

export function Layout() {
  const { state, peopleById } = useStore();
  const [addingFriend, setAddingFriend] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);

  const friendBalances = useMemo(() => {
    const ledger = buildLedger(state);
    return balancesWith(ledger, ME);
  }, [state]);

  const me = peopleById.get(ME);

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">
          <BrandMark /> SPLITWISER
        </NavLink>
        <div className="spacer" />
        <button
          className="btn btn-secondary top-action"
          onClick={() => setAddingExpense(true)}
          aria-label="Add expense"
        >
          <span className="top-action-icon" aria-hidden="true">+</span>
          <span className="top-action-label">Add Expense</span>
        </button>
        <div className="user">
          <Avatar person={me} size={26} />
          <span>{me?.name}</span>
        </div>
      </header>

      <div className="layout">
        <nav className="nav">
          <NavLink to="/" className="side-brand">
            <BrandMark /> SPLITWISER
          </NavLink>
          <NavLink to="/" end className="nav-link">
            <NavIcon type="overview" /> Overview
          </NavLink>
          <NavLink to="/groups" end className="nav-link">
            <NavIcon type="groups" /> Groups
          </NavLink>
          <NavLink to="/activity" className="nav-link">
            <NavIcon type="activity" /> Recent Activity
          </NavLink>
          <NavLink to="/all" className="nav-link">
            <NavIcon type="expenses" /> All Expenses
          </NavLink>
          <NavLink to="/settlements" className="nav-link">
            <NavIcon type="settlements" /> Settlements
          </NavLink>
          <NavLink to="/reconciliation" className="nav-link">
            <NavIcon type="reconciliation" /> Reconcile Trips
          </NavLink>

          <div className="nav-section">
            <span>Groups</span>
            <button onClick={() => setAddingGroup(true)}>+ add</button>
          </div>
          {state.groups.length === 0 && <div className="nav-empty">No groups yet</div>}
          {state.groups.map((g) => (
            <NavLink key={g.id} to={`/groups/${g.id}`} className="nav-sub">
              <GroupBadge type={g.type} name={g.name} size={28} /> {g.name}
            </NavLink>
          ))}

          <div className="nav-section">
            <span>Friends</span>
            <button onClick={() => setAddingFriend(true)}>+ add</button>
          </div>
          {state.people.filter((p) => p.id !== ME).length === 0 && (
            <div className="nav-empty">No friends yet</div>
          )}
          {state.people
            .filter((p) => p.id !== ME)
            .map((p) => {
              const bal = friendBalances.get(p.id) ?? 0;
              return (
                <NavLink key={p.id} to={`/friends/${p.id}`} className="nav-sub">
                  <Avatar person={p} size={18} /> {p.name}
                  {bal !== 0 && (
                    <span className={`amount ${bal > 0 ? "pos" : "neg"}`}>
                      {formatMoney(Math.abs(bal))}
                    </span>
                  )}
                </NavLink>
              );
            })}
        </nav>

        <Outlet />
      </div>

      <nav className="mobile-nav" aria-label="Primary navigation">
        <NavLink to="/" end>
          <span><NavIcon type="overview" /></span>
          Overview
        </NavLink>
        <NavLink to="/groups">
          <span><NavIcon type="groups" /></span>
          Groups
        </NavLink>
        <NavLink to="/activity">
          <span><NavIcon type="activity" /></span>
          Activity
        </NavLink>
        <NavLink to="/all">
          <span><NavIcon type="expenses" /></span>
          Expenses
        </NavLink>
        <NavLink to="/settlements">
          <span><NavIcon type="settlements" /></span>
          Settle
        </NavLink>
        <NavLink to="/reconciliation">
          <span><NavIcon type="reconciliation" /></span>
          Trips
        </NavLink>
      </nav>

      {addingFriend && <AddFriendModal onClose={() => setAddingFriend(false)} />}
      {addingGroup && <GroupModal onClose={() => setAddingGroup(false)} />}
      {addingExpense && <AddExpenseModal onClose={() => setAddingExpense(false)} />}
    </>
  );
}
