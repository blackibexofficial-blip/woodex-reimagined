# WOODEX — Premium Office & Home Furniture (Pakistan)

Storefront + admin for WOODEX, a Lahore-based furniture manufacturer/retailer.
Static-first React SPA today; **adapter-ready for a Bagisto (Laravel) commerce backend**.

- **Stack**: Vite 5 · React 18 · TypeScript · Tailwind 3 · shadcn/ui · React Router 6 · TanStack Query · Recharts · Supabase (optional) · MCP server (`src/lib/mcp`)
- **Package manager**: Bun (npm partially broken in the sandbox — see AGENTS.md / docs)
- **Current mode**: storefront renders from `src/data/*` (no backend required); `/admin` runs on a seeded localStorage demo DB and flips to a live Bagisto with one env var.

## Quick start

```bash
bun install
bun run dev        # http://localhost:8080
```

Other scripts: `bun run build` (regenerates `sitemap.xml` from `src/data/*`, then production build → `dist/`) · `bun run typecheck` (strict `tsc --noEmit` gate — clean) · `bun run preview` (serve the build) · `bun run lint` (0 errors; warnings only from fast-refresh hints) · `bun run e2e` (puppeteer smoke — **59 checks**: admin, SEO, lazy routes, vault/coverage asserts) · `bun run e2e:a11y` (axe-core scan, **47 routes** — 7 public + 40 demo-gated admin routes; report-only locally, CI enforces critical/serious = 0)

**Toolchain note:** CI installs Bun via `oven-sh/setup-bun@v2` (unpinned) and runs `bun install --frozen-lockfile`; there is no `.node-version` pin by design. The e2e (`npm run e2e`) and rehearsal (`npm run test:rehearsal`) suites are plain Node scripts (Node 20+ works); sitemap regeneration is the only Bun-dependent build step — if `bun` is unavailable, `npx vite build` still produces a working `dist/` (sitemap.xml then stays at its committed state).

### Admin panel preview — `/admin`

```
http://localhost:8080/admin
Email:    admin@woodex.pk      (VITE_ADMIN_EMAIL)
Password: woodex-admin         (VITE_ADMIN_PASSWORD)
# Set VITE_ADMIN_DEMO_HINT=1 to also print these on the login screen (local dev only, default off).
```

Dashboard · Products (price/stock edit + CSV export) · Orders (status pipeline) · Customers ·
Quote & B2B lead pipeline (tel/mailto actions, est. values) · Content hub · Settings
(store profile, integration status, demo-DB reset).

⚠️ Demo gate only — not an auth boundary. Production admin/RBAC lives in the Bagisto backend
(`backend/`). Change the defaults in `.env` for any shared preview.

### End-to-end loop (storefront → admin, works offline)

1. `/checkout` — place an order → it lands in `/admin/orders` instantly (status *Pending*), and the customer aggregate updates in `/admin/customers`.
2. `/quotation` or `/contact` — submit the form → the enquiry lands in `/admin/leads` (status *New*, with basket/value if a quote).
3. Demo DB persists per browser (`woodex.admin.db.v1`); reset it from `/admin/settings` → *Reset demo data*.

## Environment

Copy `.env.example` → `.env`. Key variables (all consumed via `src/config/env.ts` — nothing
else touches `import.meta.env`):

| Var | Purpose |
|---|---|
| `VITE_API_MODE` | `demo` (default, localStorage) · `bagisto` (live REST) |
| `VITE_BAGISTO_API_URL` / `VITE_BAGISTO_STOREFRONT_KEY` / `VITE_BAGISTO_ADMIN_TOKEN` | Bagisto connection — see `docs/07-admin-integration` |
| `VITE_ADMIN_EMAIL` / `VITE_ADMIN_PASSWORD` | Demo `/admin` gate |
| `VITE_ADMIN_DEMO_HINT` | `=1` prints the demo credentials on the login screen (local only, default off) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` | Supabase project — enables optional "Sign in with Supabase" on `/admin/login`; schema + edge functions vendored in `backend/supabase/` |
| `VITE_GA4_ID` | GA4 measurement id (`G-XXXXXXX`) — optional; blank = analytics fully disabled (no script, no network). Page views tracked on SPA route changes |

## Project layout

```
src/
  admin/            # /admin — self-contained panel (auth, layout, pages)
  api/              # data adapters: types + demo (localStorage) + bagisto (REST) + factory
  components/       # storefront components (layout/, ui/ shadcn, product/, …)
  config/env.ts     # typed, validated environment config (single source)
  contexts/         # Cart / Quote contexts (localStorage)
  data/             # static catalogue & content (products, services, materials, blogPosts, …)
  integrations/     # supabase client (generated, unused at runtime today)
  pages/            # storefront routes (/, /shop, /product/:id? → /shop/:productId, …)
  lib/mcp/          # MCP server for the Lovable MCP flow (see AGENTS.md)
backend/            # Bagisto/Laravel deployment bundle + cPanel runbook + optional Docker
backend/supabase/   # imported Supabase backend: 15 migrations, 36 table defs, 32 edge functions (schema source of truth)
docs/               # 01 discovery … 06 launch, 07 admin-integration (Bagisto)
scripts/            # mcp-snapshot, asset stubbing
```

## Backend / admin connection

- **What runs today**: everything above works offline; `/admin` demo persists to
  `localStorage` (`woodex.admin.db.v1`). Product counts in /admin/categories use the
  catalogue's `category` + `subcategory` ids; reset the demo DB from `/admin/settings`
  after pulling schema-seed changes.
- **Two live-backend routes**: (a) `backend/README.md` — Bagisto 2.x on cPanel (shared
  hosting, the chosen path) or Docker (VPS fallback), `bagisto-api` REST + Swagger,
  catalogue CSV import, token hardening; (b) `backend/supabase/README.md` — the Supabase
  schema + edge functions imported from the reference module (the backend the reference
  admin dashboard was built against), for teams preferring Postgres + Auth + Storage.
- **Seamless switch**: set `VITE_API_MODE=bagisto` + the Bagisto URL/keys and rebuild — zero UI changes.
  Field mapping lives in `src/api/bagisto/admin.ts`; the leads module is the one custom piece
  (custom Laravel package or Supabase — see `docs/07-admin-integration` §6).

## Documentation

- `backend/README.md` — server runbook (requirements checklist, cPanel steps, cron, SSL, troubleshooting)
- `backend/supabase/README.md` — Supabase deploy guide (migrations, edge functions, first admin, slug note)
- `docs/07-admin-integration/README.md` — storefront ↔ Bagisto contract, security model, go-live checklist
- `docs/BLUEPRINT.md` · `docs/MASTER.md` · `docs/design.md` — original product/design blueprint
- `docs/01-discovery … 06-launch` — phase docs from the original build
- `docs/08-master-plan/README.md` — master plan: storefront + admin analysis, pending-task list, launch roadmap

## Deployment (storefront)

Static build → `dist/` → upload `dist/` contents to cPanel `public_html`. The SPA fallback,
security headers, immutable caching for hashed assets and gzip all ship in this repo as
`public/.htaccess` (auto-copied into every build). Deep links like `/shop` and `/quotation` will
work out of the box on Apache/cPanel; on Nginx replicate the `location / { try_files $uri /index.html; }`
rule yourself (backend/README §8). Social cards use `public/og-cover.jpg`; `robots.txt` +
`sitemap.xml` (generated from `src/data/*` on every `bun run build` by `scripts/generate-sitemap.ts` — committed, don't hand-edit) ships too.
Lovable publishing also works (the project was originally scaffolded there):
lovable.dev → Share → Publish.
