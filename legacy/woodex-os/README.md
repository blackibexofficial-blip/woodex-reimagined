# Woodex Backend + Admin + Database Handoff

Package date: 2026-11-03

This backend-only handoff contains the current Admin panel, PHP APIs, Admin authentication, separate frontend customer authentication, CRM, Sales, Booking, Chat, integrations, Builder, required backend assets, database schema and a staging-only demo seed.

## Excluded

- Current public SEO/frontend v1 HTML pages and page content
- Public v1 media/CSS bundles, sitemap and robots files
- `_private/db.json`, sessions, logs, backups and local runtime state
- Production API keys, SMTP, WhatsApp, Telegram, AI and payment secrets

## Install

1. Create a MySQL/MariaDB database.
2. Import `database/schema.sql` outside the public web root.
3. Upload the contents of `public_html/` to the document root.
4. Merge the new frontend into the same document root without replacing `admin/` or `api/`.
5. Open `/admin/` and configure the database through setup.
6. Import `database/demo-seed.sql` only for staging/demo testing.

## Staging credentials

- Admin: `demo@woodex.com` / `Demo@12345!`
- Frontend customer: `customer-demo@woodex.com` / `Demo@12345!`

Delete or disable these accounts before production. See `docs/FRONTEND-INTEGRATION.md`.
