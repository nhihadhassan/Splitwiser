import { useEffect, useId, useMemo, useState } from "react";
import type { Expense, ReceiptAttachment, SplitMethod } from "../types";
import { uid, useStore } from "../store";
import { centsToInput, formatMoney, parseMoney, splitByWeights, splitEqually } from "../utils/money";
import { CATEGORIES, CATEGORY_META, normalizeExpenseCategory, type SelectableExpenseCategory } from "../utils/categories";
import { CategoryIcon } from "./Icons";
import { today } from "../utils/dates";
import { Modal } from "./Modal";
import { Avatar } from "./Avatar";
import { DatePicker } from "./DatePicker";
import { prepareReceiptImage, scanReceipt, type ParsedReceipt } from "../receiptOcr";

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
  const { state, dispatch, peopleById, currentPersonId, getToken, session } = useStore();
  const fieldId = useId();
  const initialGroupId = expense?.groupId ?? groupId ?? state.groups.find((item) => item.status !== "closed" && item.memberIds.includes(currentPersonId))?.id ?? "";
  const splitTemplate = expense ?? [...state.expenses]
    .filter((item) => item.groupId === (initialGroupId || null))
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((item) => item.splitMethod === "equally" || item.splitMethod === "percentage" || item.splitMethod === "shares");

  const [description, setDescription] = useState(expense?.description ?? "");
  const [amountText, setAmountText] = useState(expense ? centsToInput(expense.amount) : "");
  const [category, setCategory] = useState<SelectableExpenseCategory>(
    () => normalizeExpenseCategory(expense?.category ?? "other", expense?.description),
  );
  const [categoryTouched, setCategoryTouched] = useState(Boolean(expense));
  const [date, setDate] = useState(expense?.date ?? today());
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    initialGroupId,
  );
  const [payerId, setPayerId] = useState<string>(
    expense ? expense.splits.find((s) => s.paid > 0)?.personId ?? currentPersonId : currentPersonId,
  );
  const [method, setMethod] = useState<SplitMethod>(expense?.splitMethod ?? splitTemplate?.splitMethod ?? "equally");
  const [participants, setParticipants] = useState<Set<string>>(() => {
    if (expense) return new Set(expense.splits.map((s) => s.personId));
    if (initialGroupId) {
      const g = state.groups.find((g) => g.id === initialGroupId);
      if (g) return new Set(g.memberIds);
    }
    if (friendId) return new Set([currentPersonId, friendId]);
    const recent = [...state.expenses]
      .filter((item) => item.splits.some((split) => split.personId === currentPersonId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .flatMap((item) => item.splits.map((split) => split.personId))
      .filter((id, index, values) => id !== currentPersonId && values.indexOf(id) === index)
      .slice(0, 3);
    return new Set([currentPersonId, ...recent]);
  });
  // per-person raw inputs for exact / percentage / shares
  const [exact, setExact] = useState<Record<string, string>>(() => initFromExpense("exact"));
  const [percent, setPercent] = useState<Record<string, string>>(() => initFromExpense("percentage"));
  const [shares, setShares] = useState<Record<string, string>>(() => initFromExpense("shares"));
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [preparedReceipt, setPreparedReceipt] = useState<{ blob: Blob; width: number; height: number; fileName: string; id: string } | null>(null);
  const [receiptResult, setReceiptResult] = useState<ParsedReceipt | null>(null);
  const [, setRawOcrText] = useState("");
  const [attachReceipt, setAttachReceipt] = useState(Boolean(expense?.receipt));

  useEffect(() => {
    if (!categoryTouched && description.trim()) setCategory(normalizeExpenseCategory("other", description));
  }, [categoryTouched, description]);

  function initFromExpense(forMethod: SplitMethod): Record<string, string> {
    const result: Record<string, string> = {};
    if (splitTemplate && splitTemplate.splitMethod === forMethod) {
      for (const s of splitTemplate.splits) {
        if (forMethod === "exact") result[s.personId] = centsToInput(s.owes);
        else if (forMethod === "percentage")
          result[s.personId] = String(Math.round((s.owes / splitTemplate.amount) * 100));
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
  const fullSplitId = method === "percentage"
    ? activeIds.find((id) =>
        activeIds.every((participantId) =>
          Number(percent[participantId] ?? "0") === (participantId === id ? 100 : 0),
        ),
      )
    : undefined;

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
      if (!nextGroup.memberIds.includes(payerId)) setPayerId(currentPersonId);
    }
  }

  function applyEqualSplit() {
    setMethod("equally");
    setError("");
  }

  function applyFullSplit(personId: string) {
    setMethod("percentage");
    setPercent(
      Object.fromEntries(
        activeIds.map((id) => [id, id === personId ? "100" : "0"]),
      ),
    );
    setError("");
  }

  async function chooseReceipt(file: File | undefined) {
    if (!file) return;
    setScanning(true);
    setError("");
    setScanProgress(0);
    try {
      const prepared = await prepareReceiptImage(file);
      const result = await scanReceipt(prepared.blob, setScanProgress);
      setPreparedReceipt({ ...prepared, fileName: file.name, id: uid() });
      setReceiptResult(result.parsed);
      setRawOcrText(result.text);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Receipt could not be scanned.");
    } finally {
      setScanning(false);
    }
  }

  function useReceiptDetails() {
    if (!receiptResult) return;
    if (receiptResult.merchant) setDescription(receiptResult.merchant);
    if (receiptResult.totalCents) setAmountText(centsToInput(receiptResult.totalCents));
    if (receiptResult.date) setDate(receiptResult.date);
    if (receiptResult.merchant) {
      setCategory(normalizeExpenseCategory("other", receiptResult.merchant));
      setCategoryTouched(false);
    }
  }

  async function uploadReceipt(): Promise<ReceiptAttachment | undefined> {
    if (!attachReceipt) return undefined;
    if (!preparedReceipt) return expense?.receipt;
    if (!selectedGroupId) throw new Error("Choose a group before attaching this receipt.");
    if (!getToken) throw new Error("Sign in to attach the receipt. Local scanning is still available.");
    const token = await getToken();
    if (!token) throw new Error("Sign in to attach the receipt.");
    const storagePath = `private/receipts/${session.accountId}/${preparedReceipt.id}`;
    const { upload } = await import("@vercel/blob/client");
    await upload(storagePath, preparedReceipt.blob, {
      access: "private",
      handleUploadUrl: "/api/receipts/upload",
      headers: { Authorization: `Bearer ${token}` },
      clientPayload: JSON.stringify({ groupId: selectedGroupId, receiptId: preparedReceipt.id }),
      contentType: "image/webp",
    });
    return {
      id: preparedReceipt.id,
      storagePath,
      fileName: preparedReceipt.fileName,
      mimeType: "image/webp",
      sizeBytes: preparedReceipt.blob.size,
      width: preparedReceipt.width,
      height: preparedReceipt.height,
      merchant: receiptResult?.merchant || undefined,
      totalCents: receiptResult?.totalCents ?? undefined,
      receiptDate: receiptResult?.date ?? undefined,
      createdAt: Date.now(),
      createdBy: currentPersonId,
    };
  }

  async function save() {
    if (!description.trim()) return setError("Enter a description.");
    if (!amountValid) return setError("Enter a valid amount greater than zero.");
    if (activeIds.length < 2) return setError("Pick at least two people to split with.");
    if (!activeIds.includes(payerId)) return setError("The payer must be one of the participants.");
    if (!owes) {
      if (method === "exact") return setError("The exact amounts must add up to the total.");
      if (method === "percentage") return setError("The percentages must add up to 100%.");
      return setError("Enter a valid split.");
    }
    let receipt: ReceiptAttachment | undefined;
    try {
      receipt = await uploadReceipt();
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "Receipt could not be attached.");
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
      receipt,
      createdAt: expense?.createdAt ?? Date.now(),
      createdBy: expense?.createdBy ?? currentPersonId,
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
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="field">
        <label htmlFor={`${fieldId}-description`}>Description</label>
        <input
          id={`${fieldId}-description`}
          type="text"
          value={description}
          placeholder="Enter a description"
          onChange={(e) => setDescription(e.target.value)}
          autoFocus
        />
      </div>

      <div className="field">
        <label htmlFor={`${fieldId}-amount`}>Amount</label>
        <div className="amount-input">
          <span className="currency">$</span>
          <input
            id={`${fieldId}-amount`}
            type="text"
            inputMode="decimal"
            value={amountText}
            placeholder="0.00"
            onChange={(e) => setAmountText(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <span className="field-label" id={`${fieldId}-participants`}>People</span>
        <div className="chip-row" role="group" aria-labelledby={`${fieldId}-participants`}>
          {candidates.map((p) => (
            <button key={p.id} type="button" className={`chip ${participants.has(p.id) ? "on" : ""}`} aria-pressed={participants.has(p.id)} onClick={() => p.id !== currentPersonId && toggleParticipant(p.id)}>
              <Avatar person={p} size={18} /> {p.id === currentPersonId ? "You" : p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field-pair">
        <div className="field">
          <label htmlFor={`${fieldId}-group`}>Group</label>
          <select id={`${fieldId}-group`} value={selectedGroupId} onChange={(e) => changeGroup(e.target.value)}>
            <option value="">No group</option>
            {state.groups.filter((item) => item.status !== "closed").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-payer`}>Paid by</label>
          <select id={`${fieldId}-payer`} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            {candidates.filter((person) => participants.has(person.id)).map((person) => <option key={person.id} value={person.id}>{person.id === currentPersonId ? "You" : person.name}</option>)}
          </select>
        </div>
      </div>

      <details className="expense-advanced">
        <summary>Split details, date, category, notes, and receipt</summary>

      <div className="field">
        <label htmlFor={`${fieldId}-date`}>Date</label>
        <DatePicker id={`${fieldId}-date`} value={date} onChange={setDate} />
      </div>

      <div className="field category-field">
        <span className="field-label" id={`${fieldId}-category`}>Category</span>
        <div className="category-picker" role="radiogroup" aria-labelledby={`${fieldId}-category`}>
          {CATEGORIES.map((item) => {
            const selected = category === item;
            return (
              <button
                key={item}
                type="button"
                className={`category-card activity-icon-${item} ${selected ? "selected" : ""}`}
                role="radio"
                aria-checked={selected}
                onClick={() => { setCategory(item); setCategoryTouched(true); }}
              >
                <CategoryIcon category={item} size={25} />
                <span>{CATEGORY_META[item].label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {group && activeIds.length >= 2 && (
        <div className="field quick-setup">
          <span className="field-label" id={`${fieldId}-quick-setup`}>Quick split</span>
          <div className="quick-action-row" role="group" aria-labelledby={`${fieldId}-quick-setup`}>
            <button
              type="button"
              className={`chip quick-action ${method === "equally" ? "on" : ""}`}
              aria-pressed={method === "equally"}
              onClick={applyEqualSplit}
            >
              {activeIds.length === 2 ? "50/50" : "Split evenly"}
            </button>
            {activeIds.map((id) => {
              const person = peopleById.get(id);
              const name = id === currentPersonId ? "you" : person?.name ?? "member";
              return (
                <button
                  key={id}
                  type="button"
                  className={`chip quick-action ${fullSplitId === id ? "on" : ""}`}
                  aria-pressed={fullSplitId === id}
                  onClick={() => applyFullSplit(id)}
                >
                  <Avatar person={person} size={18} /> 100% {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="field">
        <span className="field-label" id={`${fieldId}-split-method`}>Split</span>
        <div className="split-tabs" role="group" aria-labelledby={`${fieldId}-split-method`}>
          {METHOD_LABELS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={method === m.id ? "on" : ""}
              aria-pressed={method === m.id}
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
                  aria-label={`${person?.name ?? "Participant"} exact amount`}
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
                    aria-label={`${person?.name ?? "Participant"} percentage`}
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
                    aria-label={`${person?.name ?? "Participant"} shares`}
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
        <label htmlFor={`${fieldId}-notes`}>Notes (optional)</label>
        <textarea id={`${fieldId}-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="field receipt-field">
        <span className="field-label">Receipt scan</span>
        <p className="field-help">Text recognition runs on this device. Nothing is saved until you confirm it.</p>
        <label className="btn btn-secondary receipt-picker">
          {scanning ? `Scanning ${Math.round(scanProgress * 100)}%` : "Choose receipt image"}
          <input type="file" accept="image/*" capture="environment" disabled={scanning} onChange={(event) => void chooseReceipt(event.target.files?.[0])} />
        </label>
        {receiptResult && (
          <div className="receipt-suggestion">
            <strong>Suggested details</strong>
            <span>{receiptResult.merchant || "Merchant not found"}</span>
            <span>{receiptResult.totalCents ? formatMoney(receiptResult.totalCents) : "Total not found"}</span>
            <span>{receiptResult.date ?? "Date not found"}</span>
            <button className="btn btn-secondary" type="button" onClick={useReceiptDetails}>Use these details</button>
          </div>
        )}
        {(preparedReceipt || expense?.receipt) && (
          <label className="toggle-line">
            <input type="checkbox" checked={attachReceipt} onChange={(event) => setAttachReceipt(event.target.checked)} disabled={!selectedGroupId || !getToken} />
            Attach the compressed image to this group expense
          </label>
        )}
      </div>
      </details>
    </Modal>
  );
}
