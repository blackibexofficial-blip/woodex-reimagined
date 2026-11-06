# WOODEX Backend — Bagisto + (optional) TailAdmin

This folder is the **deployment bundle + runbook** for the commerce backend that will power
the Woodex storefront (this repo). It converts the static catalogue into a real,
admin-managed e-commerce store.

> ⚠️ **Honesty note:** this sandbox has no PHP/MySQL and no network access to Packagist,
> so nothing under `backend/` has been executed here. It is a vetted deployment guide and
> reference configuration. Always rehearse on a staging subdomain before going live.
> Think of it as the SAR (software architecture runbook), not tested scripts.

---

## 1. Target architecture

```
                 ┌────────────────────────── shared hosting (cPanel) ──────────────────────────┐
 visitors ──►    │  public_html                  (storefront: static build of this repo)      │
                 │  admin.woodex.pk  ──►  Bagisto (Laravel 11/12 app; document root → /public) │
 staff    ──►    │       └── /api/shop/*    → storefront API  (X-STOREFRONT-KEY)               │
                 │       └── /api/admin/*   → back-office API (Bearer integration token)       │
                 └─────────────────────────────────────────────────────────────────────────────┘
                                ▲                                    ▲
        VITE_API_MODE=bagisto    │  (same SPA, rebuilt)               │
        VITE_BAGISTO_API_URL ────┘                                    │
                          React admin at /admin (this repo) ───────────┘
```

- **Storefront** — static `vite build` output uploaded to `public_html` (or `woodex.pk` subdomain root).
- **Bagisto** — the engine: products, orders, customers, inventory, pricing rules, CMS pages,
  promotions, reports. Ships with its own complete admin panel (web UI). Recommend keeping it as
  the staff CMS of record.
- **React admin at `/admin`** (this repo) — the custom Woodex back-office built in Phase 1,
  speaking to the same Bagisto via its Admin REST API.
- **TailAdmin Laravel** (https://github.com/TailAdmin/tailadmin-laravel) — optional bespoke
  dashboard shell (Laravel + Tailwind, free/open-source) if you ever want a fully custom staff
  UI beyond the two above. It is **not** required and does not replace Bagisto. To run it you
  need a second Laravel app on the same host hitting the same Admin API — see §6.

---

## 2. What Bagisto gives you out of the box

Products & categories, inventory, customer groups & pricing, cart/checkout, orders with full
lifecycle, invoices, shipments, refunds, promotions & coupons, CMS pages, blogs (extension),
multi-language/multi-store/multi-currency, abandoned cart reminders, reports, Roles & ACL,
Integration tokens (for the API). It replaces the demo dataset 1:1 for products/orders/customers.

---

## 3. Requirements checklist (shared hosting)

Bagisto 2.x needs roughly the same as Laravel 11/12:

| Requirement | Minimum | How to check on cPanel |
|---|---|---|
| PHP | **8.2+ (8.3 recommended)** | MultiPHP Manager → select 8.3 for the admin subdomain |
| PHP extensions | bcmath, ctype, curl, dom, fileinfo, gd, intl, json, mbstring, openssl, pdo_mysql, tokenizer, xml, zip | MultiPHP INI / `php -m` over SSH |
| MySQL | 8.0+ (MariaDB 10.6+ ok) | MySQL Databases / phpMyAdmin |
| Composer | 2.x | `composer -V` over SSH (or upload `composer.phar`) |
| SSH access | **Strongly required** | cPanel → "SSH Access" / ask your host |
| Node.js | 18+ (only if building Bagisto's own Vite assets) | "Setup Node.js App" (many shared hosts lack it → build locally, upload `public/build`) |
| RAM | 1 GB+ PHP CLI memory for composer | Set `memory_limit=-1` in MultiPHP INI editor |
| HTTPS | Required (mixed content will break the SPA) | cPanel → SSL/TLS Status → "Run AutoSSL" |

**If your host cannot meet these (no SSH, PHP < 8.2, no MySQL 8), Bagisto will not install.**
Fallbacks in order of preference: (1) small VPS (Hetzner/Contabo/DigitalOcean $5–6/mo) with
`backend/docker-compose.yml`; (2) Laravel Forge/Ploi managed deploy; (3) keep demo mode.

---

## 4. Deploy runbook — cPanel / shared hosting

Assumes domain `woodex.pk` and a subdomain `admin.woodex.pk` for the backend.

### 4.0 Docker alternative (VPS — recommended if your host can't run PHP 8.3)
```bash
cd backend
composer create-project bagisto/bagisto bagisto          # creates the Bagisto app (gitignored)
cp bagisto.env.example bagisto/.env                       # fill DB_* + APP_URL=http://<vps-ip>:8090
docker compose up -d --build                              # web (PHP 8.3 + Apache) + MySQL 8
docker compose exec web php artisan bagisto:install       # migrate + seed + admin user
docker compose exec web php artisan bagisto-api-platform:install
```
Then follow §4.3–§4.6 below for the API keys and storefront wiring. The compose file is a
starting point — put a real reverse proxy (Caddy/Nginx + Let's Encrypt) in front of port 8090
for production and never expose MySQL publicly.

### 4.1 Prepare
1. cPanel → **MySQL Databases**: create DB `woodex_bagisto`, user `woodex_bagisto`, strong password; note credentials.
2. cPanel → **Domains → Subdomains**: create `admin.woodex.pk` with document root set to
   `/home/<cpanel-user>/bagisto/public` (create the `bagisto` folder first via File Manager,
   or leave the default root and fix it in §4.3). **Document root must be `<bagisto>/public`, never the project root** — otherwise your `.env` and source code are web-accessible.
3. cPanel → **SSL/TLS Status** → enable AutoSSL for the subdomain.

### 4.2 Install Bagisto (SSH path — preferred)
```bash
ssh <cpanel-user>@<server>
cd /home/<cpanel-user>
php -v                       # must be 8.2/8.3
composer create-project bagisto/bagisto bagisto
cd bagisto
nano .env                    # see backend/bagisto.env.example — set DB_*, APP_URL=https://admin.woodex.pk
php artisan bagisto:install  # migrates DB, seeds channels/locales/admin; interactive prompts
php artisan storage:link     # links storage/app/public → public/storage (product images!)
php artisan key:generate
```
The installer asks for admin email/password — use the same credentials you plan to give staff.

### 4.3 Install the REST API (bagisto-api)
```bash
cd /home/<cpanel-user>/bagisto
composer require bagisto/bagisto-api
php artisan bagisto-api-platform:install
```
Then in the Bagisto web admin (`https://admin.woodex.pk/admin`):
1. **Configuration → API → Integration → Module Settings** → set **Enabled = yes** (otherwise the Integration menu stays hidden).
2. **Settings → API → Storefront Key** — generate the public key (looks like `pk_storefront_…`). Used by the website for read-only catalogue calls.
3. **Settings → Integration → Create** — name "Woodex Storefront (React admin)", assign an
   administrator, permission mode "All" (or Custom), optional IP allowlist + expiry, save as a
   draft then **activate**. Copy `id|token`.

### 4.4 Cron + housekeeping
cPanel → **Cron Jobs**, once per minute:
```
* * * * * cd /home/<cpanel-user>/bagisto && /usr/local/bin/php artisan schedule:run >> /dev/null 2>&1
```
File permissions: `storage/` and `bootstrap/cache/` writable (775, group `nobody` if required by host).
If `php artisan storage:link` fails (no SSH / symlink blocked), set `FILESYSTEM_DISK=local` in
`.env` **or** copy `storage/app/public` → `public/storage` after each deploy (and after image uploads).

### 4.5 Build & upload the storefront (this repo)
Locally (not on the host):
```bash
cp .env .env.production.local
# edit: VITE_API_MODE=bagisto
#       VITE_BAGISTO_API_URL=https://admin.woodex.pk
#       VITE_BAGISTO_STOREFRONT_KEY=pk_storefront_…
#       (do NOT ship VITE_BAGISTO_ADMIN_TOKEN to a public site — see §7)
bun install && bun run build
```
Upload `dist/*` to `public_html/` (or the storefront document root). SPA deep-link support
ships in this repo as `public/.htaccess` — SPA rewrite + security headers + caching/gzip,
copied into every `dist/` build. No manual docroot edits needed on Apache/cPanel. Nginx
equivalent in Troubleshooting.

### 4.6 Point the React admin at it
Same build step: with `VITE_API_MODE=bagisto` the `/admin` panel reads/writes Bagisto live.
Orders flow: storefront checkout (Bagisto Shop API) → Bagisto DB → React admin (Admin API) → staff fulfil.

### 4.7 Seed the catalogue
Export product data from `src/data/products.ts` and import into Bagisto (Admin → Catalog →
Products → Mass Import, CSV). Stock levels, categories (map `executive-tables` → Bagisto category
slugs) and prices transfer with it. Rehearse the import on staging first.

---

## 5. First login & acceptance test
1. `https://woodex.pk` loads the storefront; products render from `src/data` (until §4.6 rebuild).
2. `https://admin.woodex.pk/admin` → staff login → dashboard shows your seeded catalogue.
3. `curl -H "X-STOREFRONT-KEY: pk_storefront_…" https://admin.woodex.pk/api/shop/products?per_page=1` → JSON with products.
4. `curl -H "Authorization: Bearer <id>|<token>" https://admin.woodex.pk/api/admin/catalog/products?per_page=1` → JSON (200, or 403 if the token's role lacks catalog permissions).
   Swagger UIs for both live at `/api/shop/docs` and `/api/admin/docs` for interactive testing.
5. This repo's `/admin` dashboard shows live numbers instead of the seed dataset.

---

## 6. TailAdmin (optional, only if you outgrow the two panels)
- TailAdmin-laravel is a **UI shell**, not a commerce backend. Deploying it means a third app
  (`staff.woodex.pk`) on the same host, configured to consume `/api/admin/*` for its widgets.
- Sane starting point: copy the free kit, strip its demo pages, keep Dashboard + a custom
  "WOODEX Overview" wired to Bagisto reports. Budget 2–4 days.
- Do **not** attempt to theme/replace Bagisto's own admin with it — Bagisto's admin is a Vue app
  built into the package.

---

## 7. Security model (read this before going live)

| Secret | Where it may live | Notes |
|---|---|---|
| `VITE_BAGISTO_STOREFRONT_KEY` (`pk_storefront_…`) | Browser build, public | Read-only, rate-limited. Abuse → rotate in Bagisto admin. |
| `VITE_BAGISTO_ADMIN_TOKEN` (`id\|token`) | **Never in a public build.** Private preview only, or server-side proxy | Anyone holding it owns your store admin. For production, proxy `/api/admin/*` through a Laravel/Node middleware that injects the token server-side. |
| Supabase `sb_publishable_*` | Browser build, public | Fine by design. |
| `VITE_ADMIN_PASSWORD` | Demo gate only | Not an auth boundary. Ignore in production. |

Also: `APP_DEBUG=false`, HTTPS everywhere, IP allowlist on the Integration token, cPanel
"Directory Privacy" on the Bagisto admin route as a second factor, nightly `mysqldump` (cPanel →
Backup), and rotate the integration token on any staff departure.

---

## 8. Troubleshooting (cPanel-specific)

| Symptom | Likely cause | Fix |
|---|---|---|
| 500 on every page | Wrong document root / `.env` unreadable | Docroot → `bagisto/public`; `chmod 640 .env` |
| Product images 404 | `storage:link` not run / symlink blocked | §4.4; or `FILESYSTEM_DISK=local` + copy step |
| `composer` not found | Host has no CLI composer | Upload `composer.phar`; run `php composer.phar …` |
| Composer: "Allowed memory size exhausted" | Default PHP CLI `memory_limit` | `php -d memory_limit=-1 composer …` |
| Blank SPA on deep link (`/shop`) | No rewrite rule | Apache/cPanel: `public/.htaccess` ships in this repo (copied to `dist/`) — confirm it uploaded and `AllowOverride` is on. Nginx: `location / { try_files $uri $uri/ /index.html; }` |
| Mixed content blocked | Admin on HTTP, store on HTTPS | AutoSSL + `APP_URL=https://…` + `ASSET_URL` |
| API 403 | Integration token role/IP allowlist | Bagisto → Settings → Integration → edit token |
| API 419/session | Sanctum stateful domains | `.env`: `SANCTUM_STATEFUL_DOMAINS=woodex.pk,admin.woodex.pk` |

---

## 9. Roadmap (phased, matches how this repo was built)

- **Phase 1 — done in this repo:** restructured storefront + typed config + adapter layer +
  full `/admin` panel (demo dataset) + this bundle.
- **Phase 2:** provision Bagisto on staging subdomain; run acceptance test §5; catalogue CSV import.
- **Phase 3:** `VITE_API_MODE=bagisto` production rebuild; leads go live via small custom
  Laravel package (`quote_requests`, `b2b_enquiries` tables + REST endpoints) — see
  `docs/07-admin-integration`.
- **Phase 4:** remove demo seed path; wire TailAdmin staff panel if/when volume justifies it.
