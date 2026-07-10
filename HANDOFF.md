# Splitwiser — Handoff

A Splitwise-style expense-splitting web app with a dark, premium ledger UI.
React + TypeScript + Vite, all data persisted in the browser (`localStorage`) —
no backend, no accounts, no sync.

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
| Seed data | The real **Portugal 2026** trip (see below) |
| Backend / CI | None |
| Current UI | Splitwiser-branded premium ledger design, originally adapted from the Stitch "Velvet Ledger" direction |

Recent shipped changes:

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
| `/all` | Searchable/filterable all-expenses feed plus reset demo data action |
| `/settlements` | Settlement Center: total payable, total expected, inbound/outbound transfers, Settle All |

## Seed data — Portugal 2026

The app opens with a real completed trip instead of fake demo data:

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
| `src/store.tsx` | React context + reducer, persisted to `localStorage` |
| `src/seed.ts` | Starting data (Portugal 2026) + avatar palette |
| `src/utils/money.ts` | Cent math; fair equal/weighted splitting (largest-remainder) |
| `src/utils/balances.ts` | Pairwise debts, net balances, debt simplification |
| `src/components/Layout.tsx` | Splitwiser shell: desktop sidebar, top action bar, mobile bottom nav |
| `src/components/` | Shared UI: modals, avatars, expense list, add/edit expense, settlement recording |
| `src/pages/` | Dashboard, Groups, Group, Friend, Activity, All Expenses, Settlement Center |
| `src/App.tsx` | Routes (`HashRouter` — works on any static host) |
| `src/styles.css` | Global design system and responsive layout styles |

All money is integer cents. Splits always sum exactly to the total (no drift).

---

## Gotchas

- **State is per-browser** under the `localStorage` key `splitwiser-state-v2`.
  The loader prefers saved state over the seed, so **the seed only appears on a
  fresh browser or after a key bump / "Reset demo data"**. Bump the key version
  in `src/store.tsx` when you change the seed and want existing browsers to reload it.
- **Single-currency.** Amounts render with a `$` glyph but the numbers are CAD.
- **No backend by design** — clearing site data resets the app; no cross-device sync.
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
- Real backend (e.g. Supabase) for accounts + sync
- CI: GitHub Action running `npm run build` on PRs

---

_Project handoff for Splitwiser._
