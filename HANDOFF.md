# Splitwiser — Handoff

A complete recreation of the **Splitwise** expense-splitting app as a single-page
web app. React + TypeScript + Vite, with all data persisted in the browser
(`localStorage`) — no backend, no database, no accounts.

- **Repo:** https://github.com/nhihadhassan/Splitwiser
- **Working branch:** `claude/splitwise-app-recreation-o7qscn`
- **Pull request:** https://github.com/nhihadhassan/Splitwiser/pull/1 (open, draft)
- **Status:** feature-complete, builds clean, smoke-tested end-to-end in headless Chromium

---

## Current state at a glance

| Thing | State |
| --- | --- |
| App code | Complete and working on the PR branch |
| `npm run build` | Passes (strict TypeScript + Vite production build) |
| End-to-end smoke test | Passed (dashboard, groups, all 4 split methods, settle up, activity) |
| CI | None configured in the repo |
| `main` branch | **Empty placeholder commit only** — see "Gotchas" below |
| Deployment | Not deployed yet — see "Deploying" below |

---

## Running it locally (~2 min)

```bash
git clone https://github.com/nhihadhassan/Splitwiser.git
cd Splitwiser
git checkout claude/splitwise-app-recreation-o7qscn
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # type-check (tsc -b) + production build to dist/
npm run preview      # serve the production build locally
```

The app opens with **seeded demo data** (an "Apartment 4B" home group, a
"Lisbon Trip" group, four friends, eight expenses, one settlement) so it looks
alive immediately. **All expenses → Reset demo data** restores the original state.

### What to click to exercise everything

1. **Dashboard** — total balance + "you owe" / "you are owed" columns
2. **Add an expense** (orange button) — the split tabs cover Equally, Exact
   amounts, Percentages, and Shares, each with live validation
   ("$90.00 of $100.00 entered — $10.00 left", "n% of 100%")
3. **Lisbon Trip group** — right rail shows per-member balances and
   "Suggested repayments" (the simplify-debts algorithm); the ✓ next to a
   suggestion records that payment prefilled
4. **Any expense row** — click to expand the per-person breakdown, edit, delete
5. **A friend** in the sidebar — pairwise balance + "Settle up" prefilled with
   the exact amount owed; the balance flips to "all settled up"
6. **Recent activity** — chronological feed of every expense and payment

---

## Deploying to the web

The app is a static SPA (Vite → `dist/`), so any static host works. Vercel is
easiest.

### Option A — Import the repo on Vercel (recommended)

1. Go to https://vercel.com/new
2. Import **nhihadhassan/Splitwiser** (connect the GitHub app if prompted)
3. Vercel auto-detects Vite; defaults are correct (build `npm run build`,
   output directory `dist`). Click **Deploy**.

> **Important:** `main` is currently an empty placeholder commit — the real app
> lives on the PR branch. So either **merge PR #1 into `main` first** (then the
> import deploys the real app and auto-redeploys on every push), **or** set the
> production branch to `claude/splitwise-app-recreation-o7qscn` in the import
> screen.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel login
vercel deploy --prod
```

(This could not be run from the Claude Code cloud session because the CLI login
flow needs a browser and no `VERCEL_TOKEN` was configured. Setting
`VERCEL_TOKEN` in the environment would let an agent deploy non-interactively.)

### Any other static host

`npm run build`, then serve the `dist/` folder (Netlify, GitHub Pages, S3, etc.).
Routing uses `HashRouter`, so no server-side rewrite rules are needed.

---

## Architecture

| Path | What it is |
| --- | --- |
| `src/types.ts` | Data model: people, groups, expenses (splits in cents), settlements |
| `src/store.tsx` | React context + reducer; persisted to `localStorage` on every change |
| `src/seed.ts` | Demo data the app starts with, plus the avatar color palette |
| `src/utils/money.ts` | Integer-cent math: parse, format, fair equal/weighted splitting |
| `src/utils/balances.ts` | Pairwise debt ledger, net balances, debt simplification |
| `src/utils/categories.ts` | Expense categories + emoji icons |
| `src/utils/dates.ts` | Date/month formatting and relative time |
| `src/components/` | `Layout`, `Avatar`, `Modal`, `ExpenseList`, and the Add-Expense / Settle-Up / Add-Friend / Group modals |
| `src/pages/` | `Dashboard`, `GroupPage`, `FriendPage`, `ActivityPage`, `AllExpensesPage` |
| `src/App.tsx` | Routes (HashRouter) |
| `src/main.tsx` | Entry point |

### How balances work (the core logic)

Everything derives from `src/utils/balances.ts`, recomputed on each render:

1. **Each expense** becomes pairwise debts: every participant's net position is
   `paid − owed`; debtors (net < 0) owe creditors (net > 0), allocated
   proportionally.
2. **Settlements** reduce debts (paying someone cancels what you owe them).
3. **Net balances** collapse the pairwise ledger to one number per person
   (positive = is owed money).
4. **Simplify debts** runs a greedy max-creditor / max-debtor match over net
   balances to produce the minimum set of payments — the same behavior
   Splitwise's "simplify debts" gives. Toggleable per group; when off, the raw
   pairwise debts are shown instead.

All money is stored as **integer cents**. Equal and weighted splits distribute
leftover cents (largest-remainder) so every expense always sums exactly to its
total — no rounding drift.

---

## Gotchas / things a successor should know

- **`main` is a fabricated empty root commit.** The repository had no commits
  and no default branch when the app was created, so a PR needs a base. An empty
  "Initial commit" was pushed as `main` and merged into the feature branch to
  give PR #1 a valid base. Merging the PR puts the full app on `main`.
- **No backend by design.** State is per-browser in `localStorage` under the key
  `splitwiser-state-v1`. Clearing site data resets the app. There are no user
  accounts and no sync across devices.
- **`playwright-core` is a devDependency** used only for the local smoke test; it
  is not part of the app bundle.
- **Routing uses `HashRouter`** (URLs look like `/#/groups/…`) so the app works
  on any static host with zero rewrite configuration.

---

## Possible next steps (not started)

- Merge PR #1 and deploy (see above)
- Multi-currency support (amounts are currently USD-formatted)
- Comments / receipt photos on expenses
- Charts of spending by category or over time
- Export to CSV
- A real backend (e.g. Supabase) for accounts and cross-device sync
- CI: a GitHub Action running `npm run build` on PRs

---

_Generated as a project handoff for Splitwiser._
