import { useState, type FormEvent } from "react";
import { useStore } from "../store";

function statusCopy(status: ReturnType<typeof useStore>["cloud"]["status"]): string {
  switch (status) {
    case "connecting":
      return "Connecting…";
    case "saving":
      return "Saving online…";
    case "synced":
      return "Saved online";
    case "error":
      return "Online save paused";
    case "conflict":
      return "Choose which ledger to keep";
    default:
      return "Saved on this device";
  }
}

export function CloudSyncPanel() {
  const { cloud } = useStore();
  const [connectKey, setConnectKey] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function enableOnlineSave() {
    const key = await cloud.enable();
    if (key) setNewKey(key);
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    const connected = await cloud.connect(connectKey.trim());
    if (connected) setConnectKey("");
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className={`cloud-sync-panel cloud-sync-${cloud.status}`} aria-live="polite">
      <div className="cloud-sync-summary">
        <span className="cloud-sync-indicator" aria-hidden="true" />
        <strong>{statusCopy(cloud.status)}</strong>
        {cloud.hasKey && cloud.status !== "conflict" && (
          <button
            className="btn-link"
            type="button"
            onClick={() => void cloud.refresh()}
            disabled={cloud.status === "connecting" || cloud.status === "saving"}
          >
            Sync now
          </button>
        )}
      </div>

      {!cloud.hasKey && (
        <div className="cloud-sync-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={enableOnlineSave}
            disabled={cloud.status === "connecting"}
          >
            Create new online ledger
          </button>
          <details>
            <summary>Connect an existing ledger</summary>
            <form className="cloud-sync-connect" onSubmit={connect}>
              <label htmlFor="cloud-sync-key">Sync key</label>
              <div>
                <input
                  id="cloud-sync-key"
                  value={connectKey}
                  onChange={(event) => setConnectKey(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste your key"
                />
                <button className="btn btn-secondary" disabled={!connectKey.trim()}>
                  Connect
                </button>
              </div>
            </form>
            <p className="cloud-sync-connect-help">Use the exact sync key from your laptop. Creating a new ledger here will start a separate cloud copy.</p>
          </details>
        </div>
      )}

      {cloud.hasKey && (
        <details className="cloud-sync-settings">
          <summary>Sync settings</summary>
          <div className="cloud-sync-key-row">
            <label htmlFor="current-sync-key">Private sync key</label>
            <div>
              <input
                id="current-sync-key"
                value={cloud.key ?? ""}
                readOnly
                spellCheck={false}
                aria-describedby="sync-key-help"
              />
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => cloud.key && copyKey(cloud.key)}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p id="sync-key-help">
              Keep private. Needed on another device.
            </p>
          </div>
          <button className="btn-link-danger" type="button" onClick={cloud.disconnect}>
            Stop online saving on this device
          </button>
        </details>
      )}

      {newKey && (
        <div className="cloud-sync-key-callout">
          <div>
            <strong>Save your sync key</strong>
            <p>Keep it to connect another browser or recover this ledger.</p>
          </div>
          <code>{newKey}</code>
          <button className="btn btn-secondary" type="button" onClick={() => copyKey(newKey)}>
            {copied ? "Copied" : "Copy key"}
          </button>
          <button className="btn-link-success" type="button" onClick={() => setNewKey(null)}>
            I saved it
          </button>
        </div>
      )}

      {cloud.status === "conflict" && (
        <div className="cloud-sync-conflict" role="alert">
          <div>
            <strong>Changes were found on another device</strong>
            <span>No data was overwritten. Choose the online copy or keep this device’s copy.</span>
          </div>
          <button className="btn btn-secondary" type="button" onClick={cloud.useCloudVersion}>
            Use online version
          </button>
          <button className="btn btn-primary" type="button" onClick={cloud.keepLocalVersion}>
            Keep this version
          </button>
        </div>
      )}

      {cloud.error && cloud.status !== "conflict" && (
        <div className="cloud-sync-error" role="alert">
          <span>{cloud.error}</span>
          {cloud.hasKey && (
            <button className="btn btn-secondary" type="button" onClick={cloud.retry}>
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  );
}
