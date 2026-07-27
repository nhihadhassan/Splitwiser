import { get, put } from "@vercel/blob";

const MAX_BODY_BYTES = 1_000_000;
const SYNC_KEY_PATTERN = /^[A-Za-z0-9_-]{24,128}$/;

type LedgerState = {
  people: unknown[];
  groups: unknown[];
  expenses: unknown[];
  settlements: unknown[];
};

type StoredLedger = {
  version: 1;
  updatedAt: string;
  state: LedgerState;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function readSyncKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const key = authorization.slice("Bearer ".length).trim();
  return SYNC_KEY_PATTERN.test(key) ? key : null;
}

async function ledgerPath(syncKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(syncKey),
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `ledgers/${hash}.json`;
}

function isLedgerState(value: unknown): value is LedgerState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LedgerState>;
  return (
    Array.isArray(candidate.people) &&
    candidate.people.length <= 500 &&
    Array.isArray(candidate.groups) &&
    candidate.groups.length <= 500 &&
    Array.isArray(candidate.expenses) &&
    candidate.expenses.length <= 20_000 &&
    Array.isArray(candidate.settlements) &&
    candidate.settlements.length <= 20_000
  );
}

async function readLedger(pathname: string): Promise<StoredLedger | null> {
  const blob = await get(pathname, {
    access: "private",
    useCache: false,
  });
  if (!blob || blob.statusCode !== 200) return null;

  const stored = (await new Response(blob.stream).json()) as StoredLedger;
  if (stored.version !== 1 || !isLedgerState(stored.state)) {
    throw new Error("Stored ledger is invalid.");
  }
  return stored;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const syncKey = readSyncKey(request);
    if (!syncKey) {
      return json({ error: "A valid sync key is required." }, 401);
    }

    const pathname = await ledgerPath(syncKey);

    try {
      if (request.method === "GET") {
        const ledger = await readLedger(pathname);
        if (!ledger) return json({ error: "Online ledger not found." }, 404);
        return json(ledger);
      }

      if (request.method === "PUT") {
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > MAX_BODY_BYTES) {
          return json({ error: "Ledger is too large to save." }, 413);
        }

        const bodyText = await request.text();
        if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
          return json({ error: "Ledger is too large to save." }, 413);
        }

        const body = JSON.parse(bodyText) as { state?: unknown };
        if (!isLedgerState(body.state)) {
          return json({ error: "Ledger data is invalid." }, 400);
        }

        const ledger: StoredLedger = {
          version: 1,
          updatedAt: new Date().toISOString(),
          state: body.state,
        };

        await put(pathname, JSON.stringify(ledger), {
          access: "private",
          allowOverwrite: true,
          contentType: "application/json",
          cacheControlMaxAge: 60,
        });

        return json({ updatedAt: ledger.updatedAt });
      }

      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, PUT" },
      });
    } catch (error) {
      console.error("Online ledger request failed", error);
      return json({ error: "Online saving is temporarily unavailable." }, 500);
    }
  },
};
