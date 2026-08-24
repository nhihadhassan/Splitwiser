import { useState } from "react";
import { useStore, type CloudStatus } from "../store";
import { Modal } from "./Modal";

const STATUS_COPY: Record<CloudStatus, { label: string; detail: string }> = {
  local: {
    label: "Local only",
    detail: "This synthetic development workspace stays on this device.",
  },
  connecting: {
    label: "Connecting…",
    detail: "Connecting this ledger to its online copy.",
  },
  saving: {
    label: "Saving…",
    detail: "Saving your latest changes online.",
  },
  synced: {
    label: "Synced",
    detail: "Your ledger is successfully synced to the cloud.",
  },
  error: {
    label: "Sync paused",
    detail: "Online saving needs attention. Review the connection and retry.",
  },
  conflict: {
    label: "Sync conflict",
    detail: "This ledger changed on another device. Choose which version to keep.",
  },
};

export function CloudStatusBadge() {
  const { cloud } = useStore();
  const [open, setOpen] = useState(false);
  const copy = STATUS_COPY[cloud.status];
  const detail = cloud.status === "saving" && cloud.pendingCount > 0
    ? `Saving ${cloud.pendingCount} ${cloud.pendingCount === 1 ? "change" : "changes"} online.`
    : copy.detail;

  return (
    <>
      <button
        type="button"
        className={`cloud-status-badge cloud-status-${cloud.status}`}
        aria-label={detail}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={detail}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 18.5h10.2a4.3 4.3 0 0 0 .6-8.55A6.15 6.15 0 0 0 6.18 8.4 5.1 5.1 0 0 0 7 18.5Z" />
        </svg>
        <span aria-live="polite">{copy.label}</span>
      </button>
      {open && (
        <Modal
          title={copy.label}
          onClose={() => setOpen(false)}
          footer={cloud.status === "conflict" ? (
            <><button className="btn btn-primary" type="button" onClick={() => void cloud.useCloudVersion().then(() => setOpen(false))}>Use online version</button><button className="btn btn-secondary" type="button" onClick={() => void cloud.keepLocalVersion().then(() => setOpen(false))}>Keep offline edits</button></>
          ) : cloud.status === "saving" && cloud.pendingCount > 0 ? (
            <button className="btn btn-primary" type="button" onClick={() => void cloud.retry()}>Save now</button>
          ) : cloud.status === "error" ? (
            <button className="btn btn-primary" type="button" onClick={() => void cloud.retry()}>Retry</button>
          ) : cloud.status === "connecting" || cloud.status === "synced" ? (
            <button className="btn btn-primary" type="button" onClick={() => void cloud.refresh()}>Check online copy</button>
          ) : undefined}
        >
          <div className="cloud-status-dialog-content">
            <p>{cloud.error ?? detail}</p>
            {cloud.lastSavedAt && <small>Last saved {new Date(cloud.lastSavedAt).toLocaleString()}</small>}
          </div>
        </Modal>
      )}
    </>
  );
}
