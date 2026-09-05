# Splitwiser

**Live:** https://splitwiser-xi.vercel.app · *(invitation-only — the live app opens a sign-in wall;
run it locally for a synthetic demo workspace, see below)*

Splitwiser is a private, invitation-only shared-expense app for small groups. It keeps money in integer cents, supports exact payer and owed-share accounting, preserves closed-group history, and includes an owner-only reconciliation workspace.

This public repository contains synthetic people, groups, expenses, statements, and receipts only. Production financial data and identity links live in private infrastructure and must never be committed.

## Product highlights

- Clerk accounts with restricted invitations and owner/member capabilities
- Group-scoped snapshots and server-validated financial mutations
- Account-scoped IndexedDB snapshots and an offline mutation outbox
- Equal, exact, percentage, share, and adjustment splits with exact cent totals
- Eight-second expense Undo with audited inverse mutations after sync
- Group discussion, expense comments, reactions, unread cursors, and free-tier safety caps
- Browser-only Tesseract receipt OCR with deterministic merchant, date, and total suggestions
- Authenticated private receipt attachments capped at 1 MB and 1600 px
- Simple reconciliation review plus the preserved advanced dual-ledger workspace

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router), React, TypeScript |
| Auth | Clerk, with authorized-party validation on every financial API |
| Storage | Vercel Blob (private receipts), Upstash Redis / KV (social data) |
| Offline | Account-scoped IndexedDB snapshots plus a mutation outbox |
| OCR | Tesseract, running entirely in the browser |
| Money | Integer cents throughout — no floating-point arithmetic on balances |

## Local development

```sh
npm install
npm run dev
```

Without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (or the local `VITE_` compatibility override), local development opens a synthetic owner workspace and never calls the production APIs. Production fails closed when account or private-storage configuration is missing.

## Required production configuration

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (Vercel Clerk integration)
- `CLERK_SECRET_KEY`
- `SPLITWISER_CLERK_AUTHORIZED_PARTIES`
- `SPLITWISER_OWNER_USER_ID`
- `SPLITWISER_APP_URL`
- `SPLITWISER_BLOB_READ_WRITE_TOKEN`
- `KV_REST_API_URL` and `KV_REST_API_TOKEN` (Vercel Upstash integration)

The Blob token must belong to the replacement private store. The app intentionally does not fall back to legacy variables.
Production uses only explicitly configured Clerk authorized-party origins. Deployment-protected previews also accept their own generated Vercel origin so isolated preview testing does not inherit production access.

## Verification

```sh
npm test
npm run build
```

Release verification must use an isolated synthetic preview workspace. Never run preview or browser tests against the production ledger.

## Security boundary

Every financial API requires a Clerk session and validates authorized parties. Members receive only groups they belong to and never receive account links or reconciliation data. Social data is independently group-authorized; Redis failure leaves financial features operational and makes discussion read-only. Receipts are delivered only through membership-checking Functions.

## Licence

Released under the [MIT License](LICENSE).
