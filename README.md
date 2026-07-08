# Splitwiser

A complete recreation of the **Splitwise** expense-splitting app as a single-page web app.
Built with React, TypeScript, and Vite; all data is stored locally in your browser
(`localStorage`), so it works with zero backend setup.

![Splitwiser](public/favicon.svg)

## Features

- **Dashboard** — total balance, who you owe, and who owes you at a glance
- **Groups** — trip / home / couple / other groups with their own expense feeds,
  per-member balances, and settings
- **Friends** — per-friend balance, shared expense history, and shared groups
- **Add expenses** with four split methods:
  - **Equally** (choose who's in)
  - **Exact amounts** (must add up to the total, live validation)
  - **Percentages** (must add up to 100%)
  - **Shares** (proportional weights)
- **Settle up** — record cash payments between any two people, with one-click
  prefill from suggested repayments
- **Simplify debts** — the classic Splitwise algorithm that reduces a group's
  debts to the minimum set of payments (toggleable per group)
- **Recent activity** feed of everything that happened
- **All expenses** view with month grouping, expandable per-person breakdowns,
  edit and delete
- **Categories** with icons (food, rent, travel, utilities, …)
- Exact **integer-cent arithmetic** — equal splits distribute leftover cents so
  every expense always sums exactly to its total
- Seeded **demo data** (two groups, four friends) so the app opens looking alive;
  reset it any time from the All expenses page

## Running

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run preview  # serve the production build
```

## Architecture

| Path | What it is |
| --- | --- |
| `src/types.ts` | Data model: people, groups, expenses (splits in cents), settlements |
| `src/store.tsx` | React context + reducer, persisted to `localStorage` |
| `src/seed.ts` | Demo data the app starts with |
| `src/utils/money.ts` | Integer-cent money math: parsing, formatting, fair splitting |
| `src/utils/balances.ts` | Pairwise debt ledger, net balances, debt simplification |
| `src/pages/` | Dashboard, group, friend, activity, and all-expenses pages |
| `src/components/` | Layout, expense list, and the add-expense / settle-up / group / friend modals |

Balances are computed from first principles on every render: each expense turns
into pairwise debts (participants owe the payer their share), settlements reduce
them, and the "simplify debts" option runs a greedy max-creditor/max-debtor
matching over net balances — the same behavior Splitwise uses.
