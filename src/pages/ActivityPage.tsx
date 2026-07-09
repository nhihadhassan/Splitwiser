import { useMemo, useState } from "react";
import { ME, useStore } from "../store";
import { formatMoney } from "../utils/money";
import { relativeTime } from "../utils/dates";
import { Avatar } from "../components/Avatar";
import { CATEGORY_META } from "../utils/categories";

interface ActivityItem {
  key: string;
  actorId: string;
  text: JSX.Element;
  createdAt: number;
}

export function ActivityPage() {
  const { state, peopleById } = useStore();
  const [groupFilter, setGroupFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | "expenses" | "payments">("all");

  const items = useMemo<ActivityItem[]>(() => {
    const list: ActivityItem[] = [];
    for (const e of state.expenses) {
      if (kindFilter === "payments") continue;
      if (groupFilter !== "all" && (e.groupId ?? "none") !== groupFilter) continue;
      const actor = peopleById.get(e.createdBy);
      const groupName = e.groupId ? state.groups.find((g) => g.id === e.groupId)?.name : null;
      const mySplit = e.splits.find((s) => s.personId === ME);
      const myNet = mySplit ? mySplit.paid - mySplit.owes : 0;
      list.push({
        key: `e-${e.id}`,
        actorId: e.createdBy,
        createdAt: e.createdAt,
        text: (
          <>
            <strong>{actor?.id === ME ? "You" : actor?.name}</strong> added{" "}
            <strong>
              {CATEGORY_META[e.category].icon} “{e.description}”
            </strong>{" "}
            ({formatMoney(e.amount)}){groupName ? <> in <strong>{groupName}</strong></> : null}
            {mySplit && myNet !== 0 && (
              <span className={myNet > 0 ? "pos" : "neg"}>
                {" "}
                — {myNet > 0 ? "you get back" : "you owe"} {formatMoney(Math.abs(myNet))}
              </span>
            )}
          </>
        ),
      });
    }
    for (const s of state.settlements) {
      if (kindFilter === "expenses") continue;
      if (groupFilter !== "all" && (s.groupId ?? "none") !== groupFilter) continue;
      const from = peopleById.get(s.fromId);
      const to = peopleById.get(s.toId);
      const groupName = s.groupId ? state.groups.find((g) => g.id === s.groupId)?.name : null;
      list.push({
        key: `s-${s.id}`,
        actorId: s.fromId,
        createdAt: s.createdAt,
        text: (
          <>
            <strong>{from?.id === ME ? "You" : from?.name}</strong> paid{" "}
            <strong>{to?.id === ME ? "you" : to?.name}</strong> {formatMoney(s.amount)}
            {groupName ? <> in <strong>{groupName}</strong></> : null}
          </>
        ),
      });
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [state, peopleById, groupFilter, kindFilter]);

  return (
    <>
      <main className="pane pane-wide">
        <div className="pane-header hero-header">
          <div>
            <p className="eyebrow">Audit Trail</p>
            <h1>Detailed Activity</h1>
          </div>
        </div>
        <div className="filter-bar">
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}>
            <option value="all">All Activity</option>
            <option value="expenses">Expenses</option>
            <option value="payments">Payments</option>
          </select>
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
            <option value="all">All Groups</option>
            <option value="none">Non-group</option>
            {state.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
        {items.length === 0 && (
          <div className="empty-state">
            <div className="big">A</div>
            <div>No activity matches these filters.</div>
          </div>
        )}
        <div className="activity-timeline">
          {items.map((item) => (
            <div key={item.key} className="activity-row">
              <Avatar person={peopleById.get(item.actorId)} size={38} />
              <div className="text">
                <div>{item.text}</div>
                <div className="when">{relativeTime(item.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </main>
      <aside className="rail">
        <div className="rail-card">
          <h3>Visible Records</h3>
          <strong className="rail-number">{items.length}</strong>
          <p className="muted-copy">Expenses and settlements shown in reverse chronological order.</p>
        </div>
      </aside>
    </>
  );
}
