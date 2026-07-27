import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Group, GroupType } from "../types";
import { ME, uid, useStore } from "../store";
import { Modal } from "./Modal";
import { Avatar } from "./Avatar";
import { GroupIcon } from "./Icons";

const GROUP_TYPES: { id: GroupType; label: string }[] = [
  { id: "trip", label: "Trip" },
  { id: "home", label: "Home" },
  { id: "couple", label: "Couple" },
  { id: "other", label: "Other" },
];

export const GROUP_ICONS: Record<GroupType, JSX.Element> = {
  trip: <GroupIcon type="trip" />,
  home: <GroupIcon type="home" />,
  couple: <GroupIcon type="couple" />,
  other: <GroupIcon type="other" />,
};

/** Create a new group, or edit an existing one when `group` is provided. */
export function GroupModal({ onClose, group }: { onClose: () => void; group?: Group }) {
  const { state, dispatch } = useStore();
  const fieldId = useId();
  const navigate = useNavigate();
  const [name, setName] = useState(group?.name ?? "");
  const [type, setType] = useState<GroupType>(group?.type ?? "trip");
  const [memberIds, setMemberIds] = useState<Set<string>>(
    () => new Set(group?.memberIds ?? [ME]),
  );
  const [simplify, setSimplify] = useState(group?.simplifyDebts ?? true);
  const [error, setError] = useState("");

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    if (!name.trim()) return setError("Enter a group name.");
    if (memberIds.size < 2) return setError("Add at least one friend to the group.");
    const record: Group = {
      id: group?.id ?? uid(),
      name: name.trim(),
      type,
      memberIds: state.people.map((p) => p.id).filter((id) => memberIds.has(id)),
      createdAt: group?.createdAt ?? Date.now(),
      simplifyDebts: simplify,
    };
    dispatch(group ? { type: "updateGroup", group: record } : { type: "addGroup", group: record });
    onClose();
    if (!group) navigate(`/groups/${record.id}`);
  }

  return (
    <Modal
      title={group ? "Group settings" : "Create a group"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            {group ? "Save" : "Create group"}
          </button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor={`${fieldId}-name`}>Group name</label>
        <input
          id={`${fieldId}-name`}
          type="text"
          value={name}
          placeholder="e.g. Summer road trip"
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field">
        <span className="field-label" id={`${fieldId}-type`}>Type</span>
        <div className="group-type-row" role="group" aria-labelledby={`${fieldId}-type`}>
          {GROUP_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={type === t.id ? "on" : ""}
              aria-pressed={type === t.id}
              onClick={() => setType(t.id)}
            >
              <GroupIcon type={t.id} size={17} /> {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label" id={`${fieldId}-members`}>Members</span>
        <div className="chip-row" role="group" aria-labelledby={`${fieldId}-members`}>
          {state.people.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip ${memberIds.has(p.id) ? "on" : ""}`}
              aria-pressed={memberIds.has(p.id)}
              aria-disabled={p.id === ME}
              onClick={() => p.id !== ME && toggleMember(p.id)}
            >
              <Avatar person={p} size={18} /> {p.name}
            </button>
          ))}
        </div>
      </div>
      <label className="toggle-line">
        <input
          type="checkbox"
          checked={simplify}
          onChange={(e) => setSimplify(e.target.checked)}
        />
        Simplify group debts (combine debts to minimize total payments)
      </label>
    </Modal>
  );
}
