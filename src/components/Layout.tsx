import { useEffect, useMemo, useState } from "react";
import { UserButton } from "@clerk/react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useStore } from "../store";
import { balancesWith, buildLedger } from "../utils/balances";
import { formatMoney } from "../utils/money";
import { Avatar } from "./Avatar";
import { AddExpenseModal } from "./AddExpenseModal";
import { AddFriendModal } from "./AddFriendModal";
import { CloudStatusBadge } from "./CloudStatusBadge";
import { GroupModal } from "./GroupModal";
import { InvitationModal } from "./InvitationModal";
import { BrandMark, GroupBadge, NavIcon } from "./Icons";
import { loadSocialUnreadSummary } from "../social";

export function Layout() {
  const { state, peopleById, currentPersonId, session, undo, getToken } = useStore();
  const { pathname } = useLocation();
  const [addingFriend, setAddingFriend] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [showingMore, setShowingMore] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!getToken) return;
    let live = true;
    void loadSocialUnreadSummary(getToken).then((summary) => { if (live) setUnread(summary.unreadByGroup); }).catch(() => { if (live) setUnread({}); });
    return () => { live = false; };
  }, [getToken, state.groups]);
  const totalUnread = Object.values(unread).reduce((sum, count) => sum + count, 0);

  const friendBalances = useMemo(() => {
    const ledger = buildLedger(state);
    return balancesWith(ledger, currentPersonId);
  }, [currentPersonId, state]);

  const me = peopleById.get(currentPersonId);
  const showGlobalAddExpense = ["/", "/activity", "/groups", "/reconciliation"].includes(pathname);

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Splitwiser overview">
          <BrandMark /> <span className="brand-name">SPLITWISER</span>
        </NavLink>
        <div className="spacer" />
        {showGlobalAddExpense && (
          <button
            className="btn btn-secondary top-action"
            onClick={() => setAddingExpense(true)}
            aria-label="Add expense"
          >
            <span className="top-action-icon" aria-hidden="true">+</span>
            <span className="top-action-label">Add expense</span>
          </button>
        )}
        <CloudStatusBadge />
        <div className="user">
          <Avatar person={me} size={26} />
          <span className="user-name">{me?.name}</span>
          {session.accountId !== "local-owner" && <UserButton />}
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
            <NavIcon type="activity" /> Activity {totalUnread > 0 && <span className="unread-badge">{totalUnread}</span>}
          </NavLink>
          {session.capabilities.reconcile && (
            <NavLink to="/reconciliation" className="nav-link">
              <NavIcon type="reconciliation" /> Reconcile
            </NavLink>
          )}

          <div className="nav-section">
            <span>Groups</span>
            {session.capabilities.manageAllGroups && <button onClick={() => setAddingGroup(true)}>+ add</button>}
          </div>
          {state.groups.length === 0 && <div className="nav-empty">No groups yet</div>}
          {state.groups.map((g) => (
            <NavLink key={g.id} to={`/groups/${g.id}`} className="nav-sub">
              <GroupBadge type={g.type} name={g.name} size={28} /> {g.name}
              {unread[g.id] > 0 && <span className="unread-badge">{unread[g.id]}</span>}
            </NavLink>
          ))}

          <div className="nav-section">
            <span>Friends</span>
            {session.capabilities.manageAllGroups && <button onClick={() => setAddingFriend(true)}>+ add</button>}
          </div>
          {session.capabilities.manageInvites && (
            <button className="nav-sub nav-invite" type="button" onClick={() => setInviting(true)}>
              <NavIcon type="groups" /> Invite a member
            </button>
          )}
          {state.people.filter((p) => p.id !== currentPersonId).length === 0 && (
            <div className="nav-empty">No friends yet</div>
          )}
          {state.people
            .filter((p) => p.id !== currentPersonId)
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
        <button className="mobile-add" type="button" onClick={() => setAddingExpense(true)} aria-label="Add expense">
          <span aria-hidden="true">+</span>
          Add
        </button>
        <NavLink to="/activity">
          <span><NavIcon type="activity" />{totalUnread > 0 && <b className="unread-badge">{totalUnread}</b>}</span>
          Activity
        </NavLink>
        <button type="button" onClick={() => setShowingMore(true)}>
          <span aria-hidden="true">•••</span>
          More
        </button>
      </nav>

      {showingMore && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowingMore(false)}>
          <section className="mobile-more-sheet" role="dialog" aria-modal="true" aria-labelledby="more-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2 id="more-title">More</h2>
              <button className="icon-btn" type="button" aria-label="Close" onClick={() => setShowingMore(false)}>×</button>
            </div>
            <NavLink to="/activity?type=expense" onClick={() => setShowingMore(false)}><NavIcon type="expenses" /> All expenses</NavLink>
            <NavLink to="/?settle=1" onClick={() => setShowingMore(false)}><NavIcon type="settlements" /> Settlements</NavLink>
            {session.capabilities.manageInvites && <button type="button" onClick={() => { setShowingMore(false); setInviting(true); }}><NavIcon type="groups" /> Invitations</button>}
            {session.capabilities.reconcile && <NavLink to="/reconciliation" onClick={() => setShowingMore(false)}><NavIcon type="reconciliation" /> Advanced reconciliation</NavLink>}
          </section>
        </div>
      )}

      {undo && (
        <div className="undo-toast" role="status">
          <span>{undo.message}</span>
          <button type="button" onClick={undo.run}>Undo</button>
        </div>
      )}

      {addingFriend && <AddFriendModal onClose={() => setAddingFriend(false)} />}
      {addingGroup && <GroupModal onClose={() => setAddingGroup(false)} />}
      {addingExpense && <AddExpenseModal onClose={() => setAddingExpense(false)} />}
      {inviting && <InvitationModal onClose={() => setInviting(false)} />}
    </>
  );
}
