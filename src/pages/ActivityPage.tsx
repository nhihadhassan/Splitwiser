import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { formatMoney } from "../utils/money";
import { dayLabel, monthDay, relativeTime } from "../utils/dates";
import { Avatar } from "../components/Avatar";
import { CategoryIcon } from "../components/Icons";
import { loadSocial } from "../social";
import type { SocialItem } from "../types";

interface ActivityItem {
  key: string;
  actorId: string;
  text: JSX.Element;
  createdAt: number;
  /** ISO date (YYYY-MM-DD) the row is sectioned and charted by. */
  date: string;
}

function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function ActivityPage() {
  const { state, peopleById, currentPersonId, getToken } = useStore();
  const [searchParams] = useSearchParams();
  const [groupFilter, setGroupFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | "expenses" | "payments" | "changes" | "social">(
    searchParams.get("type") === "expense" ? "expenses" : "all",
  );
  const [socialItems, setSocialItems] = useState<SocialItem[]>([]);
  const [socialUnread, setSocialUnread] = useState(0);

  useEffect(() => {
    if (!getToken) return;
    let active = true;
    const refresh = async () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      const results = await Promise.allSettled(state.groups.map((group) => loadSocial(getToken, group.id)));
      if (!active) return;
      setSocialItems(results.flatMap((result) => result.status === "fulfilled" ? result.value.items : []));
      setSocialUnread(results.reduce((sum, result) => sum + (result.status === "fulfilled" ? result.value.unread : 0), 0));
    };
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.removeEventListener("focus", onFocus); };
  }, [getToken, state.groups.map((group) => group.id).join("|")]);

  const items = useMemo<ActivityItem[]>(() => {
    const list: ActivityItem[] = [];
    for (const e of state.expenses) {
      if (kindFilter === "payments" || kindFilter === "changes") continue;
      if (groupFilter !== "all" && (e.groupId ?? "none") !== groupFilter) continue;
      const actor = peopleById.get(e.createdBy);
      const groupName = e.groupId ? state.groups.find((g) => g.id === e.groupId)?.name : null;
      const mySplit = e.splits.find((s) => s.personId === currentPersonId);
      const myNet = mySplit ? mySplit.paid - mySplit.owes : 0;
      list.push({
        key: `e-${e.id}`,
        actorId: e.createdBy,
        createdAt: e.createdAt,
        date: e.date,
        text: (
          <>
            <strong>{actor?.id === currentPersonId ? "You" : actor?.name}</strong> added{" "}
            <strong>
              <CategoryIcon category={e.category} size={16} /> “{e.description}”
            </strong>{" "}
            ({formatMoney(e.amount)}){groupName ? <> in <strong>{groupName}</strong></> : null}
            {mySplit && myNet !== 0 && (
              <span className={myNet > 0 ? "pos" : "neg"}>
                {" "}
                , {myNet > 0 ? "you get back" : "you owe"} {formatMoney(Math.abs(myNet))}
              </span>
            )}
          </>
        ),
      });
    }
    for (const s of state.settlements) {
      if (kindFilter === "expenses" || kindFilter === "changes") continue;
      if (groupFilter !== "all" && (s.groupId ?? "none") !== groupFilter) continue;
      const from = peopleById.get(s.fromId);
      const to = peopleById.get(s.toId);
      const groupName = s.groupId ? state.groups.find((g) => g.id === s.groupId)?.name : null;
      list.push({
        key: `s-${s.id}`,
        actorId: s.fromId,
        createdAt: s.createdAt,
        date: s.date,
        text: (
          <>
            <strong>{from?.id === currentPersonId ? "You" : from?.name}</strong> paid{" "}
            <strong>{to?.id === currentPersonId ? "you" : to?.name}</strong> {formatMoney(s.amount)}
            {groupName ? <> in <strong>{groupName}</strong></> : null}
          </>
        ),
      });
    }
    for (const event of state.financialActivity ?? []) {
      if (event.kind === "expense-created" || event.kind === "settlement-created") continue;
      if (kindFilter === "expenses" || kindFilter === "payments") continue;
      if (groupFilter !== "all" && (event.groupId ?? "none") !== groupFilter) continue;
      const actor = peopleById.get(event.actorPersonId);
      list.push({
        key: event.id,
        actorId: event.actorPersonId,
        createdAt: event.createdAt,
        date: isoDate(event.createdAt),
        text: <><strong>{event.actorPersonId === currentPersonId ? "You" : actor?.name}</strong> {event.summary.toLowerCase()}</>,
      });
    }
    if (kindFilter === "all" || kindFilter === "social") {
      for (const item of socialItems) {
        if (groupFilter !== "all" && item.groupId !== groupFilter) continue;
        const author = peopleById.get(item.authorPersonId);
        const groupName = state.groups.find((group) => group.id === item.groupId)?.name;
        list.push({
          key: `social-${item.id}`,
          actorId: item.authorPersonId,
          createdAt: item.updatedAt ?? item.createdAt,
          date: isoDate(item.updatedAt ?? item.createdAt),
          text: <><strong>{item.authorPersonId === currentPersonId ? "You" : author?.name}</strong> {item.deletedAt ? "deleted a message" : item.scope === "expense" ? "commented on an expense" : "posted in discussion"}{groupName ? <> in <strong>{groupName}</strong></> : null}</>,
        });
        for (const reaction of item.reactions) {
          for (const personId of reaction.personIds) list.push({
            key: `reaction-${item.id}-${reaction.emoji}-${personId}`,
            actorId: personId,
            createdAt: item.updatedAt ?? item.createdAt,
            date: isoDate(item.updatedAt ?? item.createdAt),
            text: <><strong>{personId === currentPersonId ? "You" : peopleById.get(personId)?.name}</strong> reacted {reaction.emoji} to a message{groupName ? <> in <strong>{groupName}</strong></> : null}</>,
          });
        }
      }
    }
    list.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
    return list;
  }, [currentPersonId, state, peopleById, groupFilter, kindFilter, socialItems]);

  return (
    <>
      <main className="pane pane-wide">
        <div className="pane-header hero-header">
          <h1>Activity{socialUnread ? <span className="unread-count">{socialUnread} unread</span> : null}</h1>
        </div>
        <div className="filter-bar">
          <label className="sr-only" htmlFor="activity-type-filter">Filter by activity type</label>
          <select
            id="activity-type-filter"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}
          >
            <option value="all">All Activity</option>
            <option value="expenses">Expenses</option>
            <option value="payments">Payments</option>
            <option value="changes">Changes</option>
            <option value="social">Discussion</option>
          </select>
          <label className="sr-only" htmlFor="activity-group-filter">Filter by group</label>
          <select
            id="activity-group-filter"
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
          >
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
          {items.map((item, index) => {
            const showDayHeader = index === 0 || items[index - 1].date !== item.date;
            const { month, day } = monthDay(item.date);
            return (
              <div key={item.key}>
                {showDayHeader && <div className="activity-day-header">{dayLabel(item.date)}</div>}
                <div className="activity-row">
                  <Avatar person={peopleById.get(item.actorId)} size={38} />
                  <div className="text">
                    <div>{item.text}</div>
                    <div className="when">{relativeTime(item.createdAt)}</div>
                  </div>
                  <div className="activity-date" aria-hidden="true">
                    <span className="month">{month}</span>
                    <span className="day">{day}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
