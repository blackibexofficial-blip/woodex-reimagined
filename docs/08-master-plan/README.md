# WOODEX — Master Plan & Pending Tasks

> **Purpose:** one document that analyzes (A) the complete storefront, (B) the complete
> storefront↔admin integration, and turns (C) everything pending into a single, prioritized
> to-do list and launch roadmap.
>
> **Status legend:** `[done]` shipped & verified · `[pending]` actionable now ·
> `[blocked]` needs a user decision/secret/host · `[planned]` future phase.
>
> **Relationship to other docs:** `BLUEPRINT.md` (structure), `MASTER.md` (strategy),
> `06-launch` (checklists), `07-admin-integration` (Bagisto wiring). This doc is the action layer — it
> sequences them. Where this doc and older docs disagree, this doc wins (they were written pre-rebuild).
>
> Last updated: 2026-11-06 · branch `arena/4431a319-woodex-reimagined` (uncommitted).

---

## 0. Executive summary

**The product today is two cooperating SPAs in one repo:**

| Surface | Status | Backing |
|---|---|---|
| Storefront (`/`, 23 routes + NotFound) | **Feature-complete static SPA** — renders from `src/data/*` with zero backend | static seed data |
| Admin (`/admin`, 11 routes, lazy chunk) | **Functionally complete panel** — Categories, Analytics, Media shipped; demo DB seeded (32 categories / 148 products / 14 media assets); WOODEX re-theme applied | localStorage demo DB (`woodex.admin.db.v1`) by default; live Bagisto via 1 env var |
| Integration loop (checkout/contact/quotation → admin) | **Works offline end-to-end** (verified 16/16 E2E) | adapter seam (`getAdminApi()`) |
| Production hardening | **Not launched** — no GA4, no JSON-LD, no ErrorBoundary, sitemap is static-only, contact numbers inconsistent, Bagisto not provisioned | — |

**The single biggest unlock is not code — it's the hosting/backend decision** (standing,
pending from the owner): static cPanel hosting for the SPA (docs ready) vs full Bagisto on
shared cPanel vs Lovable Cloud. Everything else is either verified-done or small, listed below.

**Quality gates currently green:** `bun run build` (7.1s) · `bun run typecheck` (tsc --noEmit, clean)
· `bun run lint` (0 errors; 17 benign react-refresh warnings) · admin E2E 16/16 PASS · preview
serves 200 with no console/page errors.

---

## PART A — Complete storefront analysis

### A.1 Architecture

```
Browser → static SPA (Vite build → dist/)
  Vite 5 · React 18 · TS (strict, passes tsc --noEmit) · Tailwind 3 · shadcn/ui
  React Router 6 · TanStack Query · react-hook-form + zod · Recharts (admin only)
  State: CartContext + QuoteContext (localStorage) — no server dependency to render
  SEO: per-route document.title/meta via SeoContentBlock; og/twitter meta in index.html
```

- **23 storefront routes**: `/` `/shop` `/shop/:productId` `/room-packages` `/virtual-showroom`
  `/series` `/series/:seriesId` `/projects` `/projects/:projectId` `/services` `/services/:slug`
  `/b2b` `/about` `/contact` `/custom-design` `/quotation` `/showrooms` `/materials` `/warranty`
  `/blog` `/blog/:postId` `/checkout` (+ `*` NotFound).
- **Catalog**: `src/data/products.ts` (~175 products / 205 entries, PKR pricing, category→image
  map), `blogPosts.ts` (8 posts), `services.ts`, `materials.ts`, `seoContent.ts`.
  **Finding:** only ~20 category-mapped JPGs serve ~175 products — no per-product photography.
- **SEO surface**: unique title/description per route ✓; `og-cover.jpg` branded social image ✓;
  static `sitemap.xml` (15 top-level routes) + `robots.txt` ✓ — but **no JSON-LD, no canonical,
  no dynamic URLs in sitemap** (`docs/06-launch/seo-checklist.md` is unticked here).
- **Accessibility**: semantic HTML, labeled controls; **not audited** (no axe run committed).
- **Performance**: index chunk 721 kB min (191 kB gzip) — admin/charts/supabase already split and
  lazy (`AdminApp` 103 kB, charts 422 kB lazy). Docs target: <250 kB initial — **currently missed**;
  route-level lazy-loading of pages not done (only admin is lazy).
- **Resilience**: **no React ErrorBoundary** anywhere (one bad render = white screen).
- **Observability**: **no GA4, no Sentry/console-error monitoring** (deployment doc has it as `[planned]`).
- **Contact consistency**: `+92 300 1234567` / `wa.me/923001234567` everywhere **except**
  `Quotation.tsx` (wa.me/923224000768) — almost certainly one stale number; also no central
  `siteConfig` (phone/WhatsApp/email/address/hours hardcoded in ≥6 files).

### A.2 What works and is verified
`[done]` build · `[done]` typecheck · `[done]` lint 0 errors · `[done]` all routes render (preview
200) · `[done]` cart + quote-basket contexts w/ localStorage persistence · `[done]` image gallery
3D rotation · `[done]` 4× CSS-syntax warnings root-caused & fixed (dynamic Tailwind class) ·
`[done]` font loading single-path · `[done]` dead `App.css` removed.

### A.3 Storefront gaps (see Part D list)
ErrorBoundary · siteConfig consolidation · JSON-LD + canonical · dynamic sitemap · GA4/GSC ·
AVIF/WebP + per-product images · route-level code splitting · WhatsApp number fix · a11y audit ·
tests · SSR/prerender (if SEO strategy demands).

---

## PART B — Admin & integration analysis

### B.1 Architecture

```
Storefront forms ──getAdminApi()──► adapter seam (src/api/index.ts)
                                      ├─ VITE_API_MODE=demo    → demoAdminApi (localStorage seed)
                                      └─ VITE_API_MODE=bagisto → bagistoAdminApi (REST → Bagisto)
/admin/* ──self-contained SPA, own auth/layout──► same seam (never shares storefront state)
```

- **Admin routes** (`src/admin/AdminApp.tsx`): login · dashboard · analytics · products ·
  categories · orders · customers · leads · content · media · settings. Lazy chunk; 15 recharts
  surfaces; semantic WOODEX tokens only (AGENTS.md rule) · charts use literal brand hexes.
- **Auth**: demo gate (`VITE_ADMIN_EMAIL/PASSWORD`, **not a real boundary**) **or** Supabase Auth
  tab (graceful offline error verified). Vendored Supabase bundle lives in `backend/supabase/`
  (schema, edge functions, runbook, docker) — not wired to production.
- **Demo DB** (`src/api/demo/db.ts`, 614 lines): seeded from the storefront catalogue via
  `scripts/` logic; key `woodex.admin.db.v1`; reset from `/admin/settings`; persists per browser.
  Existing browsers keep stale seeds — reset once after upgrades.
- **Storefront→admin wiring (verified offline)**:
  checkout → `createOrder` (appears in `/admin/orders`, pending; customer aggregate updates) ·
  contact & quotation forms → `createLead` (appears in `/admin/leads`; bagisto path queues to a
  local outbox if the custom endpoint is absent — enquiry never lost).

### B.2 Adapter capability matrix (demo vs bagisto)

| Capability | demo | bagisto | Honest gap |
|---|---|---|---|
| Dashboard / analytics reads | ✓ seeded | ✓ read via `/sales/orders` | Bagisto: computes from orders, `/reports/*` optional |
| Products list/read/update (price/stock/featured) | ✓ full | ✓ partial (`PUT /catalog/products/{id}`) | mappers are tolerant; staff edits overwrite Bagisto live |
| Orders list/read/status | ✓ full | ✓ partial (`/sales/orders`) | status map heuristic (`closed→delivered`) |
| Customers | ✓ full | ✓ partial (`/customers/customers`) | type filter client-side |
| Leads (quote/B2B) list | ✓ full | read = paginateLocal (demo data) | **no Bagisto core table**; needs custom `woodex/leads` Laravel package or Supabase lead sink (outbox covers offline) |
| Lead status update | ✓ full | **501 by design** | custom package required |
| Categories create/edit/delete | ✓ full (in-use guard) | **501** | manage in Bagisto admin or wire mappers |
| Media library | ✓ full (upload→base64 localStorage) | **501** | Bagisto storage wiring not done |
| Settings write | ✓ demo | **501** (read-only mirror) | Bagisto owns config |
| Auth | demo gate + Supabase tab | Bagisto token (demo token ONLY for previews) | production must proxy server-side |

501 = explicit, intentional, documented — not silent failure. The GraphQL/`VITE_`-token pattern is
acceptable only for private previews; **the admin token must never ship in a public production bundle.**

### B.3 Risks / decisions embedded in the integration

1. **Demo gate is not auth.** `/admin` on a public URL with default creds = open admin panel.
2. **localStorage is not a database** — single browser, ~5–10 MB (base64 media), no multi-user.
3. **Bagisto on shared cPanel is the hard path** (Laravel + MySQL + cron + Supervisor-less workers);
   the runbook exists (`backend/README.md`) but is untested against a real cPanel box.
4. **Supabase saves the admin but adds a third moving part** (vendored bundle, RLS untested live).
5. **Order source-of-truth split**: sitemap/JSX `src/data` is seed, not truth; Bagisto becomes truth post-cutover.
6. **WhatsApp numbers unverified** and inconsistent across pages (Part A finding).

---

## PART C — Master roadmap

### Phase 0 — Repo hygiene & gates `[done]`
Build / typecheck / lint green · admin E2E 16/16 · deploy artifacts (`public/.htaccess`, sitemap,
robots, og-cover) · docs updated. Remaining: commit/PR when asked; close the stale-check loop
(`docs/06-launch` refresh).

### Phase 1 — Owner decisions (blocks everything on the critical path) `[blocked]`
1. **Hosting model**: (a) static SPA on cPanel now, Bagisto later · (b) Bagisto on cPanel staging
   this sprint · (c) Lovable Cloud/Supabase path. *Docs are written for (a)+(b).*
2. **Domain & DNS**: `woodex.pk`? `www` vs root; SSL (AutoSSL on cPanel).
3. **Contact truth**: one WhatsApp number, one phone, email, showroom address/hours — needed for
   siteConfig, schema.org, footer, wa.me links.
4. **Admin auth for production**: demo gate replaced by Supabase Auth **or** Bagisto staff login.
5. **Order/lead pipeline owner**: custom Laravel package (`woodex/leads`, `quote_requests`) **or**
   Supabase edge functions (vendored) **or** email-only interim (Resend).
6. **Product photography budget**: category-mapped or per-product shoot (175 products).

### Phase 2 — SEO & launch readiness (no backend needed) `[pending]`
siteConfig + JSON-LD (Organization/LocalBusiness/Product/Breadcrumb/SearchAction) · canonical ·
dynamic sitemap (script walking `src/data/products.ts`; prebuild) · GSC verification + sitemap
submit · GA4 + web-vitals event · AVIF/WebP pipeline · route-level lazy routes · ErrorBoundary ·
Lighthouse ≥90 / LCP <2.5s pass · a11y (axe) pass. Exit: `docs/06-launch` checklists 100% ticked.

### Phase 3 — Backend go-live `[blocked: Phase 1]`
Provision Bagisto on staging subdomain (or Supabase project) · seed catalogue CSV (script from
`src/data/products.ts`) · map category slugs · integration token (IP allowlist) · local
`VITE_API_MODE=bagisto` build · run §5 acceptance test in `backend/README.md` · wire Categories/
Media or consciously keep 501 · **leads**: implement `woodex/leads` package or Supabase sink ·
production build with `VITE_API_MODE=bagisto` · deploy `dist/` to `public_html` · rollback = rebuild
with `demo`.

### Phase 4 — Hardening & ops `[planned]`
Sentry + console-error alerting · first-party E2E committed (Playwright smoke from `/tmp/smoke`)
→ `e2e/` + CI gate · monitoring uptime (UptimeRobot) · backup/restore drill for DB · admin RBAC
via Bagisto roles (staff/manager/owner) · analytics reconciliation vs Bagisto `/reports`.

### Phase 5 — Optional evolution `[planned]`
SSR/prerender (TanStack Start / Next / vite-plugin-ssr) if organic SEO underdelivers · Urdu
locale (`hreflang`) · PWA (offline catalogue for showroom staff iPads) · image CDN · WhatsApp
Cloud API order notifications · PDF quotation automation (backend/supabase already sketches this).

---

## PART D — Master to-do list (single source)

**Owner: USER (decisions/inputs)**
- [ ] **CONFIRM THE REAL INVOICE IDENTITY.** The printed invoice (`src/components/quotation/PrintableInvoice.tsx`)
      shows **0322 4000768** and **LG 89 Zainab Tower, Model Town, Link Road, Lahore** — which is where the
      stray Quotation wa.me/923224000768 came from. Everything else uses **+92 300 1234567 / 123 Gulberg III**.
      Which is the real business? If Model Town/0322 is correct, flip it in `src/config/site.ts` (one file).
- [ ] Pick hosting model (C-Phase 1.1) and give staging/cPanel access or Lovable project ownership.
- [ ] Confirm domain, DNS, SSL, canonical host (www vs root).
- [ ] Confirm contact truth: WhatsApp, phone, email, address, hours, Google Maps pin (showrooms page).
- [ ] Decide launch analytics: GA4 property id + GSC verification method; Meta Pixel (yes/no).
- [ ] Product photography decision for 175 SKUs (shoot vs reuse category shots).
- [ ] Approve legal pages: privacy/terms/returns/warranty copy (pages exist; content sign-off needed).
- [ ] Pricing/availability source of truth once Bagisto cuts over (who owns stock edits?).

**Owner: ENGINEERING (agent can execute once unblocked)**
- [x] **P0** `src/config/site.ts` created — phone/WhatsApp/email/address/hours/canonical origin live
      ONLY there; all pages/components migrated; **Quotation.tsx wa.me/923224000768 reconciled** to
      923001234567. Verified: typecheck + build green; admin E2E 16/16; browser smoke asserts zero
      stale references. Owner must confirm the number (see D-user item: invoice identity mismatch).
- [x] **P0** React `<ErrorBoundary>` at App root (`src/main.tsx`) + branded fallback UI (WhatsApp escape
      hatch; cart-safe messaging). Caught a real crash during verification (productLd scope bug) —
      fallback rendered instead of a white screen, error logged to console for future Sentry hook.
- [x] **P0** JSON-LD + canonical live: `RouteHead` (App-wide canonical per route + Organization /
      WebSite+SearchAction / FurnitureStore LocalBusiness), per-page `JsonLd` + `seoContent.ts` builders —
      Product+Breadcrumb on `/shop/:id` (verified: PKR offer, aggregateRating), Article(Person)+Breadcrumb
      on `/blog/:postId`. Canonical host now `https://woodex.pk` (lovable.app purged from src).
- [x] **P0** `scripts/generate-sitemap.ts` (bun preload stub, mirrors mcp-snapshot) walks data modules —
      **182 URLs** (148 products, 5 series, 7 services, 6 posts + 16 static routes). Runs on every
      `bun run build`; `public/sitemap.xml` is generated, never hand-edited.
- [x] **P1** GA4 foundation — env-gated (`VITE_GA4_ID`), deferred/async, route views on SPA
      navigation via `<RouteHead />`; inert when blank. (web-vitals event still open.)
- [x] **P1** Route-level code splitting — every storefront page lazy (Index/NotFound eager).
      Entry chunk 721 kB → 403 kB min (191→112 kB gzip); Vite advisory eliminated. SPA nav verified.
- [x] **P1** Browserslist DB updated (caniuse-lite) — warning gone.
- [x] **P1** WebP pipeline — all 93 images converted (q80, stripped): src/assets 8.76→6.01 MB,
      dist/assets 11→8.2 MB. Single-format WebP chosen (universal since 2021; no `<picture>` dual-serve
      needed); imports rewritten; demo-DB media names aligned.
- [ ] **P1** Resolve admin token story for production (server proxy or Bagisto staff session) —
      removes the browser-secret anti-pattern.
- [ ] **P2** Wire Bagisto Categories/Media adapters (mappers + storage) OR retire with docs pointer.
- [ ] **P2** Leads backend: implement `woodex/leads` (schema in docs/07) **or** Supabase lead sink +
      outbox flush; update admin to show synced badge.
- [ ] **P2** Commit E2E smoke to `e2e/` (Playwright) + `bun run e2e`; add CI workflow (lint/typecheck/build/e2e).
- [ ] **P2** a11y pass: axe on 10 key routes; fix contrast/labels; alt-text lint.
- [ ] **P2** Refresh `docs/06-launch/*` checklists to the static+Bagisto reality (drop Lovable-only steps).
- [ ] **P3** Progressive WS/SSR evaluation for SEO; Urdu hreflang; PWA offline catalogue.
- [ ] **P3** Sentry wiring (`VITE_SENTRY_DSN`, releases via build hash).
- [ ] **P3** Admin: RBAC roles (demo: owner/staff/readonly) + audit log of admin mutations (demo DB).
- [ ] Housekeeping: commit current work; convert `/tmp/smoke/*.cjs` into repo E2E; remove `console.log`
      remnants if any; `.nvmrc`/`.node-version` note (bun-first is fine, document it).

**Owner: CONTENT (user + agent can assist)**
- [ ] Real product photography; blog backlog (8 posts → 12); service pages final copy; showroom
      photos; team bios; certifications (ISO?); client logos for B2B trust band.

---

## PART E — Risks & blockers

| # | Risk | Impact | Mitigation | Owner |
|---|---|---|---|---|
| R1 | Hosting decision slips | Launch stalls | Phase 1 is the only blocker; everything else parallelizable | user |
| R2 | Bagisto on shared cPanel underdelivers | Orders/leads never live | Timebox staging to 1 sprint; fall back to (a) static + email leads via Resend | user+eng |
| R3 | Demo admin creds leaked on public preview | Defacement | Rotate `VITE_ADMIN_*` on every shared preview; demo gate warning in README ✓ | eng |
| R4 | localStorage demo DB mistaken for production | Data loss | README/docs mark it clearly; Reset button warns | done ✓ |
| R5 | SEO SPA limitation (no SSR) | Organic traffic disappoints | Dynamic sitemap + JSON-LD first; SSR only if GSC shows crawl gaps after 60 days | eng |
| R6 | Placeholder phone/wa goes live | Lost enquiries | siteConfig (P0) + owner sign-off | user+eng |
| R7 | Bagisto version drift (2.x mapper mismatch) | Orders misread | Staging acceptance test before cutover; demo mode stays the safe default | eng |
| R8 | **`.env` committed to git (2c80945, "Enabled Lovable Cloud backend")** — it holds VITE_SUPABASE_* pointing at the scaffolder's Lovable Cloud project (URL + publishable key). Publishable keys are public-by-design, but this project is NOT WOODEX's and prod builds silently depend on it | Wrong backend, data to a third party, credential-in-history | Rotate in Supabase dashboard if the project is yours; provision the vendored `backend/supabase` for WOODEX instead; `git rm --cached .env` + push (key stays in history — rotate rather than rewrite); `.gitignore` now covers `.env`; prod builds: blank `VITE_SUPABASE_*` (hides the Supabase tab) or set your own values | user |
| R9 | Invisible fallback: admin "Sign in with Supabase" appears live but targets the Lovable Cloud sandbox | False sense of a live backend | Blank vars or set WOODEX's own; keep demo gate for previews | user |

---

## Appendix

- **Commands**: `bun run dev | build | typecheck | lint | preview` · `bunx playwright` (after P2).
- **Demo DB key**: `woodex.admin.db.v1` · reset via `/admin/settings`.
- **Env**: see `.env.example`; canonical reader `src/config/env.ts` (nothing else may touch `import.meta.env`).
- **Deploy (static, today)**: `bun run build` → upload `dist/` → `.htaccess` ships in build →
  verify deep links → `robots.txt`/`sitemap.xml` live → GSC.
- **Bagisto path**: `docs/07-admin-integration` + `backend/README.md` (cPanel runbook, untested).
- **Supabase path**: `backend/supabase/README.md` (vendored; not deployed).
- **Smoke evidence**: `/tmp/smoke/admin-upgrade.cjs` (16 checks — to be committed per P2).
