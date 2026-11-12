- MCP tools read `src/lib/mcp/data.json` (regenerate with `bun --preload ./scripts/stub-assets.ts scripts/mcp-snapshot.ts`) — the MCP bundle cannot import frontend image assets.

## Admin panel / Bagisto integration (Phase 1+)
- `/admin` — self-contained demo admin (auth gate via VITE_ADMIN_EMAIL/PASSWORD, demo data persisted at localStorage key woodex.admin.db.v1). Optional "Sign in with Supabase" tab when VITE_SUPABASE_URL+key are set (see backend/supabase/README.md). Admin bundle is lazy-loaded (separate chunk) — keep storefront imports clean of admin code.
- `/admin` theme = WOODEX semantic tokens only: white cards on `secondary` canvas, white sidebar, signature-green `accent`/`hon-green*` brand color, `primary` dark reserved for the login brand panel. NEVER hardcode amber/stone/hex in admin files — see docs/03-design-system/colors.md. Chart series uses brand greens; categorical status/payment hues are intentionally exempt.
- Admin pages: Dashboard, Analytics, Products, Categories (CRUD, in-use delete guard), Orders, Customers, Leads, Content, Media (demo-local, 2 MB cap), Settings.
- src/api AdminApi contract: demo adapter (localStorage) is authoritative; new capabilities must implement both adapters (bagisto adapter throws 501 with guidance where the backend has no native equivalent).
- Catalogue parent categories (category) and subcategory ids both drive product counts and the in-use delete guard.
- Storefront ↔ backend seam is src/api (adapter factory) + src/config/env.ts; never read import.meta.env elsewhere.
- Backend deployment: Bagisto on cPanel/VPS → `backend/` (runbook + Docker reference; integration contract in docs/07-admin-integration/); Supabase alternative → `backend/supabase/` (migrations + edge functions imported from the reference module). Keep both paths working.
- Do not ship VITE_BAGISTO_ADMIN_TOKEN in public builds; see docs/07-admin-integration §5.
- Contact & location facts (phone/WhatsApp/email/address/hours) live ONLY in `src/config/site.ts` — import `site` / `waLink` / `absUrl` from there; never hardcode numbers, emails, addresses or the canonical origin in pages/components. Canonical + JSON-LD are injected by `src/components/RouteHead.tsx` on every route; page-specific schema (Product/Article/Breadcrumb/FAQ) via `JsonLd` + `src/data/seoContent.ts` builders. `sitemap.xml` is generated from data by `scripts/generate-sitemap.ts` (runs on `bun run build`) — don't hand-edit it.

## WOODEX 2030 program (read order for any 2030 work)
1. `docs/2030/12-DECISION-LOG.md` — decisions (repo-specific deltas: `docs/2030/ADAPTATION-FIT-GAP.md`).
2. `docs/2030/01-MASTER-PRD.md` — product contract; `08-AGENT-OPERATING-INSTRUCTIONS.md` — agent rules (binding for this repo's 2030 work).
3. `docs/2030/ADAPTATION-FIT-GAP.md` — how the package maps onto THIS codebase (Estate rows 1–11, decision deltas owed by the owner).
4. `docs/WOODEX_TECHNICAL_AUDIT.md` — engineering audit (hosted state = UNVERIFIED; demo default).
Evidence honesty rule: hosted claims stay UNVERIFIED until the staging flip (docs/08-master-plan/STAGING-FLIP-RUNBOOK.md, owner-run). No brand/IA/token changes without the owner's word — see ADAPTATION-FIT-GAP.md §5.
Gates: `npm run test:nav` (sidebar registry ↔ AdminApp routes) · `npm run test:print` (A4 print documents) · `npm run test:rehearsal` · `npm run e2e` · `node e2e/a11y.mjs --fail`.
