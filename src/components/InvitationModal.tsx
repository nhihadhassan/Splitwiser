import { useId, useState } from "react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";

export function InvitationModal({ onClose }: { onClose: () => void }) {
  const { state, getToken } = useStore();
  const fieldId = useId();
  const people = state.people.filter((person) => !person.claimed);
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "sent">("idle");
  const [error, setError] = useState("");

  async function send() {
    if (!getToken || !personId || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Choose an unclaimed person and enter a valid email address.");
      return;
    }
    setStatus("saving");
    setError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ personId, email: email.trim() }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Invitation could not be sent.");
      setStatus("sent");
    } catch (reason) {
      setStatus("idle");
      setError(reason instanceof Error ? reason.message : "Invitation could not be sent.");
    }
  }

  return (
    <Modal
      title="Invite someone"
      onClose={onClose}
      footer={status === "sent" ? (
        <button className="btn btn-primary" type="button" onClick={onClose}>Done</button>
      ) : (
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={() => void send()} disabled={status === "saving" || people.length === 0}>
            {status === "saving" ? "Sending…" : "Send invitation"}
          </button>
        </>
      )}
    >
      {status === "sent" ? (
        <p role="status">Invitation sent. After they sign in, they’ll see the trips you share.</p>
      ) : people.length === 0 ? (
        <p className="empty-inline">Everyone in this workspace already has an account.</p>
      ) : (
        <>
          {error && <p className="form-error" role="alert">{error}</p>}
          <label className="field" htmlFor={`${fieldId}-person`}>
            <span>Invite as</span>
            <select id={`${fieldId}-person`} value={personId} onChange={(event) => setPersonId(event.target.value)}>
              {people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}
            </select>
          </label>
          <div className="invite-person-preview">
            <Avatar person={state.people.find((person) => person.id === personId)} size={32} />
            <span>This account will belong to this person only. They’ll see every trip that includes them.</span>
          </div>
          <label className="field" htmlFor={`${fieldId}-email`}>
            <span>Email address</span>
            <input id={`${fieldId}-email`} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="friend@example.com" />
          </label>
        </>
      )}
    </Modal>
  );
}
