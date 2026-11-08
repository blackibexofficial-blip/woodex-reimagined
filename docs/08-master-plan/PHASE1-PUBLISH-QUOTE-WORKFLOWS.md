# Phase 1 — publishing permissions and quote conversion

Local implementation, 2026-11-08. No hosted migration, production data change, or deployment was performed.

## Changes and policy

- The Pages list and editor use the actual Supabase session and the `has_cap('page.manage')` RPC to decide whether to show/enable publishing. The result is UI presentation only; `page_publish` still independently checks the capability on every request. Existing server policy is unchanged: owner **and editor** may publish; sales, finance, viewer and unassigned users may not. Demo/static retain the existing demo gate; Bagisto remains unavailable. Missing configuration, a missing session, RPC failure, and pending checks fail closed. Auth changes invalidate old requests. A server-side role change during an unchanged session may require a reload or auth event to refresh the UI; the server remains authoritative.
- Supabase Pages now loads without calling the unsupported folder API, and its folder and starter-content controls explain their limitations. Supabase page creation starts blank. Publish and draft-save errors are surfaced and busy state is cleared.
- Additive migration `20261108000016_quote_acceptance_gate.sql` replaces only `quote_convert`. Under the existing quote row lock it keeps the existing `already-converted` response, then returns `not-accepted` for any other status except accepted, before creating an order or changing stock. Authorization, payment validation, pricing, stock checks and transaction behavior are retained. The demo adapter enforces the same status gate and the Quotes UI enables conversion only for accepted quotes. The Supabase adapter translates rejection to a helpful message. UI copy now distinguishes Supabase stock deduction at conversion from demo dispatch behavior.

**Important limitation:** `accepted` is an existing staff-editable status. This change does not independently verify customer approval, restrict who may set that status beyond the existing quote permissions, establish separation of duties, freeze accepted pricing, or prevent later edits to an accepted quote. Confirm the intended business approval policy before treating this as an approval-control solution. The separate invoice-from-quote workflow was not changed.

Existing editor SEO publish checks remain client-side, and the Pages list publish toggle can bypass them. This work does not make SEO gating authoritative. Other prior audit/P0 risks remain.

## Local evidence

- `npm run test:phase1-workflows`: 28/28, synthetic PGlite database; page-capability roles and publish denial, every quote status, unchanged side effects for rejected states, negotiated amounts, conversion/replay, and rollback when a later stock line fails.
- `e2e/phase1-workflows.mjs`: 10/10 in a fresh demo browser; direct adapter rejection for all six non-accepted statuses, disabled/enabled buttons, accepted UI conversion and replay.
- `e2e/phase1-publish-permission.mjs`: 5/5 with mocked local Supabase endpoints and a real browser auth client/hook; no session, allow, deny, error, and stale allow after sign-out. This tests the hook in a small harness, not an end-to-end hosted Pages workflow.
- `npm run test:p0-safety` 32/32; `npm run test:rehearsal` 93/93; `npm run test:db -- --reset` 11/11 after 16 migrations; receipt/Turnstile helper tests 10/10; production demo browser smoke 108/108; typecheck and build pass; lint passes with 36 warnings. Build reports existing large chunks.
- Tests used the local dependency tree with temporary no-save Bun/PGlite installations; they are not proof of a frozen install, hosted Supabase equivalence, real auth, concurrent behavior, live integrations, or production readiness.

To repeat the two focused browser tests, start a local demo Vite server on 4175 and run `node e2e/phase1-workflows.mjs`. Separately start Vite on 4176 with `VITE_API_MODE=supabase VITE_SUPABASE_URL=http://127.0.0.1:4176 VITE_SUPABASE_PUBLISHABLE_KEY=test-anon-key`, then run `node e2e/phase1-publish-permission.mjs`. The latter intercepts auth and RPC requests in the browser; the URL and key are test-only. Stop the servers afterwards. Do not point these tests at a real Supabase project.

## Staging and rollback

1. Obtain approval for the accepted-status policy and confirm whether customer acceptance, internal approval, quote edits after acceptance and invoice creation need separate controls. Inventory existing non-accepted quotes and communicate the behavior change; do not update production statuses to force conversion.
2. Back up and verify a restore. Apply migrations in order, including P0 `00015` then `00016`, to an isolated staging project first. Deploy the matching app to staging. With synthetic users and products, validate real Supabase session changes, owner/editor and unauthorized roles, publish/unpublish, error handling, accepted/non-accepted conversions, replay and stock rollback. Verify concurrent conversion and role revocation against the actual hosted stack. Confirm there is no duplicate downstream stock deduction on dispatch.
3. Coordinate backend migration and frontend deployment: the database gate protects calls from older clients, but older UIs may still offer non-accepted conversions and show a generic error. The new UI before the migration is not itself server enforcement. Monitor errors and order/stock movements; production rollout requires separate authorization.
4. Roll back the app independently if necessary. Reverting the database function would remove the acceptance control: only with explicit approval and a reviewed, forward migration restoring **only** the prior `quote_convert` definition from `20261107000004_quote_convert.sql` (not its `order_submit` definition, which would undo P0). Verify grants and tests. A function rollback does not reverse already created orders, stock movements, or quote states; reconcile any such effects separately using approved procedures, never by blindly rewriting live data.
