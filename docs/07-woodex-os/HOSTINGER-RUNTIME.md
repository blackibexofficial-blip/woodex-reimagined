# Hostinger Shared Hosting — Runtime Rules

**Assumption:** Reimagin OS runs on the existing Hostinger plan (shared, **no SSH**, no Node, no Redis), deployed
by hPanel Git into a site folder, with uploads and settings stored outside the web root.

Every decision in the master plan is constrained by the table below. If a requirement breaks one of these rules,
it is redesigned — not waived.

---

## 1. Runtime configuration

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://woodex.com.pk
PUBLIC_SITE_URL=https://woodex.com.pk

DB_CONNECTION=mysql           # single shared instance
SESSION_DRIVER=database
CACHE_STORE=file              # database is the fallback
QUEUE_CONNECTION=database
FILESYSTEM_DISK=local         # root: ~/woodex-os/<site>/storage/app
BROADCAST_CONNECTION=log      # no websockets

LOG_CHANNEL=daily
LOG_LEVEL=warning
```

- **Never** `APP_DEBUG=true` in production (it leaks env on error pages).
- Session cookies: `secure`, `http_only`, `same_site=lax`; `SESSION_ENCRYPT=true`.
- Config, routes and views are **cached** (`config:cache`, `route:cache`, `view:cache`) after every deploy.

---

## 2. Deploy pipeline (no SSH)

```
local/CI                       GitHub                    Hostinger hPanel
────────                       ──────                    ────────────────
build assets  ───────────────▶ push to branch ─────────▶ Git deploy (webhook/pull)
(studio bundle,                                                     │
 storefront dist)                                                   ▼
                                                    Composer hook: tools/deploy/after-composer.php
                                                                   │
                                                    hit /internal/deploy/run?key=…  (signed, one-shot)
                                                    → migrate --force, config/route/view cache,
                                                      storage:link, queue restart flag
```

Rules:
- **Build artifacts are committed or uploaded** — production never runs `npm`.
- The deploy runner route is protected by a long random key in `.env`, throttled, and logs every invocation.
- Migrations are additive and reversible; destructive changes ship as a separate, owner-approved step.
- Rollback = Git revert + `migrate:rollback --step=1` only for additive migrations (never for data migrations).

---

## 3. Cron (the only “worker” on shared hosting)

| Job | Schedule | Command |
|---|---|---|
| Scheduler | every minute | `php artisan schedule:run` |
| Queue drain | every minute | `php artisan queue:work --stop-when-empty --max-time=50 --tries=3` |
| Backup | daily 02:30 | `php artisan backup:run --only-db` (existing Spatie Backup) |
| Health snapshot | hourly | `php artisan woodex:health` (existing System domain) |

Because a queue drain only runs once a minute, anything a customer is waiting for must be **synchronous**:
- synchronous: cart, checkout, stock reservation, invoice creation, order confirmation page
- queued: PDF generation, email/WhatsApp sends, image conversions, webhook fan-out, nightly reports

Queue jobs must be **idempotent** and safe to run twice (retries happen after `--max-time` cut-off).

---

## 4. Storage layout

```
~/woodex-os/<site>/
├── backups/           nightly dumps (kept 14 days)
├── storage/app/       MediaLibrary originals + conversions
├── storage/logs/
└── settings/          JSON settings outside the web root

public_html/<site>/    Laravel public/ only (index.php, assets, studio bundle)
```

- Product media is served through an allow-listed media route (`/media/{path}`) with `Cache-Control: public,
  max-age=31536000, immutable` and a hashed filename. No direct directory listing.
- Three sizes per image: `thumb` 400w, `card` 800w, `zoom` 1600w; **WebP** primary, JPEG fallback.
- Conversion runs on upload through a queued job; the original is retained only if the owner edits crops.
- Quota alarm at 80% of the plan's disk; surfaced in the System health screen and Telegram alerts.

---

## 5. Performance budgets

| Surface | Budget on shared hosting |
|---|---|
| Catalog API (list, 24 items) | ≤ 250 ms p95, ≤ 8 queries, ≤ 60 KB JSON |
| Product API (single) | ≤ 200 ms p95, ≤ 6 queries |
| Storefront page (prerendered) | ≤ 400 ms TTFB from cache |
| Puck page (rendered, cached) | ≤ 20 ms from cache, ≤ 250 ms cold, ≤ 12 queries |
| Checkout POST | ≤ 600 ms p95 (sync invoice + stock) |
| Admin Livewire page | ≤ 500 ms p95 |

Techniques: eager-load relations, avoid Polymorphic queries in loops, cache catalog fragments in file cache,
`Cache::remember` with explicit keys, paginate everything, no unbounded `->get()`.

---

## 6. Failure runbooks

| Symptom | Check | Fix |
|---|---|---|
| Orders stuck in `pending` | queue table growth, cron enabled? | run drain manually via deploy route; check `failed_jobs` |
| PDF/WhatsApp not sending | `IntegrationLog`, `failed_jobs` | retry failed jobs; verify provider keys |
| 500 after deploy | `storage/logs/laravel.log`, `APP_DEBUG` off | `config:clear`, verify `.env`, rollback Git |
| Disk full | quota in health screen | purge old backups, purge unused media conversions |
| DB connection exhausted | MySQL “too many connections” | reduce persistent connections, add indexes, cache reads |
| Slow pages | query log in staging | fix N+1, add cache, check image sizes |
| Cron disabled by host | health shows stale heartbeat | re-enable in hPanel; add uptime monitor on `/health` |

---

## 7. Security baseline

- HTTPS everywhere; HSTS; `SECURITY_FRAME_OPTIONS` set per surface (admin vs public).
- Admin path renamed (`ADMIN_PATH`), separate domain optional (`ADMIN_DOMAIN`).
- Rate limits: storefront 60 rpm/IP, writes 10 rpm/IP, leads 5 rpm/IP, agent 20 rpm/session.
- Webhooks: HMAC verification + 5-minute replay window + idempotency key.
- Uploads: MIME allow-list, size caps, image re-encode (strips payloads), no SVG from untrusted users.
- Backups: encrypted, offsite copy downloaded weekly by the owner.
- Secret hygiene: no credentials in the repo; `.env` only on the server; rotate keys quarterly.

---

## 8. When shared hosting stops being enough

The plan stays on shared hosting unless one of these is hit for two consecutive weeks:

- sustained CPU throttling during business hours,
- queue backlog > 500 jobs,
- p95 checkout > 1 s,
- disk > 80% with media growth trend,
- need for real-time features (live inventory sync, multi-agent chat routing).

The exit ramp is a VPS running the same codebase (no rewrite): Redis + Supervisor + the same Laravel app. Nothing
in this plan depends on shared hosting *semantics* — only on its limits.
