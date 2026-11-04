# Woodex OS v1.0.0

The first packaged, deployable build of the Woodex furniture website and its
admin system.

**Nothing to compile.** `vendor/` is included, the storefront and admin bundles
are built, and the database ships populated with the full content set.

---

## Install

```sh
unzip woodex-v1.0.0.zip
cd woodex-v1.0.0
sh deploy.sh                 # verifies PHP, writes .env, generates APP_KEY
```

Then set four values in `.env` — `APP_URL`, `PUBLIC_SITE_URL`, `OWNER_EMAIL`,
`PUBLIC_LEADS_ALLOWED_ORIGINS` — point your web root at **`public/`**, and sign
in at `/admin`.

Full instructions, including Hostinger, cPanel, Nginx, VPS and the SQLite→MySQL
migration: **DEPLOY.md** inside the archive.

## What is in it

| | |
|---|---|
| PHP | 8.4.1+ (hard requirement) |
| Laravel | 13.36, Livewire, Blade |
| Storefront | `/` `/shop` `/projects` `/services` `/blog` `/contact` `/quotation` `/checkout` |
| Admin | `/admin` — leads, quotations, invoices, accounts, products, CMS |
| Content | 16 pages · 30 content records · 20 products · 20 media · 137 redirects |
| Database | SQLite, populated (4.8 MB) |
| Size | ~110 MB compressed, 291 MB extracted |

## Verified before packaging

Every one of these was run against the exact tree that became this archive, on a
fresh install with a newly generated `APP_KEY`:

- `deploy.sh` — all 7 steps pass, and a second run changes nothing (idempotent)
- 13 routes answer 200: home, shop, product page, projects, services, blog,
  contact, quotation, checkout, admin login, `/api/site/v1/pages`, sitemap, robots
- 3 legacy URLs return the right 301 (`/architecture/` → `/services/`,
  `/3d-visualization/` → `/services/space-planning-design/`, `/islamabad/` → `/showrooms/`)
- unknown URLs return 404
- admin sign-in succeeds and `/admin/website/content` renders 30 records with
  Livewire booted, 0 JavaScript errors

## Known limitations

- **The page builder's HTML view is readable but not the place to edit.** Saving
  there is overwritten by the next **Publish site**. Edit in **Website → Content**
  or **Website → Pages**; those are the source of truth.
- **PHP 8.4 is mandatory.** Laravel 13.36 will not run on 8.3.
- **The demo owner account ships with a known password.** Change it first:
  `php artisan woodex:owner --password='…'`
- **Mail defaults to `log`.** Lead notifications are written to
  `storage/logs/laravel.log` until you configure `MAIL_*`.
- The database contains demo leads and demo financial records. Clear them before
  a production launch if the site is publicly reachable.

## Checksums

```
SHA256  woodex-v1.0.0.zip   (published in the release notes)
```

Verify after download:

```sh
sha256sum woodex-v1.0.0.zip
```

---

Built from `blackibexofficial-blip/woodex-reimagined` @ `8cbe4b9` with
`tools/release/build-package.sh`.
