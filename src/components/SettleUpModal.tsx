import { useId, useState } from "react";
import { ME, uid, useStore } from "../store";
import { centsToInput, parseMoney } from "../utils/money";
import { today } from "../utils/dates";
import { Modal } from "./Modal";

interface Props {
  onClose: () => void;
  groupId?: string | null;
  /** prefill: who pays whom and how much (cents) */
  prefill?: { fromId: string; toId: string; amount: number };
}

export function SettleUpModal({ onClose, groupId, prefill }: Props) {
  const { state, dispatch } = useStore();
  const fieldId = useId();
  const group = state.groups.find((g) => g.id === groupId) ?? null;
  const people = (group ? group.memberIds : state.people.map((p) => p.id)).map(
    (id) => state.people.find((p) => p.id === id)!,
  );

  const [fromId, setFromId] = useState(prefill?.fromId ?? ME);
  const [toId, setToId] = useState(
    prefill?.toId ?? people.find((p) => p.id !== (prefill?.fromId ?? ME))?.id ?? "",
  );
  const [amountText, setAmountText] = useState(prefill ? centsToInput(prefill.amount) : "");
  const [date, setDate] = useState(today());
  const [error, setError] = useState("");

  function save() {
    const amount = parseMoney(amountText);
    if (fromId === toId) return setError("Payer and recipient must be different people.");
    if (Number.isNaN(amount) || amount <= 0) return setError("Enter a valid amount.");
    dispatch({
      type: "addSettlement",
      settlement: {
        id: uid(),
        fromId,
        toId,
        amount,
        date,
        groupId: groupId ?? null,
        createdAt: Date.now(),
        createdBy: ME,
      },
    });
    onClose();
  }

  return (
    <Modal
      title="Settle up"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-plain" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-teal" onClick={save}>
            Record payment
          </button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor={`${fieldId}-from`}>Who paid</label>
        <select id={`${fieldId}-from`} value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${fieldId}-to`}>Who received</label>
        <select id={`${fieldId}-to`} value={toId} onChange={(e) => setToId(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
            autoFocus={!prefill}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${fieldId}-date`}>Date</label>
        <input id={`${fieldId}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
    </Modal>
  );
}
