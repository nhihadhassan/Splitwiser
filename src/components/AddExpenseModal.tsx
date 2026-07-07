import { useMemo, useState } from "react";
import type { Expense, ExpenseCategory, SplitMethod } from "../types";
import { ME, uid, useStore } from "../store";
import { centsToInput, formatMoney, parseMoney, splitByWeights, splitEqually } from "../utils/money";
import { CATEGORIES, CATEGORY_META } from "../utils/categories";
import { today } from "../utils/dates";
import { Modal } from "./Modal";
import { Avatar } from "./Avatar";

const METHOD_LABELS: { id: SplitMethod; label: string }[] = [
  { id: "equally", label: "Equally" },
  { id: "exact", label: "Exact amounts" },
  { id: "percentage", label: "Percentages" },
  { id: "shares", label: "Shares" },
];

interface Props {
  onClose: () => void;
  /** preselect a group */
  groupId?: string | null;
  /** preselect a friend for a non-group expense */
  friendId?: string;
  /** when set, edit this expense instead of creating one */
  expense?: Expense;
}

export function AddExpenseModal({ onClose, groupId, friendId, expense }: Props) {
  const { state, dispatch, peopleById } = useStore();

  const [description, setDescription] = useState(expense?.description ?? "");
  const [amountText, setAmountText] = useState(expense ? centsToInput(expense.amount) : "");
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "general");
  const [date, setDate] = useState(expense?.date ?? today());
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    expense ? expense.groupId ?? "" : groupId ?? "",
  );
  const [payerId, setPayerId] = useState<string>(
    expense ? expense.splits.find((s) => s.paid > 0)?.personId ?? ME : ME,
  );
  const [method, setMethod] = useState<SplitMethod>(expense?.splitMethod ?? "equally");
  const [participants, setParticipants] = useState<Set<string>>(() => {
    if (expense) return new Set(expense.splits.map((s) => s.personId));
    if (groupId) {
      const g = state.groups.find((g) => g.id === groupId);
      if (g) return new Set(g.memberIds);
    }
    if (friendId) return new Set([ME, friendId]);
    return new Set([ME]);
  });
  // per-person raw inputs for exact / percentage / shares
  const [exact, setExact] = useState<Record<string, string>>(() => initFromExpense("exact"));
  const [percent, setPercent] = useState<Record<string, string>>(() => initFromExpense("percentage"));
  const [shares, setShares] = useState<Record<string, string>>(() => initFromExpense("shares"));
  const [error, setError] = useState("");

  function initFromExpense(forMethod: SplitMethod): Record<string, string> {
    const result: Record<string, string> = {};
    if (expense && expense.splitMethod === forMethod) {
      for (const s of expense.splits) {
        if (forMethod === "exact") result[s.personId] = centsToInput(s.owes);
        else if (forMethod === "percentage")
          result[s.personId] = String(Math.round((s.owes / expense.amount) * 100));
        else result[s.personId] = "1";
      }
    }
    return result;
  }

  const group = state.groups.find((g) => g.id === selectedGroupId) ?? null;

  // people eligible to participate: group members, or (me + all friends) outside a group
  const candidates = useMemo(() => {
    const ids = group ? group.memberIds : state.people.map((p) => p.id);
    return ids.map((id) => peopleById.get(id)!).filter(Boolean);
  }, [group, state.people, peopleById]);

  const activeIds = candidates.map((p) => p.id).filter((id) => participants.has(id));
  const amount = parseMoney(amountText);
  const amountValid = !Number.isNaN(amount) && amount > 0;

  // computed owes per participant for the current method
  const owes = useMemo(() => {
    if (!amountValid) return null;
    const map = new Map<string, number>();
    if (method === "equally") {
      const parts = splitEqually(amount, activeIds.length);
      activeIds.forEach((id, i) => map.set(id, parts[i]));
      return map;
    }
    if (method === "exact") {
      let sum = 0;
      for (const id of activeIds) {
        const cents = parseMoney(exact[id] ?? "");
        if (Number.isNaN(cents)) return null;
        map.set(id, cents);
        sum += cents;
      }
      return sum === amount ? map : null;
    }
    if (method === "percentage") {
      const weights: number[] = [];
      let sum = 0;
      for (const id of activeIds) {
        const value = Number(percent[id] ?? "");
        if (!Number.isFinite(value) || value < 0) return null;
        weights.push(value);
        sum += value;
      }
      if (Math.abs(sum - 100) > 0.001) return null;
      const parts = splitByWeights(amount, weights);
      activeIds.forEach((id, i) => map.set(id, parts[i]));
      return map;
    }
    // shares
    const weights: number[] = [];
    for (const id of activeIds) {
      const value = Number(shares[id] ?? "1");
      if (!Number.isFinite(value) || value < 0) return null;
      weights.push(value);
    }
    if (weights.every((w) => w === 0)) return null;
    const parts = splitByWeights(amount, weights);
    activeIds.forEach((id, i) => map.set(id, parts[i]));
    return map;
  }, [method, amount, amountValid, activeIds, exact, percent, shares]);

  const exactSum = activeIds.reduce((sum, id) => {
    const cents = parseMoney(exact[id] ?? "");
    return sum + (Number.isNaN(cents) ? 0 : cents);
  }, 0);
  const percentSum = activeIds.reduce((sum, id) => sum + (Number(percent[id]) || 0), 0);

  function toggleParticipant(id: string) {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeGroup(nextGroupId: string) {
    setSelectedGroupId(nextGroupId);
    const nextGroup = state.groups.find((g) => g.id === nextGroupId);
    if (nextGroup) {
      setParticipants(new Set(nextGroup.memberIds));
      if (!nextGroup.memberIds.includes(payerId)) setPayerId(ME);
    }
  }

  function save() {
    if (!description.trim()) return setError("Enter a description.");
    if (!amountValid) return setError("Enter a valid amount greater than zero.");
    if (activeIds.length < 2) return setError("Pick at least two people to split with.");
    if (!activeIds.includes(payerId)) return setError("The payer must be one of the participants.");
    if (!owes) {
      if (method === "exact") return setError("The exact amounts must add up to the total.");
      if (method === "percentage") return setError("The percentages must add up to 100%.");
      return setError("Enter a valid split.");
    }
    const record: Expense = {
      id: expense?.id ?? uid(),
      description: description.trim(),
      amount,
      category,
      date,
      groupId: selectedGroupId || null,
      splitMethod: method,
      splits: activeIds.map((personId) => ({
        personId,
        owes: owes.get(personId) ?? 0,
        paid: personId === payerId ? amount : 0,
      })),
      notes: notes.trim() || undefined,
      createdAt: expense?.createdAt ?? Date.now(),
      createdBy: expense?.createdBy ?? ME,
    };
    dispatch({ type: expense ? "updateExpense" : "addExpense", expense: record });
    onClose();
  }

  return (
    <Modal
      title={expense ? "Edit expense" : "Add an expense"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-plain" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-teal" onClick={save}>
            Save
          </button>
        </>
      }
    >
      {error && <div className="form-error">{error}</div>}

      <div className="field">
        <label>With you and:</label>
        <div className="chip-row">
          {candidates
            .filter((p) => p.id !== ME)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip ${participants.has(p.id) ? "on" : ""}`}
                onClick={() => toggleParticipant(p.id)}
              >
                <Avatar person={p} size={18} /> {p.name}
              </button>
            ))}
        </div>
      </div>

      <div className="field">
        <label>Description</label>
        <input
          type="text"
          value={description}
          placeholder="Enter a description"
          onChange={(e) => setDescription(e.target.value)}
          autoFocus
        />
      </div>

      <div className="field">
        <label>Amount</label>
        <div className="amount-input">
          <span className="currency">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            placeholder="0.00"
            onChange={(e) => setAmountText(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Group</label>
          <select value={selectedGroupId} onChange={(e) => changeGroup(e.target.value)}>
            <option value="">No group</option>
            {state.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Paid by</label>
          <select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            {candidates
              .filter((p) => participants.has(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Split</label>
        <div className="split-tabs">
          {METHOD_LABELS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={method === m.id ? "on" : ""}
              onClick={() => setMethod(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="split-grid">
        {activeIds.map((id) => {
          const person = peopleById.get(id);
          return (
            <div key={id} className="split-line">
              <span className="name">
                <Avatar person={person} size={22} /> {person?.name}
              </span>
              {method === "equally" && (
                <span className="calc">
                  {amountValid && owes ? formatMoney(owes.get(id) ?? 0) : "—"}
                </span>
              )}
              {method === "exact" && (
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={exact[id] ?? ""}
                  onChange={(e) => setExact({ ...exact, [id]: e.target.value })}
                />
              )}
              {method === "percentage" && (
                <>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={percent[id] ?? ""}
                    onChange={(e) => setPercent({ ...percent, [id]: e.target.value })}
                  />
                  <span className="calc">{owes ? formatMoney(owes.get(id) ?? 0) : "%"}</span>
                </>
              )}
              {method === "shares" && (
                <>
                  <input
                    type="number"
                    min="0"
                    placeholder="1"
                    value={shares[id] ?? "1"}
                    onChange={(e) => setShares({ ...shares, [id]: e.target.value })}
                  />
                  <span className="calc">{owes ? formatMoney(owes.get(id) ?? 0) : "—"}</span>
                </>
              )}
            </div>
          );
        })}
        {method === "exact" && amountValid && (
          <div className={`split-hint ${exactSum !== amount ? "bad" : ""}`}>
            {formatMoney(exactSum)} of {formatMoney(amount)} entered
            {exactSum !== amount && ` — ${formatMoney(Math.abs(amount - exactSum))} ${exactSum > amount ? "over" : "left"}`}
          </div>
        )}
        {method === "percentage" && (
          <div className={`split-hint ${Math.abs(percentSum - 100) > 0.001 ? "bad" : ""}`}>
            {percentSum}% of 100% entered
          </div>
        )}
      </div>

      <div className="field">
        <label>Notes (optional)</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}
