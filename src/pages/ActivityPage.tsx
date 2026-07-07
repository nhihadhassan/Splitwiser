import { useMemo } from "react";
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

  const items = useMemo<ActivityItem[]>(() => {
    const list: ActivityItem[] = [];
    for (const e of state.expenses) {
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
  }, [state, peopleById]);

  return (
    <>
      <main className="pane">
        <div className="pane-header">
          <h1>Recent activity</h1>
        </div>
        {items.length === 0 && (
          <div className="empty-state">
            <div className="big">🔔</div>
            <div>Nothing here yet. Add an expense to see activity.</div>
          </div>
        )}
        {items.map((item) => (
          <div key={item.key} className="activity-row">
            <Avatar person={peopleById.get(item.actorId)} size={34} />
            <div className="text">
              <div>{item.text}</div>
              <div className="when">{relativeTime(item.createdAt)}</div>
            </div>
          </div>
        ))}
      </main>
      <aside className="rail" />
    </>
  );
}
