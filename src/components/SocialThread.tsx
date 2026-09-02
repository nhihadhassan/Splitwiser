import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Reaction, SocialItem } from "../types";
import { createSocial, deleteSocial, editSocial, loadSocial, markSocialRead, reactSocial } from "../social";
import { useStore } from "../store";
import { relativeTime } from "../utils/dates";
import { Avatar } from "./Avatar";
import { TextPromptDialog } from "./Dialog";

const REACTIONS: Reaction["emoji"][] = ["👍", "❤️", "😂", "👀", "✅"];

type Props = {
  groupId: string;
  scope: "group" | "expense";
  scopeId: string;
  readOnly?: boolean;
};

export function SocialThread({ groupId, scope, scopeId, readOnly = false }: Props) {
  const { getToken, session, peopleById, currentPersonId } = useStore();
  const [items, setItems] = useState<SocialItem[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serviceReadOnly, setServiceReadOnly] = useState(!getToken || !navigator.onLine);
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<SocialItem | null>(null);
  const activeUntil = useRef(0);

  const refresh = useCallback(async () => {
    if (!getToken || !navigator.onLine || document.visibilityState !== "visible") {
      setServiceReadOnly(true);
      return;
    }
    try {
      const feed = await loadSocial(getToken, groupId);
      setServiceReadOnly(feed.readOnly);
      setError(feed.message ?? null);
      setItems(feed.items);
      const latest = feed.items.reduce((value, item) => Math.max(value, item.createdAt), 0);
      if (latest) void markSocialRead(getToken, groupId, latest).catch(() => undefined);
    } catch (reason) {
      setServiceReadOnly(true);
      setError(reason instanceof Error ? reason.message : "Discussion is temporarily read-only.");
    }
  }, [getToken, groupId]);

  useEffect(() => {
    let timer = 0;
    let cancelled = false;
    const poll = async () => {
      await refresh();
      if (cancelled) return;
      timer = window.setTimeout(poll, Date.now() < activeUntil.current ? 8_000 : 30_000);
    };
    void poll();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [refresh]);

  const visibleItems = useMemo(
    () => items.filter((item) => item.scope === scope && item.scopeId === scopeId),
    [items, scope, scopeId],
  );

  async function submit() {
    const clean = body.trim();
    if (!clean || !getToken) return;
    const optimistic: SocialItem = {
      id: `pending-${crypto.randomUUID()}`,
      groupId,
      scope,
      scopeId,
      authorPersonId: currentPersonId,
      body: clean,
      createdAt: Date.now(),
      reactions: [],
    };
    setItems((current) => [...current, optimistic]);
    setBody("");
    setSaving(true);
    activeUntil.current = Date.now() + 60_000;
    try {
      const saved = await createSocial(getToken, groupId, scope, scopeId, clean);
      setItems((current) => current.map((item) => item.id === optimistic.id ? saved : item));
      setError(null);
    } catch (reason) {
      setItems((current) => current.filter((item) => item.id !== optimistic.id));
      setBody(clean);
      setError(reason instanceof Error ? reason.message : "Message could not be sent.");
      setServiceReadOnly(true);
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(
    item: SocialItem,
    action: "edit" | "delete" | "react",
    emoji?: Reaction["emoji"],
    nextBody?: string,
  ) {
    if (!getToken) return;
    try {
      let updated: SocialItem;
      if (action === "delete") updated = await deleteSocial(getToken, item.id);
      else if (action === "react" && emoji) updated = await reactSocial(getToken, item.id, emoji);
      else if (nextBody) updated = await editSocial(getToken, item.id, nextBody);
      else return;
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      activeUntil.current = Date.now() + 60_000;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Message could not be changed.");
    }
  }

  const disabled = readOnly || serviceReadOnly;
  return (
    <>
      <section className="social-thread" aria-label={scope === "group" ? "Group discussion" : "Expense comments"}>
        <div className="social-list" aria-live="polite">
          {visibleItems.length === 0 && <p className="empty-inline">No messages yet.</p>}
          {visibleItems.map((item) => {
            const author = peopleById.get(item.authorPersonId);
            const canManage = item.authorPersonId === currentPersonId || session.capabilities.moderateSocial;
            return (
              <article className="social-item" key={item.id}>
                <Avatar person={author} size={28} />
                <div>
                  <div className="social-meta"><strong>{item.authorPersonId === currentPersonId ? "You" : author?.name}</strong><span>{relativeTime(item.createdAt)}</span></div>
                  <p className={item.deletedAt ? "social-tombstone" : ""}>{item.deletedAt ? "Message deleted" : item.body}</p>
                  {!item.deletedAt && <div className="reaction-row">
                    {REACTIONS.map((emoji) => {
                      const reaction = item.reactions.find((entry) => entry.emoji === emoji);
                      return <button key={emoji} type="button" aria-label={`React ${emoji}`} aria-pressed={reaction?.personIds.includes(currentPersonId) ?? false} onClick={() => void updateItem(item, "react", emoji)} disabled={disabled}>{emoji}{reaction?.personIds.length ? ` ${reaction.personIds.length}` : ""}</button>;
                    })}
                    {canManage && <button type="button" onClick={() => setEditingItem(item)} disabled={disabled}>Edit</button>}
                    {canManage && <button type="button" onClick={() => void updateItem(item, "delete")} disabled={disabled}>Delete</button>}
                  </div>}
                </div>
              </article>
            );
          })}
        </div>
        {error && <p className="form-error" role="status">{error}</p>}
        <div className="social-composer">
          <label className="sr-only" htmlFor={`social-${scopeId}`}>Write a message</label>
          <textarea id={`social-${scopeId}`} rows={2} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={disabled ? "Discussion is temporarily read-only" : "Write a message"} disabled={disabled} />
          <button className="btn btn-primary" type="button" onClick={() => void submit()} disabled={disabled || saving || !body.trim()}>{saving ? "Sending…" : "Send"}</button>
        </div>
      </section>
      {editingItem && (
        <TextPromptDialog
          title="Edit message"
          description="Update the message for everyone in this discussion."
          label="Message"
          confirmLabel="Save changes"
          initialValue={editingItem.body}
          multiline
          onCancel={() => setEditingItem(null)}
          onConfirm={(nextBody) => {
            const item = editingItem;
            setEditingItem(null);
            void updateItem(item, "edit", undefined, nextBody);
          }}
        />
      )}
    </>
  );
}
