# Woodex OS — v1.0.0

A complete, pre-built installation of the Woodex furniture website and its admin
system — **nothing to compile**. `vendor/` is included, the storefront is already
built into `public/`, and the database is populated with the full content set.

| | |
|---|---|
| **Storefront** | `/` `/shop` `/projects` `/services` `/blog` `/contact` `/quotation` `/checkout` |
| **Admin panel** | `/admin` — leads, quotations, invoices, accounts, products, CMS |
| **CMS API** | `/api/site/v1/{pages,content,theme}` |
| **PHP** | 8.4.1 or newer |
| **Database** | SQLite (included, populated) or MySQL |
| **Frameworks** | Laravel 13.36 · Livewire · Blade |

---

## Quick start (5 minutes)

```sh
# 1. Unzip on the server, then:
cd woodex-v1.0.0
sh deploy.sh                 # checks PHP, creates .env, generates APP_KEY

# 2. Edit .env — the four lines that must be yours:
#      APP_URL=https://yourdomain.com
#      PUBLIC_SITE_URL=https://yourdomain.com
#      OWNER_EMAIL=you@yourdomain.com
#      PUBLIC_LEADS_ALLOWED_ORIGINS=https://yourdomain.com

# 3. Point the web root at  public/   (not the folder above it)

# 4. Open https://yourdomain.com/admin and sign in
```

Then change the owner password immediately:

```sh
php artisan woodex:owner --password='choose-a-long-one'
```

Detailed, host-specific instructions (Hostinger, cPanel, Nginx, VPS):
see **[DEPLOY.md](DEPLOY.md)**.

---

## What is inside

```
woodex-v1.0.0/
├── app/            Laravel application (controllers, Livewire, console, domain)
├── bootstrap/      framework bootstrap + cache (empty, writable)
├── config/         configuration — reads everything from .env
├── database/
│   ├── database.sqlite   4.8 MB — the live content, ready to use
│   ├── migrations/       92 migrations
│   ├── seeders/          reference data
│   └── data/             original photo sources used for the import
├── public/          WEB ROOT — storefront HTML, built assets, .htaccess
│   ├── index.html        the home page
│   ├── shop/ projects/ services/ blog/ …   67 published page folders
│   ├── build/            Vite admin bundle (already compiled)
│   ├── front/            storefront SPA bundle (already compiled)
│   ├── assets/           images, fonts, theme
│   └── .htaccess         146 rules incl. 137 redirects from the old site
├── resources/      Blade views, source JS/CSS for the admin bundle
├── routes/         web, api, admin, console
├── storage/        uploads, logs, framework cache (writable)
├── tests/          the shipped test suite
├── vendor/         ALL PHP dependencies — no composer install needed
├── deploy.sh       idempotent setup script
├── .env.example    production template, 79 settings
├── DEPLOY.md       step-by-step hosting guide
└── RELEASE-NOTES.md
```

## Content status

Already in the database and published to `public/`:

| | Count |
|---|---|
| Page files published | 67 |
| CMS content records | 30 — 7 services, 6 posts, 7 projects, 5 series, 5 showrooms |
| Products | 20 |
| Media library | 20 images (165 files on disk) |
| Legacy redirects | 137 |
| Sitemap URLs | 66 |

The old interior-design site was deliberately archived: **142 of its addresses
permanently redirect** to the equivalent furniture page, so existing Google
rankings and links keep working.

## Editing the website

Sign in at `/admin` → **Website**. There are two layers:

- **Content** (30 records) and **Pages** — the source of truth. Edit here.
- **Page builder → HTML files** — a read-only view of what the CMS published.
  Saving a change there is overwritten on the next publish, so don't work in it.

Hit **Publish site** when you are ready to publish. Nothing goes live silently.

## Changing the database password / moving to MySQL

See DEPLOY.md section 7. Short version: switch `DB_CONNECTION` to `mysql`, fill
the credentials, then `php artisan migrate --force`.

## Requirements

PHP **8.4.1+** with `pdo_sqlite` (or `pdo_mysql`), `mbstring`, `openssl`,
`fileinfo`, `curl`, `json`, `tokenizer`, `xml`, `ctype`, `bcmath`, `gd` or
`imagick` for image work.

Apache: `mod_rewrite` and `AllowOverride All` — `.htaccess` ships configured.
Nginx: use the config snippet in DEPLOY.md section 5.

## Support / source

Source repository: `https://github.com/blackibexofficial-blip/woodex-reimagined`

Release: `v1.0.0`

---

**Security note.** This archive contains `database/database.sqlite` with the
demo content and the seeded owner account. Before going live: change the owner
password, set a real `APP_KEY` (deploy.sh does it), set `APP_DEBUG=false`
(already the default), and confirm `WOODEX_PREVIEW_SHOW_CREDENTIALS=false`.
