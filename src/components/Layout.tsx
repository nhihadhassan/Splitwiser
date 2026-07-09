import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ME, useStore } from "../store";
import { balancesWith, buildLedger } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "./Avatar";
import { AddExpenseModal } from "./AddExpenseModal";
import { AddFriendModal } from "./AddFriendModal";
import { GroupModal, GROUP_ICONS } from "./GroupModal";

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
          <span className="logo">A</span> AUREUM
        </NavLink>
        <div className="spacer" />
        <button className="btn btn-plain top-action" onClick={() => setAddingExpense(true)}>
          Add Expense
        </button>
        <div className="user">
          <Avatar person={me} size={26} />
          <span>{me?.name}</span>
        </div>
      </header>

      <div className="layout">
        <nav className="nav">
          <NavLink to="/" end className="nav-link">
            <span className="nav-mark">OV</span> Overview
          </NavLink>
          <NavLink to="/groups" end className="nav-link">
            <span className="nav-mark">LG</span> Groups
          </NavLink>
          <NavLink to="/activity" className="nav-link">
            <span className="nav-mark">AC</span> Recent Activity
          </NavLink>
          <NavLink to="/all" className="nav-link">
            <span className="nav-mark">EX</span> All Expenses
          </NavLink>
          <NavLink to="/settlements" className="nav-link">
            <span className="nav-mark">ST</span> Settlements
          </NavLink>

          <div className="nav-section">
            <span>Groups</span>
            <button onClick={() => setAddingGroup(true)}>+ add</button>
          </div>
          {state.groups.length === 0 && <div className="nav-empty">No groups yet</div>}
          {state.groups.map((g) => (
            <NavLink key={g.id} to={`/groups/${g.id}`} className="nav-sub">
              {GROUP_ICONS[g.type]} {g.name}
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

      <nav className="mobile-nav">
        <NavLink to="/" end>
          <span>OV</span>
          Overview
        </NavLink>
        <NavLink to="/activity">
          <span>AC</span>
          Activity
        </NavLink>
        <button type="button" onClick={() => setAddingExpense(true)} aria-label="Add expense">
          +
        </button>
        <NavLink to="/groups">
          <span>LG</span>
          Groups
        </NavLink>
        <NavLink to="/settlements">
          <span>ST</span>
          Settle
        </NavLink>
      </nav>

      {addingFriend && <AddFriendModal onClose={() => setAddingFriend(false)} />}
      {addingGroup && <GroupModal onClose={() => setAddingGroup(false)} />}
      {addingExpense && <AddExpenseModal onClose={() => setAddingExpense(false)} />}
    </>
  );
}
