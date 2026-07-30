import { NavLink } from "react-router-dom";
import { useStore, type CloudStatus } from "../store";

const STATUS_COPY: Record<CloudStatus, { label: string; detail: string }> = {
  local: {
    label: "Local only",
    detail: "Saved on this device. Open All Expenses to enable online saving.",
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
    detail: "Online saving needs attention. Open All Expenses to retry.",
  },
  conflict: {
    label: "Sync conflict",
    detail: "This ledger changed on another device. Open All Expenses to choose a version.",
  },
};

export function CloudStatusBadge() {
  const { cloud } = useStore();
  const copy = STATUS_COPY[cloud.status];

  return (
    <NavLink
      to="/all"
      className={`cloud-status-badge cloud-status-${cloud.status}`}
      aria-label={copy.detail}
      title={copy.detail}
    >
      <svg
        viewBox="0 0 24 24"
        width="17"
        height="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 18.5h10.2a4.3 4.3 0 0 0 .6-8.55A6.15 6.15 0 0 0 6.18 8.4 5.1 5.1 0 0 0 7 18.5Z" />
      </svg>
      <span aria-live="polite">{copy.label}</span>
    </NavLink>
  );
}
