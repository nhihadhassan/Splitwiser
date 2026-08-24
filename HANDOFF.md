# Splitwiser Handoff

## Current architecture

The Vite/React client uses Clerk for invitation-only identity. Vercel Functions verify session tokens and authorized parties. A versioned `WorkspaceEnvelopeV3` is stored in a replacement private Vercel Blob store; account links, mutation IDs, revision, audit events, and receipt usage remain server-only. Upstash Redis stores social items, reactions, read cursors, and internal request counters.

The source tree contains synthetic fixtures only. Real production state must enter a release through the encrypted migration procedure, never through Git or preview fixtures.

## Critical invariants

- All money and split totals are integer cents.
- Paid totals and owed totals each equal the expense amount.
- Members receive only their groups and never reconciliation or other identity links.
- Closed groups are read-only while lifecycle history remains preserved.
- Mutation IDs are idempotent and writes use Blob ETag preconditions.
- Signing out clears that account's cached financial snapshot and outbox.
- Redis failure cannot block financial reads or writes.
- Receipt OCR is local and suggestions are never saved without confirmation.

## Latest bug sweep (2026-08-23)

- Trip closure now checks the same simplified or raw repayment model shown in the group UI, includes recorded payments, and explicitly confirms when unfinished reconciliation will be locked.
- Rejected financial mutations are validated before React renders them, so form and lifecycle errors remain recoverable instead of blanking the app.
- Closed-group expenses and payments remain read-only from group and friend surfaces, and server authorization checks both the source and destination group of expense updates.
- Group edits reject reversed trip dates and preserve members who have financial history. Reopening percentage/share splits preserves their exact saved cent allocation.
- Restored offline changes restart automatically after the authenticated cloud session loads instead of remaining stuck at “Saving…” without reaching the mutation endpoint. The status dialog reports the pending count and provides clear save, retry, refresh, and conflict actions.
- Large reconciliation mutations use a compressed transport and a bounded server decoder so statement-backed changes fit within the online save limit. Failed requests stop after one attempt instead of entering a retry loop, and the cloud dialog is portaled above every page layer with the shared focus trap.
- The verified local gate is 16 test files / 110 tests, a production build, desktop and 320 px route checks, and WCAG A/AA browser audits with zero reported violations. Signed-in production financial writes still require an authenticated owner/member verification session.

## Release sequence

1. Provision Clerk restricted sign-up, the replacement private Blob store, and a no-card Upstash Free database.
2. Configure preview variables and migrate only synthetic data to an isolated preview workspace.
3. Complete owner/member authorization, group-boundary, offline, discussion, receipt, accessibility, and mobile checks.
4. Freeze production writes and export the authoritative ledger to the encrypted backup location.
5. Migrate it into a new `WorkspaceEnvelopeV3` and compare record counts, totals, settlements, reconciliation matches, exceptions, audit events, and checksums with the preservation manifest.
6. Publish the sanitized root history to GitHub `main` with lease protection and remove remote branches that retain sensitive ancestry.
7. Deploy that exact `main` commit to production and verify signed-out denial, owner data, member scoping, expense, social, receipt, and reconciliation flows.
8. Confirm local `main`, `origin/main`, the production deployment commit, and the canonical domain agree.
9. Only then remove the legacy Blob object/token and every pre-auth deployment, and verify old API and deployment URLs expose no data.

## Operations

Social writes stop before the Upstash free allowance is endangered. Receipt metadata and storage usage are enforced server-side. Production intentionally fails closed if Clerk or the replacement private Blob token is absent. Do not restore the former fixed-key endpoint.
