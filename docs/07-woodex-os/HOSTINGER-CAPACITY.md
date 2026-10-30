# Hostinger Shared Plan — Verified Capabilities & Capacity

**Constraint from the owner:** shared hosting only. **No VPS.**
**Architecture it must carry:** **one** Laravel 13 application (WOODEX OS + its Commerce domain + Puck Studio),
one MySQL database, one cron.

Sources: WOODEX OS `docs/06-DEPLOYMENT-HOSTINGER.md` (v1.1) + Hostinger plan data (Oct 2026).

---

## 1. What the plan allows (and forbids)

| Capability | Allowed? | Detail |
|---|---|---|
| **PHP 8.4** | ✅ | Selectable in hPanel (8.2–8.5; 8.3 default). Set **before** first deploy. |
| PHP extensions | ✅ | bcmath, ctype, curl, dom, fileinfo, gd/imagick, intl, mbstring, openssl, pdo_mysql, tokenizer, xml, zip, exif |
| **MySQL 8** | ✅ | `localhost`; **≤ 3 GB per database**; 10–300 databases depending on plan version |
| **Cron** | ✅ | Every minute allowed; ~400 lines max, **≤ 5 simultaneous** |
| **Git deploy** | ✅ | hPanel → Advanced → Git; copies the branch into the site folder; runs **Composer only** |
| **Composer** | ✅ | via the Git deploy step |
| **SSH** | 🟡 | Listed on Premium/Business — *verify in hPanel*; the OS is built to work without it |
| **SSL / subdomains** | ✅ | Free Let's Encrypt; subdomains only for staging, not for a second app |
| **Backups** | ✅ | Daily (Business) + on-demand; `spatie/laravel-backup` runs too |
| **Node.js runtime** | ❌ | **None on the server.** All JS/CSS pre-built and committed or uploaded |
| **Redis / Memcached** | ❌ | `file` or `database` cache; `database` sessions and queues |
| **Daemons / Supervisor** | ❌ | No long-running workers. Cron drains queues with `--stop-when-empty --max-time=50` |
| **WebSockets** | ❌ | Polling only (the OS inbox already polls) |
| **Untracked files survive deploy?** | ⚠️ | No — uploads and runtime-created pages must live **outside** the repo; never `git clean -fd` |

### Resource ceilings (Business tier — verify in hPanel, record the real numbers)

| Metric | Value | Why it matters |
|---|---|---|
| CPU | 2 burstable cores, hourly CPU-seconds quota | Throttling appears as 503/508 under bursts |
| RAM | **1.5 GB** (some plan sheets list 3 GB) | Each PHP request costs 30–60 MB in Laravel |
| Entry processes | **30 concurrent** | The real concurrency limit for checkout |
| PHP workers | 60 | — |
| Inodes | **600,000** | One `vendor/` tree ≈ 15–30k files |
| Storage | 50–200 GB NVMe | Product media is the growth driver |
| DB size | **3 GB** | 132 tables + orders fits with room to spare |
| MySQL connections | 50–75 concurrent | Keep checkout queries short |
| I/O | ~2 MB/s sustained | Image writes are the risk, not reads |

---

## 2. Capacity math for one app

| Item | Estimate | Headroom |
|---|---|---|
| Inodes (app + vendor + media) | ~45,000 of 600,000 | ✅ 13× |
| DB size after 2 years (≈ 20k orders, 5k SKUs) | ~400 MB of 3 GB | ✅ 7× |
| Media (5,000 SKUs × 4 sizes) | 6–10 GB of 50 GB | ✅ |
| Cron lines | 3 (scheduler, queue drain, backup) | ✅ within 5 |
| **Checkout concurrency** | 30 entry processes | ⚠️ **the binding constraint** |
| Peak RAM | ~1.5 GB shared across processes | ⚠️ watch it |

**The single-app design is what makes this comfortable.** v5's two-app topology had to split 30 entry processes
between two Laravel boots; now there is one. The remaining risk is not whether it fits, but whether a
checkout-heavy minute stays inside the CPU quota.

### Budgets the build must respect

| Budget | Target |
|---|---|
| Checkout request | ≤ 8 queries, ≤ 400 ms p95 |
| Product page (cached) | ≤ 25 ms |
| Product page (cold) | ≤ 300 ms |
| Catalog API | ≤ 250 ms p95, cached 5 min |
| Puck page render | ≤ 20 ms cached |
| Image | 3 sizes + WebP, immutable cache headers |
| DB growth alert | 1.5 GB |
| Disk alert | 60 % of quota |
| CPU alert | sustained > 70 % |

### Gate G1 — vertical slice on real infrastructure (week 6)

Not a hosting-install risk any more (one Laravel app is proven on this host), but a **money-path** risk:

| Test | Pass |
|---|---|
| Seed 20 products on production infra | catalog + product page render |
| Add to cart, checkout as guest, COD | order + invoice created |
| Bank-transfer order → admin verifies | payment recorded, order paid |
| 30 concurrent catalog loads + 5 concurrent checkouts | p95 < 1.5 s, zero 5xx, no 508 |
| Cron drains invoice emails within 60 s | yes |
| DB size and inode count recorded | filled into §1 |

**How the gate is run (T12, shipped).** Two commands, both reporting a verdict and an exit code:

```bash
# 1. catalog — 30 concurrent reads × 10 waves = 300 requests, from outside, over HTTPS
php artisan commerce:load-probe --base=https://staging.example.com \
    --token="$COMMERCE_PROBE_TOKEN" --catalog=30 --waves=10

# 2. the race — 5 simultaneous checkouts for a variant with exactly 1 unit
php artisan commerce:load-probe --base=https://staging.example.com \
    --token="$COMMERCE_PROBE_TOKEN" --checkouts=5 --sku=WX-1019 --confirm-oversell-test
```

- **30 is the account's entry-process ceiling**, not a round number. Firing 30 at once is the saturation test: if p95
  holds at 30 concurrent, it holds for the traffic this plan expects. 300 requests is the sample size — with 20 samples
  a single slow request is the p100, not the p95, and the probe would under-report.
- **The verdict is computed, not eyeballed.** `p95 ≈ 1500 ms` passes (the budget is "≤ 1.5 s"); 1500.1 does not. Any 5xx
  fails. Any oversell fails, whatever the latency.
- **Oversell is audited from the database**, not from the responses: order lines claimed after the run plus units still
  held by a live reservation must not exceed what was on the shelf. The probe's own view of what happened is not
  evidence.
- **The probe identifies itself** with `X-Load-Probe`, which the catalog rate limiter trusts only when
  `COMMERCE_PROBE_TOKEN` is set. Unset — as in production — the bypass does not exist and the race endpoint answers 404.
- Exit 0 = gate passed. Every reason for a failure is printed and written into the JSON report.

Fail → fix before P2 (checkout build). There is no fallback hosting decision to make at that point; the fallback is
performance work, and only if the account truly cannot cope does the same codebase move to a bigger Hostinger tier —
unchanged.

---

## 3. Deployment topology

```
home/u123456789/
├── woodex-os/reimagin/          ← private data: .env, storage/app, backups, logs
└── domains/woodex.pk/
    ├── public_html/             ← app root; .htaccess → public/
    │   ├── platform/{app,vendor,bootstrap,config,routes}
    │   ├── public/studio/       ← pre-built Puck Studio bundle (no Node needed)
    │   └── public/media/        ← product images (outside the repo, symlinked/served)
    └── staging.woodex.pk/       ← same codebase, separate DB + data folder

admin.woodex.pk → same app, same code, host-level IP/auth gate for the admin area
```

- Uploads live **outside** `public_html`, served through allow-listed routes.
- `vendor/` is deployed by the Composer hook, not committed (fallback: pre-built upload if Composer OOMs).
- Puck Studio is built in CI and uploaded to `public/studio/` — **runtime needs no Node.**
- Staging is a subdomain of the *same* app with its own `.env` and database — never a second codebase.

---

## 4. What each surface costs at runtime

| Surface | Runtime | Cost |
|---|---|---|
| Marketing pages (Puck → Blade) | PHP, fragment-cached | ~1 query set, 20 ms cached |
| Product page | PHP + catalog cache | 3–6 queries, 250 ms cold |
| Cart / checkout | React SPA → OS API | 5–8 queries, 400 ms |
| Admin (Livewire) | PHP + Livewire round-trips | 2–4 requests per interaction |
| Puck Studio | static JS bundle | zero PHP after boot |
| AI agent | queued job, cron-drained | off the request path |

---

## 5. Operating rules (see `HOSTINGER-RUNTIME.md` for the full set)

```dotenv
APP_ENV=production
DB_CONNECTION=mysql
SESSION_DRIVER=database
CACHE_STORE=file
QUEUE_CONNECTION=database
BROADCAST_CONNECTION=log
FILESYSTEM_DISK=local
```

Cron (3 lines):
```
* * * * * php artisan schedule:run
* * * * * php artisan queue:work --stop-when-empty --max-time=50 --tries=3
0 3 * * *  php artisan backup:run --only-db
```

---

## 6. Security on shared

- `.env` and `storage` outside the web root; `APP_DEBUG=false`; `APP_KEY` unique.
- Admin behind a login + optional IP allow-list (Hostinger supports directory protection).
- Payments: hosted redirect + HMAC-verified webhook only. **No card data on the host** — this is a PCI scope
  decision, not a preference.
- Uploads: extension + MIME allow-list, stored outside `public_html`, served through a route with a signed URL.
- Nightly DB backup + weekly offsite copy; restore drill at week 26.
