# 09 — Deployment report

## 2026-11-09 — first hosted deployment (frontend only)

PR #29 was merged into `main` (`72badcc`) after CI (`build-and-test`) and the Vercel preview both
passed. The Vercel production deployment for that commit reports **success**. This ships the
**static frontend only**, in demo mode: no Supabase migration, RPC, Edge Function, storage policy,
database row or provider credential was touched, and no hosted verification of anything in
`docs/07` follows from it. Candidates 00018–00027 remain unapplied.

Before the merge the branch had to be reconciled with `main`, which had advanced 190 commits (mostly
the Lovable bot) since the branch was cut. One file conflicted, `src/integrations/supabase/types.ts`:
upstream had regenerated it with empty `Tables`/`Functions` stubs, which would erase the typed schema
the app and the new RPCs depend on, so the branch's generated definition was kept. Migration
numbering did not collide (00001–00027 stay unique). On the merged tree: typecheck clean, lint 0
errors, PGlite suites green (p0 32, workflows 28, qc-records 60, handover 37, claims 30, register 16),
Bun build exit 0, demo smoke 110/110.

Still true: no staging project exists, no backup/restore has been rehearsed, no RLS or grant has been
verified on a hosted database, and nothing below has been satisfied.

Status **blocked / preparation only**, 2026-11-08. No production site, hosted Supabase/Bagisto provider, real records, migration, credentials or deployment were accessed or modified during this continuation. No commit, push, PR update or merge was performed. `arena/6bd5a1db-woodex-reimagined` is the fixed Arena branch; the different branch name in the user-supplied prompt cannot be used for this session.

PR #29 was last known open at `7d5658a571b5985f9e7a755dc136c9bafe869f88`; the large later local working-tree changes and this audit are not in that commit. Past GitHub/Vercel checks applied to that prior head only; deployment status and present check results have not been rechecked here. A local demo preview may run on port 8080; it uses synthetic/browser-local data, is not a shared production environment, and demo login is not production authentication.

## Release prerequisites — all pending

1. Owner identifies an isolated staging instance, deployment owners, backend source of truth, synthetic accounts/data and approves exact candidate diff. Review `.env`/bundle exposure privately without copying any values to reports.
2. Inventory staging migration history, function owners/grants, all permissive RLS and storage policies, deployed function revisions, host rewrites and flags; test and verify backup **and restore**. Do not assume staging matches repository.
3. Review and sequence app, SQL/RPC and Edge changes, notably 00015–00027 (00021–00027 are unapplied production/QC/order-link/handover/claim/register candidates; the staged apply/rollback runbook is `docs/08-master-plan/PHASE1-STAGING-APPLY-CHECKLIST.md`), quote rules and lead v2 compatibility. An old lead function may insert partial text while the new UI reports uncertainty; do not blindly retry. Confirm privacy/retention and older-client behavior.
4. Restrict staging at the host, send server-side noindex headers, and keep `/p` experimental flag off on production. `/lab` is not a certified published-only route. Never use publicly accessible staging to show private draft content.
5. Use synthetic independent sessions to run the role, storage, draft/preview/publish/revert, order/lead, idempotency, concurrency, identity, provider sandbox and operational recovery tests listed in 07. Verify actual owner contacts. Keep hosted AI disabled.
6. Stop on unauthorized visibility, schema drift, incomplete rollback, failed security/concurrency, secret exposure or uncertain provider outcome. Do not blindly revert to older permissive SQL or functions. Require documented approval and separate explicit authorization before production.

Detailed staging and rollback steps: `docs/08-master-plan/PHASE1-STAGING-RELEASE-CHECKLIST.md` and each component's Phase 1 report. No result here establishes readiness, a successful deployment or an approved production release.
