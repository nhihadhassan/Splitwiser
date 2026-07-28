# Splitwiser — Handoff

A Splitwise-style expense-splitting web app with a dark, premium ledger UI.
React + TypeScript + Vite. Data is cached in the browser and can be saved to a
private Vercel Blob for cross-device access using a private sync key.

- **Repo:** https://github.com/nhihadhassan/Splitwiser
- **Live app:** https://splitwiser-xi.vercel.app
- **Default branch:** `main` (full app; PR #1 merged)
- **Hosting:** Vercel project `splitwiser` (scope `nhihadhassan-2432s-projects`),
  linked to the GitHub repo — pushes to `main` auto-deploy.

---

## Current state

| Thing | State |
| --- | --- |
| App code | Complete, on `main` |
| `npm run build` | Passes (strict TS + Vite prod build) |
| Deployment | Live on Vercel production at `splitwiser-xi.vercel.app` |
| First run | Empty ledger; existing browser data is preserved |
| Backend | Vercel Function + Private Blob online ledger |
| Current UI | Splitwiser-branded premium ledger design, originally adapted from the Stitch "Velvet Ledger" direction |

Recent shipped changes:

- Added a versioned trip-reconciliation workspace for Peru and New York with
  integer-cent transactions, source lineage, grouped matches, exceptions,
  audit events, close snapshots, and legacy-data migration.
- Added shared search and filters, persistent multi-selection on both ledgers,
  many-to-many matching, explainable suggestions, CSV/table-paste import
  preview with duplicate detection, and JSON/CSV recovery exports.
- Added a separate Peru cash control (`opening + withdrawals - ending = spent`)
  and preserved the pre-trip 500 PEN / CA$212 opening cash.
- Added revision-aware cloud saves with an explicit conflict screen instead of
  silently overwriting changes made on another device.
- Reworked the old Splitwise-style shell into the current Splitwiser premium ledger UI.
- Added a first-class **Groups** overview page.
- Added a first-class **Settlement Center** with inbound/outbound totals, individual settlement actions, and "Settle All".
- Added richer dashboard modules, activity filters, expense search, category filters, desktop sidebar navigation, and mobile bottom navigation.
- Renamed all visible AUREUM branding back to **Splitwiser**.

---

## Run it locally

```bash
git clone https://github.com/nhihadhassan/Splitwiser.git
cd Splitwiser
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + prod build to dist/
```

## Deploy

Linked to Vercel + GitHub, so **push to `main` can auto-deploy**. This project
also uses an explicit final shipping step: after completed changes, build,
commit, push to GitHub, then run a production Vercel deploy and verify the live
URL.

Manual production deploy:

```bash
npx vercel deploy --prod --yes
```

Expected ship checklist:

```bash
npm run build
git status --short
git add <changed files>
git commit -m "<message>"
git push origin main
npx vercel deploy --prod --yes
curl -I https://splitwiser-xi.vercel.app
git rev-parse HEAD
git rev-parse origin/main
```

The latest confirmed production alias is:

- **Production URL:** https://splitwiser-xi.vercel.app
- **Most recent deployment URL from the branding change:** https://splitwiser-ds0p24ci4-nhihadhassan-2432s-projects.vercel.app

---

## Product surfaces

| Route | What it does |
| --- | --- |
| `/` | Overview dashboard: total balance, quick add, recent activity, active ledgers, inbound/outbound balances |
| `/groups` | Groups overview with ledger cards, member stacks, group balances, and quick expense entry |
| `/groups/:groupId` | Single group ledger, expense feed, group balances, suggested repayments, group settings |
| `/friends/:friendId` | Friend ledger with shared expenses, settlements, and shared groups |
| `/activity` | Filterable activity timeline for expenses and payments |
| `/all` | Searchable/filterable all-expenses feed plus online-save controls |
| `/settlements` | Settlement Center: total payable, total expected, inbound/outbound transfers, Settle All |
| `/reconciliation` | Trip-first matching workspace for imports, grouped matching, exceptions, cash control, close, audit, and export |

## Historical trip source

The earlier Portugal ledger remains available as source material but is not
loaded automatically on a clean browser:

- Source: [`portugal-2026-actual-trip.md`](portugal-2026-actual-trip.md) (103 expenses).
- Modeled as a **two-person equal split**: You + Rachel, every expense paid by You.
- EUR converted to CAD at the trip's blended rate **€1 = CA$1.622829**.
- Totals **CA$4,563.78** (matches the source's authoritative CA$4,563.76 ± rounding).
- Generated into [`src/seed.ts`](src/seed.ts) at build time from that markdown.

To regenerate the seed from an updated markdown, re-run the parser logic that
produced `src/seed.ts` (category map + EUR→CAD conversion), or edit the file directly.

---

## Architecture

| Path | What it is |
| --- | --- |
| `src/types.ts` | Data model (money in integer cents) |
| `src/store.tsx` | React context + reducer, browser cache, and online sync state |
| `src/cloud.ts` | Online ledger client and sync-key generation |
| `api/state.ts` | Authenticated Vercel Function for Private Blob reads/writes |
| `src/reconciliation.ts` | Versioned migration, cent-based selectors, import parser, suggestions, and cash controls |
| `src/reconciliation.test.ts` | Vitest coverage for migrations, totals, imports, suggestions, and cash |
| `src/seed.ts` | Historical trip source data + avatar palette |
| `src/utils/money.ts` | Cent math; fair equal/weighted splitting (largest-remainder) |
| `src/utils/balances.ts` | Pairwise debts, net balances, debt simplification |
| `src/components/Layout.tsx` | Splitwiser shell: desktop sidebar, top action bar, mobile bottom nav |
| `src/components/` | Shared UI: modals, avatars, expense list, add/edit expense, settlement recording |
| `src/pages/` | Dashboard, Groups, Group, Friend, Activity, All Expenses, Settlement Center |
| `src/App.tsx` | Routes (`HashRouter` — works on any static host) |
| `src/styles.css` | Global design system and responsive layout styles |

All money is integer cents. Splits always sum exactly to the total (no drift).

Run reconciliation tests with:

```bash
npm test
```

---

## Gotchas

- **Browser cache.** The current ledger remains cached under the `localStorage`
  key `splitwiser-state-v2`, so the app can still open without a network connection.
- **Online save.** Enabling online saving creates a high-entropy sync key and
  migrates the current browser ledger to the linked private Blob store. The same
  key connects another browser. The key is the credential and must remain private.
- **First run.** A browser without cached data or a sync key starts with an empty
  ledger. The historical trip seed remains in `src/seed.ts` as source material,
  but is no longer loaded automatically.
- **Single-currency.** Amounts render with a `$` glyph but the numbers are CAD.
- **Private Blob resource.** The linked store is `splitwiser-state` in `yul1`.
  Vercel injects `BLOB_READ_WRITE_TOKEN`; keep it server-only.
- **Hash routes.** The app uses `HashRouter`, so production paths look like
  `https://splitwiser-xi.vercel.app/#/settlements`.
- **Local worktree note.** A local `.gitignore` edit may exist for `.vercel` and
  `.env*`; do not accidentally include it unless that is intended.

## Possible next steps

- Multi-currency (show EUR natively instead of pre-converting)
- Mark some expenses as solo / uneven splits (seed currently splits everything equally)
- Charts, CSV export, receipt photos
- Export/share settlement summaries
- Persist design docs (`PRODUCT.md` / `DESIGN.md`) if future design work continues
- Optional email accounts if sync keys are eventually replaced with user login
- CI: GitHub Action running `npm run build` on PRs

---

_Project handoff for Splitwiser._
