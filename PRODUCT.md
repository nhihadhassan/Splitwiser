# Splitwiser Product

## Promise

Splitwiser gives a small, trusted group one calm place to record shared costs, understand who owes whom, talk about expenses, and settle up without exposing private ledger data.

## Roles

- **Owner:** invites members, manages all groups and people, moderates discussion, and uses reconciliation.
- **Member:** sees and edits ordinary financial items only within their groups and participates in those discussions.

Friends may exist as unclaimed person records. An owner invitation binds exactly one Clerk account to exactly one existing person. Duplicate claims are rejected.

## Main experience

Mobile navigation is Overview, Groups, Add, Activity, and More. Desktop navigation is Overview, Groups, Activity, and owner-only Reconcile. Historical `/all` and `/settlements` links remain compatible.

Expense entry starts with description, amount, people, payer, and Save. Exact amounts, percentages, shares, date, category, notes, and receipt tools stay under progressive disclosure. Payer amounts and owed shares are separate and must each total the expense exactly in cents.

Each group has Overview, Expenses, and one Discussion surface. Closed groups preserve their ledger and discussion as read-only. Activity combines expenses, payments, and financial changes with group and type filters.

## Reliability

Financial edits are optimistic and recoverable offline. The server applies idempotent mutation commands against a versioned private workspace using Blob preconditions. Conflicting offline edits require an explicit choice; the app never silently overwrites another device.

Discussion is allowed to degrade. If Redis is unavailable or the internal free-tier cap is reached, financial work continues and social writes stop.

## Receipts

OCR runs locally in the browser. Merchant, date, and total are suggestions that require confirmation. Subtotal, tax, tip, change, tender, and payment lines are excluded from total ranking. Raw OCR text stays client-side. Optional attachments are resized, converted, capped, privately uploaded, and served only after membership checks.

## Non-goals

No public profiles, followers, direct messages, paid AI receipt service, bank data for members, or duplicate group-comment surfaces.
