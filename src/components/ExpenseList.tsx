import { useMemo, useState } from "react";
import type { Expense, Settlement } from "../types";
import { ME, useStore } from "../store";
import { formatMoney } from "../utils/money";
import { CATEGORY_META } from "../utils/categories";
import { monthDay, monthLabel } from "../utils/dates";
import { Avatar } from "./Avatar";
import { AddExpenseModal } from "./AddExpenseModal";

type FeedItem =
  | { kind: "expense"; date: string; createdAt: number; expense: Expense }
  | { kind: "settlement"; date: string; createdAt: number; settlement: Settlement };

export function ExpenseList({
  expenses,
  settlements,
  emptyMessage,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  emptyMessage: string;
}) {
  const { state, dispatch, peopleById } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);

  const items = useMemo(() => {
    const feed: FeedItem[] = [
      ...expenses.map((e) => ({
        kind: "expense" as const,
        date: e.date,
        createdAt: e.createdAt,
        expense: e,
      })),
      ...settlements.map((s) => ({
        kind: "settlement" as const,
        date: s.date,
        createdAt: s.createdAt,
        settlement: s,
      })),
    ];
    feed.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
    return feed;
  }, [expenses, settlements]);

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="big">🧾</div>
        <div>{emptyMessage}</div>
      </div>
    );
  }

  let lastMonth = "";
  return (
    <div>
      {items.map((item) => {
        const month = monthLabel(item.date);
        const header =
          month !== lastMonth ? <div className="month-header">{month}</div> : null;
        lastMonth = month;

        if (item.kind === "settlement") {
          const s = item.settlement;
          const from = peopleById.get(s.fromId);
          const to = peopleById.get(s.toId);
          const { month: m, day } = monthDay(s.date);
          return (
            <div key={`s-${s.id}`}>
              {header}
              <div className="settlement-row">
                <div className="date">
                  <div className="month">{m}</div>
                  <div className="day">{day}</div>
                </div>
                <div className="cash">💵</div>
                <div style={{ flex: 1 }}>
                  <strong>{from?.id === ME ? "You" : from?.name}</strong> paid{" "}
                  <strong>{to?.id === ME ? "you" : to?.name}</strong> {formatMoney(s.amount)}
                </div>
                <button
                  className="btn-danger-link"
                  title="Delete payment"
                  onClick={() => dispatch({ type: "deleteSettlement", settlementId: s.id })}
                >
                  ×
                </button>
              </div>
            </div>
          );
        }

        const e = item.expense;
        const { month: m, day } = monthDay(e.date);
        const payer = e.splits.find((s) => s.paid > 0);
        const payerPerson = payer ? peopleById.get(payer.personId) : undefined;
        const mySplit = e.splits.find((s) => s.personId === ME);
        const myNet = mySplit ? mySplit.paid - mySplit.owes : 0;
        const involved = !!mySplit;
        const groupName = e.groupId
          ? state.groups.find((g) => g.id === e.groupId)?.name
          : undefined;
        const isOpen = openId === e.id;

        return (
          <div key={e.id}>
            {header}
            <div className="expense-row" onClick={() => setOpenId(isOpen ? null : e.id)}>
              <div className="date">
                <div className="month">{m}</div>
                <div className="day">{day}</div>
              </div>
              <div className="cat">{CATEGORY_META[e.category].icon}</div>
              <div className="desc">
                <div className="title">{e.description}</div>
                {groupName && <div className="where">{groupName}</div>}
              </div>
              <div className="fig">
                <div className="fig-label">
                  {payer?.personId === ME ? "you paid" : `${payerPerson?.name ?? "?"} paid`}
                </div>
                <div className="fig-value">{formatMoney(e.amount)}</div>
              </div>
              <div className="fig">
                {!involved ? (
                  <div className="fig-label">not involved</div>
                ) : myNet === 0 ? (
                  <div className="fig-label">no balance</div>
                ) : (
                  <>
                    <div className="fig-label">{myNet > 0 ? "you lent" : "you borrowed"}</div>
                    <div className={`fig-value ${myNet > 0 ? "pos" : "neg"}`}>
                      {formatMoney(Math.abs(myNet))}
                    </div>
                  </>
                )}
              </div>
            </div>
            {isOpen && (
              <div className="expense-detail">
                <div>
                  <strong>{payerPerson?.id === ME ? "You" : payerPerson?.name}</strong> paid{" "}
                  {formatMoney(e.amount)}
                  {e.notes && <span style={{ color: "#888" }}> — “{e.notes}”</span>}
                </div>
                <ul className="breakdown">
                  {e.splits.map((s) => {
                    const person = peopleById.get(s.personId);
                    return (
                      <li key={s.personId}>
                        <Avatar person={person} size={20} />
                        {person?.id === ME ? "You owe" : `${person?.name} owes`}{" "}
                        {formatMoney(s.owes)}
                      </li>
                    );
                  })}
                </ul>
                <div className="actions">
                  <button
                    className="btn btn-plain"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEditing(e);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-danger-link"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (confirm(`Delete "${e.description}"?`)) {
                        dispatch({ type: "deleteExpense", expenseId: e.id });
                      }
                    }}
                  >
                    Delete expense
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {editing && <AddExpenseModal expense={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
