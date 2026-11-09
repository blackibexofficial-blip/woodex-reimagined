# Phase 1 — P0 safety slice

Date: 2026-11-08. Status: **implemented and tested locally, not deployed or verified on hosted Supabase**. Phase 1 as a whole remains open. This document supplements the Phase 0 audit, which remains the historical baseline.

## Changes in this slice

- `supabase/migrations/20261108000015_phase1_p0_safety.sql` is an additive migration. It does not rewrite existing page, project or order rows. It removes the public raw page/block policies and the public execution grant on `page_snapshot`; `published_page(slug)` returns only the saved published snapshot. Authenticated users with `page.manage` continue to use the existing draft tables and editor RPCs.
- The same migration restricts direct `order_submit` execution to `service_role`, used by the existing Edge Function. It denies browser roles even when they supply their own limiter key. The Edge Function's response now uses a tested allowlist and does not return the customer's name, contact, address or city on either initial submission or replay. New browser references use `crypto.randomUUID()`. This is **not** an end-to-end proof of replay authorization or retry behavior; the reference is still created per `createOrder` call and receipt totals/items remain visible to a party that knows a reference.
- The raw `projects` table is staff-readable only (`page.manage`, `crm.manage` or `finance.manage`); `published_projects()` exposes a narrow, typed allowlist for active published portfolio records and excludes practice, BOQ, private notes and nested unknown fields. The storefront uses that projection in Supabase mode. An empty hosted result no longer falls back to seeded sample projects. Existing demo mode is unchanged. Owners must confirm all allowed portfolio fields and client/testimonial information are approved for publication; public fields may themselves contain sensitive text if staff enter it there.
- Page save, publish, unpublish and restore serialize on the page row. New history snapshots contain blocks. Legacy publish histories with nested `published_snapshot.blocks` can be restored. Old versions lacking recoverable blocks are refused before deletion, preserving the current draft; the editor surfaces the failure. This does **not** reconstruct missing historical content. Existing versions are not rewritten.
- `src/lib/usePages.ts` preserves editor draft preview and uses the published projection for non-editor Supabase users. The public `published_page` lookup uses the published snapshot's slug, not a later draft slug. This does not make the builder control `/` or other live routes.
- Public RPC TypeScript shapes are hand-added in `src/integrations/supabase/types.ts`; regenerate and compare types against the staged schema before deployment.

## Local verification

Tests used local dependencies (Node 22, npm; locally installed Bun and PGlite), never hosted data:

| Check | Result |
|---|---|
| `npm run test:p0-safety` | 32/32, fresh in-memory PGlite and synthetic data. Tests role access, published projection, old/new revision restoration, loss-safe failure, trusted service RPC and one stock decrement on replay. |
| `node --test supabase/functions/_shared/order-response.test.mjs supabase/functions/_shared/turnstile.test.mjs` | 10/10; isolated helpers and mocked Turnstile, not deployed Edge Functions. |
| `npm run test:rehearsal` | 93/93 on a fresh PGlite replay including migration 0015. |
| `npm run test:db -- --reset` | 11/11 after applying 15 migrations and seed to an ignored local test DB. `--reset` affects only `.local-db/woodex-test`. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed, 0 errors, 36 warnings. |
| `npm run build` with local Bun on PATH | Passed with existing large-chunk warning. Generated tracked sitemap/MCP changes were restored. |
| `npm run e2e` | 108/108; demo-mode smoke, not Supabase integration. |
| `npm run e2e:a11y -- --fail` | 0 automated axe violations across 54 demo routes; not manual accessibility certification. |
| `npm run test:payments`, `npm run test:ai-eval` | 15/15 and 19/19 helper/fixture checks, not hosted providers. |

## Required staging and release gates

1. Obtain explicit approval for hosted changes; identify the authoritative Supabase project and inspect its actual migration history, grants, functions, policies, data shape, Storage configuration and existing callers. Do not assume the root migrations match production. Confirm no integrations call raw `order_submit`, `page_snapshot`, `projects`, `pages` or `page_blocks` publicly; they will lose that access.
2. Take and **verify** a restorable backup of the database and relevant Storage, including the current policy/function/grant definitions. Rehearse restore on an isolated project and agree a maintenance window/rollback owner. This repo change does not itself create or verify a hosted backup.
3. Review the public portfolio field allowlist and data, `published_snapshot` shape and legacy page versions; classify potentially incomplete historical snapshots. Review the trusted proxy's actual `x-forwarded-for` behavior and the decision to fail open when Turnstile is unconfigured. Configure approved WAF/rate limits and Turnstile before relying on the function for production abuse protection.
4. On staging only, coordinate the new Edge Function, SQL migration, and SPA deployment. Deploying SQL without the new SPA can make anonymous public portfolio/preview reads fail; deploying only the SPA without SQL can continue exposing the old raw policies. Until both are active, treat the original exposures as open. Test with independent signed-out, viewer, sales, editor, owner and service-role sessions; never paste service keys in chat.
5. Confirm real PostgREST policies and function ownership, all public/role deny cases, published-only previews after draft edits and slug changes, legacy restore behavior, clean authenticated editor work, public portfolio rendering and consent, valid and invalid checkout, response PII, replay/concurrency and inventory rollback using synthetic data. Run real Edge Function/Turnstile tests, verify receipt UI, accessible error states and responsive behavior. The current Supabase UI publish gate (`isOwnerSession`) is still demo-only and must be addressed in a later P1 slice.
6. Reconcile logs and stock, test monitoring and rollback, then request separate authorization for any production rollout. No hosted migration, Edge Function deployment or production change was performed in this slice.

## Rollback considerations

A blind application or schema rollback could reintroduce the exact draft/project disclosure and direct order abuse fixed here. First disable affected public endpoints or enforce an equivalent server-side protection at the gateway, then restore the specific prior function definitions, grants and RLS policies from the verified pre-migration schema backup under an approved procedure. Revert the SPA and Edge Function as a coordinated release; an old SPA expects raw project/page reads, and an old order function returns replay contact data. Do not delete tables, overwrite orders, truncate storage, or restore an entire production database merely to undo this migration. Rehearse the chosen rollback against staging and compare policies, application behavior and post-backup writes before any production action.

## Remaining security and functional work

- Hosted exposure/actual policy state is unknown until checked; history of already disclosed content cannot be reversed by a migration.
- Turnstile unconfigured behavior remains fail-open and proxy IP headers may be spoofable depending on hosting. Production abuse prevention still needs an approved fail-closed/WAF design and real tests.
- Hosted AI staff authorization, rate limiting and grounding; broad authenticated reads; demo auth and browser token risks remain unresolved. See S4–S7 in `docs/WOODEX_TECHNICAL_AUDIT.md`.
- Full anonymous order replay authorization, strong request-bound idempotency across retries and prevention of receipt item/total leakage require further design; receipt PII removal is a mitigation, not proof of complete privacy.
- Supabase publish UI, actual live builder routes, structured quote intake, quote-approval enforcement, hosted chat, server-enforced QC, and all other P1/P2 items remain open. No module or full implementation phase is declared complete.
