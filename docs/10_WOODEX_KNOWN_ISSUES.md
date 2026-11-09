# 10 — Known issues and release blockers

Status: **open unless explicitly scoped below**, 2026-11-08. See `03_WOODEX_BUGS_AND_ROOT_CAUSES.md` for evidence and regression links.

## P0 / security and integrity

- Hosted RLS, function grants, staff access, direct order RPC, published/draft and project privacy have not been verified. Local 00015/00020 fixes are not deployed proof.
- Order retries/replays are not securely payload-bound/idempotent; lost responses can create duplicates. Cart snapshot is not an atomic cross-tab protocol.
- Client creation/linking for site visits can be partially successful; full customer-to-warranty identity and safe deduplication are not established.
- No verified hosted backup/restore, deployment/rollback rehearsal or production approval. Do not alter production records for tests.

## P1 / core workflows

- Builder ProductRail's broken route was repaired locally and synthetic test passes; it still uses seed data rather than a verified live catalogue, and the experimental public preflight excludes the block. Hosted/editor workflow remains unverified.
- Analytics is an explicitly incomplete first-page sample, not full business totals. Dashboard figures remain backend-dependent; actual financial definitions, dates/currency and complete aggregates are not approved or reconciled. Bagisto metrics/series unsupported where labelled unavailable.
- The page-editor local safety checks do not guard every sidebar/SPA navigation, other browser tabs or independent editor writes; server-side revision conflict handling is still required. Updated full demo E2E passes 110/110 and targeted synthetic tests pass; none prove hosted concurrency.
- Generic CMS public publishing remains opt-in, limited to 13 blocks and lacks real hosted preview/access, transactional collision prevention, cache invalidation and verified HTTP/SEO. Published props/theme, including visually hidden content, are public.
- Quote requests remain unstructured text; lead v2 requires coordinated deploy/privacy approval. Existing legacy clients can truncate. Quote status accepted is staff-editable, not independent customer approval.
- Bagisto endpoint contracts and local outbox delivery remain unverified; live Supabase chat methods are unwired. No customer account route exists.
- Storage policies, media references, production/QC approval and accounting/settlement integrity remain incomplete or unverified.
- Production/QC separation of duties is **implemented locally, not deployed**: the person who last changed the production stages cannot record the pass (server RPC `42501`, demo store the same message), and the demo ships a second QC seat so the flow can be demonstrated. Still undecided/unverified: whether inspection needs its own role rather than `page.manage`, audit retention, database-owner tamper resistance, and the operational cost at single-staff sites (a job whose stages were just edited waits for a second capability holder before it can dispatch). Nothing is deployed.
- Production audit rows and inspection records are append-only for application roles only. A database owner/service-role path can still alter them, and no off-box retention or review cadence exists.
- Partial/legacy production payloads are repaired in the browser with blank values; unknown stage keys and extra production fields are dropped when the job is saved. Candidate 00023 would reject new malformed shapes server-side, but it is unapplied, tolerates unchanged legacy rows while QC/edits are pending, and allows unknown dispatch keys as plain values. Review the repair notice and the audit trail before relying on such rows.
- Delivery/installation handover and warranty are **implemented locally, not deployed** (candidate 00025): the sequence QC pass → dispatch → delivery → installation → warranty is enforced server-side, warranty state is derived from the installation date, and every action is audited. Missing: proof photos/signature, scheduling, customer-facing warranty documents, and any hosted verification. Claims exist as of candidate 00026 but carry no cost/replacement decision, no inventory movement and no customer-facing tracking. Candidate 00027 lists jobs with a warranty or a claim (derived state, days left, expiring-soon flag, open-claim counts) at `/admin/warranty-register`, but there are no reminders, SLA targets, assignment or export. A mis-typed year is bounded to 2000+ rather than validated against the real job.
- Order→production linkage is **implemented locally, not deployed** (candidate 00024): one job per order, link/unlink audited, cancelled orders refused, and the orders page shows progress/QC. Still open: dispatch does not change the order status (owner decision), a job cannot yet span multiple orders, unlink/cancel does not stop a job automatically, and nothing is verified on Supabase.
- Revision checks exist for the practice save path only (candidate 00022, unapplied). Other project fields and the demo store are not protected against concurrent edits, and SPA router navigation is still not blocked.

## P2 / integrations and readiness

- Hosted AI must remain disabled until trusted grounding, authorization, privacy, retention, monitoring and provider spending controls are approved and tested.
- Booking lacks demonstrated double-booking protection and reminder workflow; installation and full warranty handoff are incomplete.
- Sitemap is seed-based, metadata is client-side SPA behavior, actual crawl/indexing/redirect handling unknown. Lighthouse/Core Web Vitals not measured; build warns of large bundles.
- Manual accessibility, mobile, real network failures, deployment monitoring and recovery remain unverified.

**Important:** historical tests are local/synthetic and do not establish that any live customer, finance or security workflow is safe. See 02 for 265 item triage and 07 for actual pass/fail evidence.
