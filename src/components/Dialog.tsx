import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Modal } from "./Modal";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      title={title}
      description={description}
      tone={tone}
      onClose={onCancel}
      initialFocusRef={cancelRef}
      footer={(
        <>
          <button ref={cancelRef} className="btn btn-secondary" type="button" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </>
      )}
    >
      {null}
    </Modal>
  );
}

export function TextPromptDialog({
  title,
  description,
  label,
  confirmLabel,
  initialValue = "",
  multiline = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: string;
  label: string;
  confirmLabel: string;
  initialValue?: string;
  multiline?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();

  function submit() {
    const clean = value.trim();
    if (!clean) {
      setError(`${label} is required.`);
      return;
    }
    onConfirm(clean);
  }

  const fieldProps = {
    id: fieldId,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValue(event.target.value);
      if (error) setError("");
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submit();
      }
    },
  };

  return (
    <Modal
      title={title}
      description={description}
      onClose={onCancel}
      initialFocusRef={multiline ? textareaRef : inputRef}
      footer={(
        <>
          <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={submit}>{confirmLabel}</button>
        </>
      )}
    >
      <label className="field" htmlFor={fieldId}>
        <span>{label}</span>
        {multiline
          ? <textarea {...fieldProps} ref={textareaRef} rows={4} />
          : <input {...fieldProps} ref={inputRef} type="text" />}
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  );
}
