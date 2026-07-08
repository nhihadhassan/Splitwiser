import { useState } from "react";
import { uid, useStore } from "../store";
import { AVATAR_COLORS } from "../seed";
import { Modal } from "./Modal";

export function AddFriendModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter your friend's name.");
    if (state.people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      return setError("You already have a friend with that name.");
    }
    dispatch({
      type: "addPerson",
      person: {
        id: uid(),
        name: trimmed,
        email: email.trim() || undefined,
        color: AVATAR_COLORS[state.people.length % AVATAR_COLORS.length],
      },
    });
    onClose();
  }

  return (
    <Modal
      title="Add a friend"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-plain" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-teal" onClick={save}>
            Add friend
          </button>
        </>
      }
    >
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label>Name</label>
        <input
          type="text"
          value={name}
          placeholder="e.g. Alex Kim"
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field">
        <label>Email (optional)</label>
        <input
          type="email"
          value={email}
          placeholder="alex@example.com"
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
    </Modal>
  );
}
