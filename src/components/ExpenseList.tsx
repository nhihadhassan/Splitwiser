import { useMemo, useState } from "react";
import type { Expense, Settlement } from "../types";
import { useStore } from "../store";
import { formatMoney, splitEqually } from "../utils/money";
import { monthDay, monthLabel } from "../utils/dates";
import { CATEGORY_META } from "../utils/categories";
import { Avatar } from "./Avatar";
import { AddExpenseModal } from "./AddExpenseModal";
import { CategoryIcon, PaymentIcon } from "./Icons";
import { SocialThread } from "./SocialThread";

type FeedItem =
  | { kind: "expense"; date: string; createdAt: number; expense: Expense }
  | { kind: "settlement"; date: string; createdAt: number; settlement: Settlement };

export function ExpenseList({
  expenses,
  settlements,
  emptyMessage,
  showCategory = false,
  showNotes = false,
  readOnly = false,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  emptyMessage: string;
  showCategory?: boolean;
  showNotes?: boolean;
  readOnly?: boolean;
}) {
  const { state, dispatch, peopleById, currentPersonId, getToken } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  async function openReceipt(expense: Expense) {
    if (!expense.receipt || !getToken) return;
    try {
      const token = await getToken();
      const response = await fetch(`/api/receipts/${encodeURIComponent(expense.receipt.id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Receipt could not be opened.");
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setReceiptError(null);
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : "Receipt could not be opened.");
    }
  }

  function applyQuickSplit(expense: Expense, personId?: string) {
    const equalShares = personId ? null : splitEqually(expense.amount, expense.splits.length);
    dispatch({
      type: "updateExpense",
      expense: {
        ...expense,
        splitMethod: personId ? "percentage" : "equally",
        splits: expense.splits.map((split, index) => ({
          ...split,
          owes: personId
            ? split.personId === personId ? expense.amount : 0
            : equalShares?.[index] ?? 0,
        })),
      },
    });
  }

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
        <div className="big"><CategoryIcon category="other" size={30} /></div>
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
                <div className="cash payment-icon"><PaymentIcon size={20} /></div>
                <div style={{ flex: 1 }}>
                  <strong>{from?.id === currentPersonId ? "You" : from?.name}</strong> paid{" "}
                  <strong>{to?.id === currentPersonId ? "you" : to?.name}</strong> {formatMoney(s.amount)}
                </div>
                <button
                  className="btn-link-danger"
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
        const mySplit = e.splits.find((s) => s.personId === currentPersonId);
        const myNet = mySplit ? mySplit.paid - mySplit.owes : 0;
        const involved = !!mySplit;
        const groupName = e.groupId
          ? state.groups.find((g) => g.id === e.groupId)?.name
          : undefined;
        const isOpen = openId === e.id;
        const notePreview = e.notes?.replace(/^Imported from Wanderlog:\s*/i, "") ?? "No note";
        const fullSplitId = e.splits.find(
          (split) =>
            split.owes === e.amount &&
            e.splits.every((candidate) => candidate.personId === split.personId || candidate.owes === 0),
        )?.personId;

        return (
          <div key={e.id}>
            {header}
            <div
              className="expense-row"
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              aria-controls={`expense-detail-${e.id}`}
              onClick={() => setOpenId(isOpen ? null : e.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpenId(isOpen ? null : e.id);
                }
              }}
            >
              <div className="date">
                <div className="month">{m}</div>
                <div className="day">{day}</div>
              </div>
              <div className={`cat activity-icon-${e.category}`}>
                <CategoryIcon category={e.category} size={20} />
              </div>
              <div className="desc">
                <div className="title">{e.description}</div>
                {(showCategory || groupName) && (
                  <div className="where">
                    {showCategory && <span className="category-copy">{CATEGORY_META[e.category].label}</span>}
                    {showCategory && groupName && <span aria-hidden="true"> · </span>}
                    {groupName && <span>{groupName}</span>}
                  </div>
                )}
              </div>
              {showNotes && (
                <div className="row-note" title={e.notes ?? "No note"} aria-label={`Note: ${e.notes ?? "No note"}`}>
                  <span>note</span>
                  <strong className={e.notes ? "" : "empty"}>{notePreview}</strong>
                </div>
              )}
              <div className="fig">
                <div className="fig-label">
                  {payer?.personId === currentPersonId ? "you paid" : `${payerPerson?.name ?? "?"} paid`}
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
              <div className="expense-detail" id={`expense-detail-${e.id}`}>
                <div>
                  <strong>{payerPerson?.id === currentPersonId ? "You" : payerPerson?.name}</strong> paid{" "}
                  {formatMoney(e.amount)}
                  {e.notes && <span className="detail-note">, “{e.notes}”</span>}
                </div>
                {e.receipt && (
                  <button className="receipt-link" type="button" onClick={() => void openReceipt(e)}>
                    View private receipt <span>{Math.ceil(e.receipt.sizeBytes / 1024)} KB</span>
                  </button>
                )}
                {receiptError && <p className="form-error" role="status">{receiptError}</p>}
                <ul className="breakdown">
                  {e.splits.map((s) => {
                    const person = peopleById.get(s.personId);
                    return (
                      <li key={s.personId}>
                        <Avatar person={person} size={20} />
                        {person?.id === currentPersonId ? "You owe" : `${person?.name} owes`}{" "}
                        {formatMoney(s.owes)}
                      </li>
                    );
                  })}
                </ul>
                {!readOnly && e.groupId && e.splits.length >= 2 && (
                  <div className="inline-quick-split">
                    <span className="field-label" id={`quick-split-${e.id}`}>Quick split</span>
                    <div className="quick-action-row" role="group" aria-labelledby={`quick-split-${e.id}`}>
                      <button
                        type="button"
                        className={`chip quick-action ${e.splitMethod === "equally" ? "on" : ""}`}
                        aria-pressed={e.splitMethod === "equally"}
                        onClick={() => applyQuickSplit(e)}
                      >
                        {e.splits.length === 2 ? "50/50" : "Split evenly"}
                      </button>
                      {e.splits.map((split) => {
                        const person = peopleById.get(split.personId);
                        const name = split.personId === currentPersonId ? "you" : person?.name ?? "member";
                        return (
                          <button
                            key={split.personId}
                            type="button"
                            className={`chip quick-action ${fullSplitId === split.personId ? "on" : ""}`}
                            aria-pressed={fullSplitId === split.personId}
                            onClick={() => applyQuickSplit(e, split.personId)}
                          >
                            <Avatar person={person} size={18} /> 100% {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!readOnly && <div className="actions">
                  <button
                    className="btn btn-secondary"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEditing(e);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-link-danger"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (confirm(`Delete "${e.description}"?`)) {
                        dispatch({ type: "deleteExpense", expenseId: e.id });
                      }
                    }}
                  >
                    Delete expense
                  </button>
                </div>}
                {e.groupId && <SocialThread groupId={e.groupId} scope="expense" scopeId={e.id} readOnly={readOnly} />}
              </div>
            )}
          </div>
        );
      })}
      {editing && <AddExpenseModal expense={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
