import { useId, useMemo, useState } from "react";
import { uid, useStore } from "../store";
import { buildLedger, rawDebts, simplifyDebts } from "../utils/balances";
import { centsToInput, formatMoney, parseMoney } from "../utils/money";
import { today } from "../utils/dates";
import { Modal } from "./Modal";

interface Props {
  onClose: () => void;
  groupId?: string | null;
  /** prefill: who pays whom and how much (cents) */
  prefill?: { fromId: string; toId: string; amount: number };
}

export function SettleUpModal({ onClose, groupId, prefill }: Props) {
  const { state, dispatch, currentPersonId } = useStore();
  const fieldId = useId();
  const group = state.groups.find((g) => g.id === groupId) ?? null;
  const people = (group ? group.memberIds : state.people.map((p) => p.id)).map(
    (id) => state.people.find((p) => p.id === id)!,
  );
  const remainingDebts = useMemo(() => {
    if (!group) return [];
    const ledger = buildLedger(state, { groupId: group.id });
    return group.simplifyDebts ? simplifyDebts(ledger) : rawDebts(ledger);
  }, [group, state]);
  const defaultPayment =
    prefill ?? (remainingDebts.length === 1 ? remainingDebts[0] : undefined);

  const [fromId, setFromId] = useState(defaultPayment?.fromId ?? currentPersonId);
  const [toId, setToId] = useState(
    defaultPayment?.toId ??
      people.find((p) => p.id !== (defaultPayment?.fromId ?? currentPersonId))?.id ??
      "",
  );
  const [amountText, setAmountText] = useState(
    defaultPayment ? centsToInput(defaultPayment.amount) : "",
  );
  const [date, setDate] = useState(today());
  const [error, setError] = useState("");

  function useRemainingBalance(debt: (typeof remainingDebts)[number]) {
    setFromId(debt.fromId);
    setToId(debt.toId);
    setAmountText(centsToInput(debt.amount));
    setError("");
  }

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
        createdBy: currentPersonId,
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
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Record payment
          </button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      {group && (
        <div className="settle-remaining-panel">
          <div className="settle-remaining-heading">
            <strong>Remaining group balance</strong>
            <span>
              {remainingDebts.length === 0
                ? "This group is fully settled."
                : remainingDebts.length === 1
                  ? "Use the full outstanding amount."
                  : "Choose an outstanding repayment."}
            </span>
          </div>
          {remainingDebts.map((debt) => {
            const from = state.people.find((person) => person.id === debt.fromId);
            const to = state.people.find((person) => person.id === debt.toId);
            const isSelected =
              fromId === debt.fromId &&
              toId === debt.toId &&
              parseMoney(amountText) === debt.amount;
            return (
              <button
                key={`${debt.fromId}-${debt.toId}`}
                type="button"
                className={`settle-remaining-option${isSelected ? " selected" : ""}`}
                aria-pressed={isSelected}
                onClick={() => useRemainingBalance(debt)}
              >
                <span>
                  {from?.id === currentPersonId ? "You" : from?.name} →{" "}
                  {to?.id === currentPersonId ? "you" : to?.name}
                </span>
                <strong>Settle remaining {formatMoney(debt.amount)}</strong>
              </button>
            );
          })}
        </div>
      )}
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
            autoFocus={!defaultPayment}
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
