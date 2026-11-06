# Deployment

## Stack
Static storefront: Vite 5 + React 18 single-page app. `bun run build` emits `dist/`,
which is uploaded as-is to Apache / cPanel shared hosting. A member area (`/admin`) ships
as a client-rendered route inside the same bundle (demo mode by default; Supabase via env
when provisioned — production admin backend is an open decision).

## Environments
- Local dev: `bun run dev`
- Local prod QA: `bun run build` then `bun run preview` (or `node e2e/smoke.mjs`, which
  previews on :4173)
- Production: Apache/cPanel at `https://woodex.pk` (canonicals, OG URLs, sitemap.xml and
  robots.txt already point at `woodex.pk` — do not change without updating those).

## Publish Flow (cPanel)
1. Merge changes to `main`. CI must be green (`.github/workflows/ci.yml`: typecheck,
   lint, build, e2e smoke, axe scan).
2. On a maintainer machine: `bun install --frozen-lockfile && bun run build`.
3. Upload `dist/` contents to `public_html/` (overwrite). `public/.htaccess` (SPA
   fallback + security headers) is copied into `dist/` automatically.
4. Verify on the live URL: home renders, deep link (e.g. `/shop`, `/quotation`) serves,
   `/sitemap.xml` and `/robots.txt` return 200.
5. Warm-crawl the top 10 pages.
6. Keep a tarball of the previous `dist/` for instant rollback.

## Lovable
The repo previously lived in Lovable; the codebase is now a standalone Vite app. Ignore
historical references to Lovable publishing in older docs/screenshots.

## Secrets & Env
- `.env` is **not committed** (never stage it). Publishable Supabase anon key + URL may be
  present in client code; the service-role key must never ship client-side.
- GA4: build-time `VITE_GA4_ID`. Blank = analytics module is inert (no network calls).
- Rotate the committed `.env` (it was committed historically) — owner decision, tracked.

## Post-Deployment
- [ ] Sitemap accessible at `/sitemap.xml` (182 URLs)
- [ ] robots.txt accessible at `/robots.txt`
- [ ] Canonical/OG URLs resolve to `woodex.pk`
- [ ] GA4 live data confirmed within 30 min (requires `VITE_GA4_ID` rebuild)
- [ ] GSC re-verify on production domain + sitemap submitted
- [ ] Test WhatsApp CTA on real device
- [ ] Test quote PDF download on real device
- [ ] Error monitoring wired `[planned]`

## Rollback
Restore the previous `dist/` tarball via cPanel file manager (or FTP), purge CDN/cache,
re-verify home + one deep link.
