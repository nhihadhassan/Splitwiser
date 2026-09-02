import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { DeferredAddExpenseModal, preloadAddExpenseModal } from "../components/DeferredAddExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";
import { GroupModal } from "../components/GroupModal";
import { GroupBadge } from "../components/Icons";
import { SocialThread } from "../components/SocialThread";
import { ConfirmDialog, TextPromptDialog } from "../components/Dialog";
import { NotFoundPage } from "./NotFoundPage";

type LifecycleDialog =
  | { type: "delete" | "close" | "reopen" }
  | { type: "close-unreconciled"; message: string }
  | null;

const GROUP_TABS = ["overview", "expenses", "discussion"] as const;
type GroupTab = (typeof GROUP_TABS)[number];

export function GroupPage() {
  const { groupId } = useParams();
  const { state, dispatch, peopleById, currentPersonId, session } = useStore();
  const navigate = useNavigate();
  const [addingExpense, setAddingExpense] = useState(false);
  const [settling, setSettling] = useState<null | { fromId: string; toId: string; amount: number }>(null);
  const [settlingBlank, setSettlingBlank] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [activeTab, setActiveTab] = useState<GroupTab>("overview");
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleDialog, setLifecycleDialog] = useState<LifecycleDialog>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabsId = useId();

  const group = state.groups.find((g) => g.id === groupId);

  const ledger = useMemo(
    () => (group ? buildLedger(state, { groupId: group.id }) : new Map()),
    [state, group],
  );

  if (!group) return <NotFoundPage />;

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
    dispatch({ type: "deleteGroup", groupId: group!.id });
    navigate("/");
  }

  function toggleClosed() {
    if (!group) return;
    setLifecycleDialog({ type: group.status === "closed" ? "reopen" : "close" });
  }

  function closeGroup(allowUnreconciled: boolean) {
    try {
      dispatch({ type: "setTripStatus", groupId: group!.id, status: "closed", allowUnreconciled });
      setLifecycleError("");
      setLifecycleDialog(null);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : allowUnreconciled
          ? "This trip could not be closed."
          : "This group could not be closed.";
      if (!allowUnreconciled && /resolve reconciliation/i.test(message)) {
        setLifecycleDialog({ type: "close-unreconciled", message });
        return;
      }
      setLifecycleError(message);
      setLifecycleDialog(null);
    }
  }

  function reopenGroup(reason: string) {
    try {
      dispatch({ type: "setTripStatus", groupId: group!.id, status: "open", reason });
      setLifecycleError("");
      setLifecycleDialog(null);
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "This group could not be reopened.");
      setLifecycleDialog(null);
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % GROUP_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + GROUP_TABS.length) % GROUP_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = GROUP_TABS.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    setActiveTab(GROUP_TABS[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <>
      <main className="pane">
        <div className="pane-header">
          <h1>
            <span className="group-page-title"><GroupBadge type={group.type} name={group.name} icon={group.icon} size={44} /> {group.name}</span>
            <span className="sub">{group.memberIds.length} members</span>
          </h1>
          <button
            className="btn btn-primary"
            type="button"
            disabled={group.status === "closed"}
            onPointerEnter={preloadAddExpenseModal}
            onFocus={preloadAddExpenseModal}
            onPointerDown={preloadAddExpenseModal}
            onClick={() => setAddingExpense(true)}
          >
            Add expense
          </button>
          <button className="btn btn-primary" disabled={group.status === "closed"} onClick={() => setSettlingBlank(true)}>
            Settle
          </button>
        </div>
        <div className="group-tabs" role="tablist" aria-label="Group sections">
          {GROUP_TABS.map((tab, index) => (
            <button
              key={tab}
              ref={(element) => { tabRefs.current[index] = element; }}
              id={`${tabsId}-${tab}-tab`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`${tabsId}-${tab}-panel`}
              tabIndex={activeTab === tab ? 0 : -1}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        {lifecycleError && <div className="form-error lifecycle-error" role="alert">{lifecycleError}</div>}
        <section
          id={`${tabsId}-overview-panel`}
          className="group-overview"
          role="tabpanel"
          aria-labelledby={`${tabsId}-overview-tab`}
          tabIndex={0}
          hidden={activeTab !== "overview"}
        >
          {activeTab === "overview" && <>
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
          </>}
        </section>
        <section
          id={`${tabsId}-expenses-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-expenses-tab`}
          tabIndex={0}
          hidden={activeTab !== "expenses"}
        >
          {activeTab === "expenses" && <ExpenseList expenses={expenses} settlements={settlements} emptyMessage="No expenses yet." readOnly={group.status === "closed"} />}
        </section>
        <section
          id={`${tabsId}-discussion-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-discussion-tab`}
          tabIndex={0}
          hidden={activeTab !== "discussion"}
        >
          {activeTab === "discussion" && <SocialThread groupId={group.id} scope="group" scopeId={group.id} readOnly={group.status === "closed"} />}
        </section>
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
                  type="button"
                  aria-label={`Record payment from ${from?.id === currentPersonId ? "you" : from?.name ?? "member"} to ${to?.id === currentPersonId ? "you" : to?.name ?? "member"}`}
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
              {group.status === "closed"
                ? `Reopen ${group.type === "trip" ? "trip" : "group"}`
                : `Close ${group.type === "trip" ? "trip" : "group"}`}
            </button>
            <button className="btn-link-danger" onClick={() => setLifecycleDialog({ type: "delete" })}>
              Delete group
            </button>
          </div>
        </div>}
      </aside>

      {addingExpense && (
        <DeferredAddExpenseModal groupId={group.id} onClose={() => setAddingExpense(false)} />
      )}
      {settlingBlank && (
        <SettleUpModal groupId={group.id} onClose={() => setSettlingBlank(false)} />
      )}
      {settling && (
        <SettleUpModal groupId={group.id} prefill={settling} onClose={() => setSettling(null)} />
      )}
      {editingGroup && <GroupModal group={group} onClose={() => setEditingGroup(false)} />}
      {lifecycleDialog?.type === "delete" && (
        <ConfirmDialog
          title={`Delete ${group.type === "trip" ? "trip" : "group"}?`}
          description={`Delete "${group.name}" and all ${expenses.length} of its expenses? This cannot be undone.`}
          confirmLabel={`Delete ${group.type === "trip" ? "trip" : "group"}`}
          tone="danger"
          onCancel={() => setLifecycleDialog(null)}
          onConfirm={deleteGroup}
        />
      )}
      {lifecycleDialog?.type === "close" && (
        <ConfirmDialog
          title={`Close this ${group.type === "trip" ? "trip" : "group"}?`}
          description={group.type === "trip"
            ? "Confirm repayments are settled before closing. If reconciliation still has open items, you will be asked before they are locked."
            : "Its ledger will become read-only until the group is reopened."}
          confirmLabel={`Close ${group.type === "trip" ? "trip" : "group"}`}
          onCancel={() => setLifecycleDialog(null)}
          onConfirm={() => closeGroup(false)}
        />
      )}
      {lifecycleDialog?.type === "close-unreconciled" && (
        <ConfirmDialog
          title="Close with unfinished reconciliation?"
          description="This trip still has unfinished reconciliation items. Closing it will lock them until you reopen the trip."
          confirmLabel="Close anyway"
          tone="danger"
          onCancel={() => {
            setLifecycleError(lifecycleDialog.message);
            setLifecycleDialog(null);
          }}
          onConfirm={() => closeGroup(true)}
        />
      )}
      {lifecycleDialog?.type === "reopen" && (
        <TextPromptDialog
          title={`Reopen this ${group.type === "trip" ? "trip" : "group"}`}
          description="Add a reason for the activity history before making the ledger editable again."
          label="Reason for reopening"
          confirmLabel="Reopen"
          onCancel={() => setLifecycleDialog(null)}
          onConfirm={reopenGroup}
        />
      )}
    </>
  );
}
