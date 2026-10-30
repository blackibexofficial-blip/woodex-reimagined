# Hostinger Shared Plan — Verified Capabilities & Capacity Gate

**Constraint from the owner:** shared hosting only. **No VPS.**
**Sources:** WOODEX OS's own `docs/06-DEPLOYMENT-HOSTINGER.md` (v1.1) + Hostinger plan data (Oct 2026).

---

## 1. What the plan allows (and forbids)

| Capability | Allowed? | Detail |
|---|---|---|
| **PHP 8.4** | ✅ | Selectable in hPanel (8.2–8.5; 8.3 is default). Must be set **before** first deploy. |
| PHP extensions | ✅ | bcmath, ctype, curl, dom, fileinfo, gd/imagick, intl, mbstring, openssl, pdo_mysql, tokenizer, xml, zip, exif |
| **MySQL 8** | ✅ | host `localhost`, user `u…`; **≤ 3 GB per database** on shared plans; DB count 10–300 depending on plan version |
| **Cron** | ✅ | Every minute allowed; ≈400 lines max, **≤ 5 simultaneous** |
| **Git deploy** | ✅ | hPanel → Advanced → Git; copies the branch into the site folder; runs **Composer only** |
| **Composer** | ✅ | via the Git deploy step (the OS repo already uses a root `composer.json` manifest) |
| **SSH** | 🟡 | Included on Premium/Business per plan sheets — *verify in hPanel*; the OS is built to work without it |
| **SSL / subdomains** | ✅ | Free Let's Encrypt; subdomains with their own folders |
| **Backups** | ✅ | Daily (Business) + on-demand; `spatie/laravel-backup` runs too |
| **Node.js runtime** | ❌ | **No Node on the server.** Front-end builds are committed / pre-built |
| **Redis / Memcached** | ❌ | Use `file` or `database` cache + `database` sessions/queues |
| **Daemons / Supervisor** | ❌ | No long-running workers. Queues drain via cron `--stop-when-empty` |
| **WebSockets** | ❌ | Polling only (the OS chat already polls) |
| **Free disk writes to tracked files** | ⚠️ | **Pages created in the admin are untracked files** — a deploy that deletes untracked files destroys them (`git clean -fd`). Already documented as a hazard in the OS |

### Resource ceilings (Business tier — verify in hPanel)

| Metric | Value | Why it matters |
|---|---|---|
| CPU | 2 burstable cores, hourly **CPU-seconds quota** | Throttling shows up as 503/508 under bursts |
| RAM | **1.5 GB** (some plan sheets list 3 GB) | Each PHP request costs 30–60 MB in Laravel; Bagisto admin/checkout costs more |
| Entry processes | **30 concurrent** | The real concurrency limit for checkout traffic |
| PHP workers | 60 | — |
| Inodes | **600,000** | Two Laravel `vendor/` trees ≈ 30–60k files — fine |
| Storage | 50–200 GB NVMe | Product media is the growth driver |
| DB size | **3 GB per database**, ~10 GB per account (AUP) | Bagisto + OS both fit easily |
| MySQL connections | 50–75 concurrent | Keep checkout queries short |

---

## 2. Can two Laravel apps live on one shared account?

**Yes, with a gate.** Running **WOODEX OS** (`admin.woodex.pk`) and **Bagisto** (`shop.woodex.pk`) as two sites on the
same hosting account is possible: separate folders, separate MySQL databases, separate cron lines, separate SSL.

| Item | Estimate | Verdict |
|---|---|---|
| Inodes (both `vendor/` trees + media) | ~120,000 of 600,000 | ✅ comfortable |
| DB size (OS ≈ 50–150 MB, Bagisto ≈ 150–400 MB) | < 600 MB of 3 GB | ✅ |
| Cron lines needed | 4 (2 schedulers + 2 queue drains) | ✅ within 5 simultaneous |
| Media storage | 5,000 SKUs × 4 sizes ≈ 6–10 GB | ✅ within 50 GB, watch growth |
| **RAM under concurrency** | 30 entry processes shared by two apps | ⚠️ **the binding constraint** |
| **Composer install of Bagisto** | needs high memory (`COMPOSER_MEMORY_LIMIT=-1`) | ⚠️ may fail in the Git hook → use SSH step or pre-built `vendor` |
| **Bagisto install itself** | Bagisto's own docs assume a 4 GB RAM server; its community guides say "shared hosting won't work" | ⚠️ **must be proven, not assumed** |

### Therefore: **Gate H0** — the first thing built is a Bagisto proof on the real account

| Test | Pass condition |
|---|---|
| H0.1 | Bagisto 2.5 installs on the account (PHP 8.4, MySQL 8, composer completes) |
| H0.2 | Admin + one product + one order completes with PHP `memory_limit` ≤ 512 M |
| H0.3 | Checkout of 3 concurrent users, p95 < 1.5 s, no 508 |
| H0.4 | OS + Bagisto both reachable simultaneously under the same account |
| H0.5 | Cron drains both queues within 60 s |

**If H0 fails**, the documented fallbacks (in priority order — none of them is a VPS):

1. **Hostinger Cloud Startup** (managed cloud, 3–4 GB RAM, still not a VPS in the plan sense) — smallest change.
2. **Bagisto on managed external hosting** (Railway/Render/Cloudways free tiers or ~$5–10/mo) with the OS on
   Hostinger; API sync unchanged.
3. **Commerce read-only on shared** (catalog + quote requests), checkout postponed until hosting is upgraded.

> This gate is not a hedge — it is the single largest technical unknown in the plan, and it is cheap to settle in
> week 1.

---

## 3. Deployment topology on one account

```
home/u123456789/
├── woodex-os/<site>/            ← private data folder (OS): .env, storage, backups
├── woodex-shop/<site>/          ← private data folder (Bagisto): .env, storage
└── domains/woodex.com.pk/
    ├── public_html/             ← OS app root (repo root .htaccess → platform/public)
    │   └── platform/{app,public,vendor}
    ├── public_html/shop/        ← Bagisto app root (its own composer.json + .htaccess → public/)
    └── public_html/media/       ← optional shared media CDN path (or per-app)

Subdomains
  woodex.com.pk        → storefront SPA (prerendered) + OS-rendered pages
  admin.woodex.com.pk  → WOODEX OS (Puck Studio at /admin/studio)
  shop.woodex.com.pk   → Bagisto (admin + API + its own storefront disabled)
```

**Rules**
- Each app deploys from its own Git connection with **Root directory = its own folder** (never the shared parent).
- `vendor/` is never committed except as a last-resort fallback; use the composer hook (OS) / SSH step (Bagisto).
- Uploads live **outside** `public_html` in each app's private data folder; served through allow-listed routes.
- Never run `git clean -fd` in either folder — it deletes pages/posts created at runtime.

---

## 4. What each surface does on this plan

| Surface | Runtime | Notes |
|---|---|---|
| Public marketing pages (Puck) | **PHP/Blade in OS** | Cached fragments; full HTML for SEO |
| Shop / cart / checkout UI | **React SPA** | Calls the OS BFF; Bagisto does the commerce |
| Product pages (SEO) | **PHP/Blade in OS**, fed by Bagisto | ~200 pages prerenderable; no Node needed at runtime |
| Admin (OS) | Livewire | existing |
| Puck Studio | **static React bundle** in `public/studio/` | built in CI, committed/deployed; no Node on server |
| Bagisto admin | its own PHP admin | for orders, catalog, promotions, shipping |
| API | PHP (both apps) | OS BFF at `/api/storefront/v1` |

---

## 5. Operating budget the plan must respect

| Budget | Target |
|---|---|
| Checkout request | ≤ 6 queries, ≤ 400 ms p95 |
| Catalog API | ≤ 250 ms p95, cached 5 min |
| Puck page render | ≤ 20 ms cached / ≤ 250 ms cold |
| Image | 3 sizes + WebP, served immutable |
| Cron jobs | 4 lines, each `--stop-when-empty --max-time=50` |
| DB growth | alert at 1.5 GB (of 3 GB) |
| Disk growth | alert at 60% of plan quota |
| CPU | watch hPanel; alarm on sustained > 70% |

---

## 6. Security on shared

- Each app has **its own `.env`** outside the web root, its own `APP_KEY`.
- Cross-app calls use HTTPS + signed tokens (OS → Bagisto API key; Bagisto → OS webhook secret).
- No shared database user between apps.
- Payments: hosted gateway redirect only; webhooks verified by HMAC on the receiving app.
- Nightly: `spatie/laravel-backup` (OS) + `mysqldump` of the Bagisto DB into the OS backups folder, offsite weekly.
