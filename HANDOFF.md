# Splitwiser — Handoff

A Splitwise-style expense-splitting web app. React + TypeScript + Vite, all data
persisted in the browser (`localStorage`) — no backend, no accounts, no sync.

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
| Deployment | Live on Vercel (production) |
| Seed data | The real **Portugal 2026** trip (see below) |
| Backend / CI | None |

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

Linked to Vercel + GitHub, so **push to `main` = auto-deploy**. Manual deploy:

```bash
npx vercel deploy --prod --yes
```

---

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
| `src/components/`, `src/pages/` | UI: modals, layout, Dashboard/Group/Friend/Activity pages |
| `src/App.tsx` | Routes (`HashRouter` — works on any static host) |

All money is integer cents. Splits always sum exactly to the total (no drift).

---

## Gotchas

- **State is per-browser** under the `localStorage` key `splitwiser-state-v2`.
  The loader prefers saved state over the seed, so **the seed only appears on a
  fresh browser or after a key bump / "Reset demo data"**. Bump the key version
  in `src/store.tsx` when you change the seed and want existing browsers to reload it.
- **Single-currency.** Amounts render with a `$` glyph but the numbers are CAD.
- **No backend by design** — clearing site data resets the app; no cross-device sync.

## Possible next steps

- Multi-currency (show EUR natively instead of pre-converting)
- Mark some expenses as solo / uneven splits (seed currently splits everything equally)
- Charts, CSV export, receipt photos
- Real backend (e.g. Supabase) for accounts + sync
- CI: GitHub Action running `npm run build` on PRs

---

_Project handoff for Splitwiser._
