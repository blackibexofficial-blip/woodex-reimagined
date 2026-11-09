# WOODEX Technical Audit — MASTER SYSTEM PROMPT Phase 0

| | |
|---|---|
| Date | 2026-11-08 |
| Branch / commit | `arena/b97909f3-woodex-reimagined` @ `608f966` (PR #28) |
| Audited against | `WOODEX BUSINESS OS — MASTER SYSTEM PROMPT v1.0` (repo copy: this file's scope) |
| Live site | https://woodex-reimagined.vercel.app/ (SPA on Vercel, demo-mode by default) |
| Status | **Phase 0 only.** No application code changed. **No implementation phase approved yet.** |

> Verification legend — every claim below was re-checked against this checkout on 2026-11-08:
> `tsc --noEmit` rc=0 · `vite build` ✓ (18.2s, chunk-size warning) · e2e **94/94** and axe **0/53** (run on this exact tree during the preceding PR-D work) · CI green on PR #28 (3m4s + Vercel ✓). Hosted DB: **unreachable from this sandbox; zero migrations verified applied** — all hosted claims are "design intent", not "tested".

---

## 1. Stack as-found (not as-expected)

| Layer | Reality | Evidence |
|---|---|---|
| Frontend | React 18 + **Vite 5** SPA + TypeScript (NOT Next.js). shadcn/ui (~50 Radix primitives), Tailwind, react-router v6, react-query v5, recharts, react-hook-form | `package.json`, `src/App.tsx` |
| Visual builder | **Puck** (`@puckeditor/core` 0.24) — real three-panel editor (Elements/Library/Inspector/Canvas) with section library, JSON-LD widgets, rich-text sanitizer | `src/pages-builder/**` (2,490 LOC) |
| Backend | **Supabase** (Postgres 15 + Edge Functions + Storage + Auth). 14 committed SQL migrations (`20261107000001..20261108000014`), migration `0001` (convergence) = 688 lines, RLS **enabled dynamically on every table** + explicit policies; 14 SECURITY DEFINER, capability-checked RPCs; `bootstrap_owner` revoked from `anon/authenticated` | `supabase/migrations/*` (verified: `alter table public.%I enable row level security`, 115 policy/function blocks) |
| Adapter trio | `getAdminApi()` selects **demo** (5,909-line localStorage DB, default) / **Bagisto REST** (1,169-line admin adapter) / **hosted Supabase** (4,122-line, hardened RPC client) | `src/api/{types.ts,demo/db.ts,bagisto/admin.ts,supabase.ts}`, `src/config/env.ts` |
| Hosting | Vercel SPA, `vercel.json` rewrites `/(.*)` → `index.html`. Static `public/robots.txt`, build-generated `sitemap.xml` (urls still target `woodex.pk`) | — |
| CI/QA | typecheck · eslint · build · **e2e 94/94** (`e2e/run.sh` + `smoke.mjs`, 578 lines) · **axe 0/53 routes** (`a11y.mjs`) · offline pglite rehearsals (`npm run test:rehearsal`, suite stories 41/41 → 66/66 across slices) | `.github/workflows`, `e2e/` |
| AI | **None.** No LLM dependency, no embeddings, no knowledge store, no agent service. Live chat exists (PR-B) with canned offline-capture flow | `package.json`, `src/components/chat/*` |
| WhatsApp | `wa.me` deep links only (storefront/admin). `backend/supabase/functions/whatsapp-campaign-sender` exists in-tree but is **not wired to the admin runtime and has never been tested** | `backend/` |

## 2. Architecture as-found

```
Storefront (24 public routes, lazy chunks)          Admin (56 pages, 43 sidebar items — 5 groups)
/  /shop(+:id)  /series(+:id)  /projects(+:id)      Overview · Commerce · Purchasing · Engage · System
/services(+:slug)  /b2b  /contact  /checkout …      shared AdminApi ←  demo | bagisto | supabase
/blog(+:id)  /warranty  /materials  /quotation …              │
        │                                                /lab/:slug  ← Puck draft preview
        └────────────────── one SPA, one design system ────────┘
```

Data rules verified: adapters never leak demo paths into supabase mode without a capability check; hosted writes go through RPCs with `my_role()/has_cap()`; `updateLead` rejects PR-D fields the 0001 schema can't hold **before** writing; Bagisto CRM = 501 stubs. Identity journey (enquiry→lead→customer→quote→order→invoice) is real but split: lead→customer link, quote→invoice conversion (`quote_convert`-class RPCs) are RPCs; **order stages are validated statuses, not a full ERP workflow engine**.

## 3. Findings by audit category (as required by the MASTER prompt §2.2)

| Category | Assessment | Key issues |
|---|---|---|
| Architecture | DB-agnostic SPA with clean adapter boundary; admin chunk isolated from storefront; builder separated. Technical debt: hand-written 8,979-line `supabase/functions/mcp/index.ts` (never committed by convention); `dist/` 13 MB; flat-by-file adapters (5,909 LOC demo DB) | P2-4, P3-3 |
| Frontend | Consistent shadcn/Tailwind; route-level code splitting (LCP-friendly home eager). Some duplication (9 taxonomy pages ~3,474 LOC — approved consolidation pending). Chunk-size warning (no `manualChunks`) | P2-1, P3-1 |
| Backend | EF surface intentionally minimal (lead-capture, order-submit, order-tracking, admin-bootstrap, mcp). Demo adapter missing nothing e2e exercises; Bagisto stubs honest (501) | P1-3 |
| Database | Best-documented layer: immutable migrations, `0001` convergence + 13 additive slices, RLS dynamic-enable, capability matrix rehearsed (viewer denied 42501 etc.). **Hosted has applied NONE of 0001–0014** (per `CONVERT-DRAFT-ORDER-DESIGN.md`) | P1-2, P2-3 |
| Security | Client-side demo gate **only** in demo mode (documented NOT a boundary); supabase mode = Supabase Auth + RLS + RPCs. Secrets server-side only (service-role in EF Deno.env). Richtext sanitized (`sanitizeRichHtml`). Anon RPC deny matrix rehearsed ✓ | P1-1, P2-2, P3-2 |
| CMS | Puck builder: elements → kit → section library → JSON document; draft preview at `/lab/:slug`; published pages render on public routes via same schema (`Pages`/`PageEditor`/`SeoPanel`). Sanitizer present. **Revision history UI / atomic publish RPCs (`page_rpcs` migration `0002` exists — 0001..0014 none applied hosted)** | P2-5 |
| E-commerce | Products/catalog/cart/checkout all demo-real and e2e-tested. **Payment = COD or Bank Transfer only** (type-level `easypaisa/jazzcash/card` exist, UI exposes only the two manual methods). No gateway, no webhook handler | P1-4 |
| CRM | Leads full parity (PR-A/D, kanban DnD) incl. lens filters; chat inbox offline-capable; tasks; import desk; merge review (PR-C pending); campaigns = UI shell without sender | P1-5 |
| AI | **Absent entirely** — no LLM key, knowledge base, retrieval, scoring, handover, or evals | P1-6 |
| SEO | Titles/descriptions + `JsonLd`/canonical `RouteHead`; `robots.txt` ✓; sitemap generated at build from demo seed (**still `woodex.pk` URLs — mismatch with the vercel.app host it will ship on if served as-is**); structured data partial (org/product/Article manual), LocalBusiness schema absent | P2-6, P3-4 |
| Performance | Route-level lazy chunks; home eager for LCP; images from `public/images` (no responsive pipeline/CDN transforms on this host); no font-display audit done; **no lab numbers recorded in-repo (no Lighthouse CI)** | P2-7 |
| Deployment | Vercel SPA; CI = typecheck/lint/build/e2e/a11y (≈3–4 min). **Zero hosted-path CI** (VITE_API_MODE=supabase never exercised in CI). Preview = demo. No staging env wired. Rollback = redeploy previous Vercel deployment (instant), but DB already at risk if migrations were applied hosted — none have been | P1-2, P2-8 |

## 4. Issue register (path · root cause · impact · proposed fix · verify)

**P0 — none found in committed code.** (No service-role keys in client bundles; no open anon writes; hosted runtime simply not present.) If/when hosted is flipped on, RLS misconfig becomes a P0 candidate — must be rehearsed on staging first.

| ID | Sev | Path / evidence | Root cause | Impact | Proposed fix | Verify |
|---|---|---|---|---|---|---|
| P1-1 | P1 | `VITE_API_MODE` default `demo`; `env.ts`; banner on every admin screen | Hosted never wired; preview is the product right now | "Production readiness" claims are false today | Owner-gated staging flip: set env on Vercel staging, apply 0001–0014, import catalogue, smoke the flip | staging checklist §8 |
| P1-2 | P1 | `supabase/migrations/*` — **none applied hosted** | No hosted execution yet | "Supabase backend" exists only on paper + pglite | Apply in order on staging → rehearsal against staging → flip preview | `npm run test:db` + staging |
| P1-3 | P1 | `src/api/bagisto/admin.ts` | Bagisto CRM depth intentionally stubbed | Live-Bagisto mode is catalog-read mostly | keep 501s (documented); do not gold-plate until Bagisto is actually selected | n/a |
| P1-4 | P1 | `src/pages/Checkout.tsx` (COD/bank); `PaymentMethod` type has easypaisa/jazzcash/card | No gateway merchant agreement | "Online payments" = out of scope until a provider is approved | pick provider (e.g. JazzCash/Easypaisa/Bank) → `order-submit` webhook verify server-side → status machine | test checkout E2E on staging + webhook signature replay |
| P1-5 | P1 | `src/admin/pages/Campaigns.tsx`; `backend/.../whatsapp-campaign-sender` | Sender never deployed; consent store absent | Campaign UI would send nothing; risk of non-compliant blasts if wired blindly | deploy behind own flag; opt-out list; rate cap; dry-run audit | canary send to owner phones only |
| P1-6 | P1 | entire PART 10 | Never built | AI sales agent = 0% | see roadmap Phase F-A4 | spec + build on approval |
| P2-1 | P2 | 9 taxonomy pages (3,474 LOC); sidebar 43 items | organically grown CRUD pages | maintenance drag, panel noise | **Approved consolidation** (`/admin/taxonomy` + collapsible groups) — blocked only on PR #27/#28 merging | e2e 94→96 ✓ |
| P2-2 | P2 | `/admin` demo gate (`auth.tsx`) | intentional preview gate | guessed creds on shared previews | set `VITE_ADMIN_PASSWORD` on staging; keep gate demo-only | manual |
| P2-3 | P2 | migration `0001` RLS enable ✓, policies for identity tables only partially visible | policies for all business tables live via RPC-only | fine BUT unverifiable without hosted | run hosted deny matrix post-flip | staging rehearsal |
| P2-4 | P2 | `supabase/functions/mcp/index.ts` 8,979 LOC generated | codegen, not reviewed line-by-line | audit surface, review burden | split or regenerate from source spec; git-track it deliberately (it is intentionally untracked today) | review + lint |
| P2-5 | P2 | `src/pages-builder/*`, `supabase/migrations/0002_page_rpcs.sql` | revisions/publish RPCs exist but UI never surfaced honestly | builder "publish" story is good enough for demo; not enterprise draft/revision UX | audit Puck save→publish loop against `page_rpcs` on staging before calling it done | staging manual pass |
| P2-6 | P2 | `public/sitemap.xml` (`woodex.pk` URLs) | generator reads seed data, not the deploy host | wrong URLs if deployed as-is | feed `VITE_SITE_URL` into generator | regenerate + inspect |
| P2-7 | P2 | no Lighthouse/CWV evidence in-repo | never measured | perf claims unowned | add lighthouse-ci (info-only) on preview | CI artifact |
| P2-8 | P2 | CI has no supabase-mode job | staging doesn't exist | adapter regressions unseen until manual flip | add mode job once staging exists | CI green on staging PR |
| P3-1 | P3 | bundle warning | no `manualChunks` | minor | tune `build.rollupOptions` | build log |
| P3-2 | P3 | `dist/` committed by nothing — good; `public/sitemap.xml`/`mcp/index.ts` churn | build regenerates both | diff noise | keep checkout convention; add CI guard | git status clean after build |
| P3-3 | P3 | 5,909-LOC `demo/db.ts` | grows with every PR-D | slow grep, merge conflicts | split by domain when next touched | n/a |
| P3-4 | P3 | sitemap/robots host mismatch on preview | canonical defaults | SEO confusion | env-driven canonical (`RouteHead`) | inspect head |
| P3-5 | P3 | no unit tests (only e2e/a11y/rehearsals) | harness choice | logic drift | add vitest for `src/lib/*` | CI |
| P3-6 | P3 | MASTER-TODO ledger = this project's "IMPLEMENTATION_PROGRESS" | doc sprawl risk (Part 20 wants 16 docs) | none | keep one ledger; declare the other 15 as pending deliverables | review |

## 5. Program coverage vs the pasted MASTER prompt (honest "exists?" matrix)

Legend: ✅ real & exercised · ◐ partial / demo-backed · ✗ absent

**Part 4 — Admin & Command Center:** Dashboard KPIs ✅ (demo aggregates; **not live Supabase metrics until P1-1 flip**) · Analytics ✅ · Notifications ✗ central · Activity feed ◐ (order events RPCs) · **Finance invoices ✅ (manual payments)** · Expenses ✗ (`Import.tsx` is the only "expense" hit) · **CRM Leads ✅ / Customers ◐ / Quotes ✅ (print PDFs; no server PDF lib) / Tasks ✅** · WhatsApp ◐ links · Live chat ✅ (PR-B, offline capture) · Appointments ✗ (visits only) · Campaigns ◐ · **ERP Projects ✅ (actuals+cost codes, migration 0013) / Production stages ◐ (status pipeline) / QC ✗ formal / Delivery ◐ (zones+draft orders)** · **Inventory ✅ (movements ledger + reserved-on-draft) / Transfers ✅ / Suppliers ✅ / POs ✅ / Reorder alerts ◐ (low-stock counts)** · Purchasing ✅ · **Commerce: Products ✅ variants-via-options ◐ / Collections ✅ / Orders ✅ (§7.7 status machine) / Returns+Claims+Exchanges ✅ (0009)** · **Content: Blog ✅ / Services ✅ / Pages(builder) ✅◐ / Media ✅ (usage checks? delete-guard exists) / SEO panel ✅ / Redirects ✗** · **System: Settings ✅ / Import ✅ (PR-A) / Settings→Team ✅ (PR-D) / Roles(hosted) ◐ / Audit logs ◐**

**Part 5 — Builder:** 3-panel editor ✅ · DnD ✅ (Puck) · Widget library ✅ (blocks) · Section library ✅ · Global styles ◐ (tokens via theme, no full Global-Styles tab) · Revisions ◐ · Publish-to-live ◐ (verify §2.2 CMS) · **Revision restore ✗ UI** · **Scheduling/unpublish ✗** · Export/import sections ◐ · Keyboard DnD ◐ unverified · HTML sanitization ✅ (depth unverified)

**Part 6 — Storefront:** dynamic homepage ✅ (Homepage builder) · Header/footer managed ◐ (settings, not full menu manager) · Category/PDLs ✅ · **Customer accounts ✗** (no auth for storefront buyers) · Order tracking ✅ (`order-tracking` EF) · Wishlist ✗ · **Search ✅ client-side** · Comparison ✗ · Mobile ✓ (responsive pass done in earlier waves)

**Part 7 — Commerce:** Quote engine ✅ (customer + admin, validity, print) · **Quote→Order convert ◐ (0010 reprice preview; wired in Drafts)** · Revision history ✗ · **Invoices ✅ / Payments manual ✅ / Refund flow ◐** · Returns ✅

**Part 8 — Blog/Services/Projects:** ✅ all three, dynamic routes, admin CRUD, SEO panel. **Portfolio before/after gallery ◐**

**Part 9 — Media:** library ✅ (folders? no; usage tracking? delete-guard yes) · WebP/AVIF ✗ (no pipeline)

**Part 10 — AI:** ✗ everything (P1-6)

**Part 11 — Bookings:** ✗ (site **visits** exist; no staff-availability/double-booking system)

**Part 13 — DB/RLS:** ✅ rehearsed offline; ✗ hosted unverified

**Part 14 — SEO/AIO:** ✅ titles/canonical/JSON-LD/robots · ◐ LocalBusiness/FAQ schema · ✗ Search-console or GA4 **verified** (GA4 wired via `src/lib/analytics.ts`, untested by anyone)

**Part 16 — Integrations:** ✗ every external integration is unverified/disconnected (GA4 ✓ config-only · Payment gateway ✗ · WhatsApp ✗ · LLM ✗ · Search Console config ✗ · Meta Pixel ✗)

## 6. Baseline protection record (per §2.3)

- Branch `arena/b97909f3-woodex-reimagined`, HEAD `608f966`, **clean tree** (reset to pushed PR #28 after a sandbox snapshot rewind; byte-identity of every file verified vs origin).
- Production untouched: no deploy triggered, no migration applied, no env changed. Preview server is a local `vite preview` of the PR-D build.
- Rollback: revert this docs commit or drop the docs file — zero runtime effect.
- `dist/` is gitignored; `sitemap.xml`/`mcp/index.ts` churn convention preserved.

## 7. Roadmap — what gets built, in what order, gated on what

Non-negotiable sequencing (one phase = one PR, no merging without your word):

| Step | Work | Gate |
|---|---|---|
| 0 | **This audit** (docs-only) | — |
| 1 | **Merge PR #27 (PR-C) + PR #28 (PR-D)** — both green | owner word |
| 2 | **Taxonomy consolidation** (approved): `/admin/taxonomy` + drawer editors + collapsible sidebar groups | owner word (approved in principle 2026-11-08) |
| 3 | **PR-E — Furniture A4 quotation print** (§7.1 V4) | owner prints one A4 & confirms |
| 4 | **Go-Live gate (P1-1/P1-2):** staging Supabase, apply 0001→0014, seed/import, flip preview, hosted smoke suite | owner words + staging creds |
| 5 | **P1-6 / AI phase (optional, biggest delta):** Woodex AI sales agent — retrieval from catalogue, qualification, handover into the existing chat inbox, evals. Needs an LLM provider key + knowledge review pass | owner decision + provider approval |
| 6 | Remaining gaps per §5 in dependency order (accounts → customer auth; payments gateway; campaigns sender; notification center; bookings; QC module; revisions UI) | per-phase approval |

**Nothing beyond Step 0 begins without your approval.** The audit deliberately does not fix P1/P2 items; it classifies and proposes.

## 8. Staging flip checklist (when you say go)

1. Create staging Supabase project; apply `0001`→`0014` in order; verify `bootstrap_owner` + deny matrix on staging.
2. Set `VITE_API_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` on a Vercel staging deployment (NOT production yet).
3. Import catalogue via `/admin/import` (PR-A desk); reconcile row counts (categories 30+, series, brands).
4. Smoke: sign in (real Supabase Auth), leads lens filters (PR-D), chat capture round-trip, order submit with rate limits, one quote→convert.
5. Only then promote to production env vars; keep rollback = flip env back to demo.

## 9. Honest completion report (this turn)

- **Completed:** this audit; tree verified; build green; docs-only diff.
- **Not done (by design):** every implementation phase; hosted verification (impossible from sandbox); AI; payments; customer auth; campaigns; bookings; central notifications; 15 of the Part-20 docs.
- **Tests:** baseline re-verified (build rc=0, tsc rc=0; e2e/a11y green on byte-identical tree). **No new tests — nothing changed.**
- **Known risk:** PR #28 now carries this document; it is docs-only and zero runtime, but flag it to yourself when merging.
- **Required from owner:** words on Steps 1–5; staging credentials; provider approvals; acceptance signatures.

*Prepared by the implementation agent. Every statement verifiable against this checkout; anything else is labeled "unverified — needs staging".*
