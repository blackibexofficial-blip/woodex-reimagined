# Week 1 — Kickoff & Gate H0

The only week that can invalidate the plan. Everything else can be re-sequenced; this cannot.
**No UI work starts until H0 passes.**

Owner of the week: **Dev A (commerce)**. Dev B sets up the OS repo/site; Dev C prepares the Puck Studio build pipeline
(which needs nothing from hosting).

---

## Day 1 — Accounts and access

| # | Task | Done when |
|---|---|---|
| 1.1 | hPanel → PHP Configuration → **8.4** for the primary domain *and* the subdomain | `php -v` (via any info script) shows 8.4 |
| 1.2 | Confirm plan tier and read the real limits: RAM, entry processes, inodes, DB size | Numbers recorded below, replacing the estimates in `HOSTINGER-CAPACITY.md` |
| 1.3 | Create `shop.woodex.pk` subdomain, own document root | resolves, SSL active |
| 1.4 | Create **two** MySQL databases + two users (never shared) | `SHOW DATABASES` shows both |
| 1.5 | SSH check: `ssh -p 65002 uXXXX@<host>` | either works (note it) or definitively unavailable |
| 1.6 | Record: disk quota, inode count, MySQL `max_connections`, PHP `memory_limit` | filled into the capacity table |

**Recorded plan facts (fill in):**

```
plan tier:            __________
PHP version:          __________
memory_limit:         __________
max_execution_time:   __________
entry processes:      __________
inodes quota/used:    __________
DB size quota:        __________
SSH:                  yes / no
composer version:     __________
node available:       yes / no   (expected: no)
```

---

## Day 2 — Bagisto install (H0.1)

```bash
# On the server (SSH) or via a temporary installer script if SSH is absent
cd ~/domains/shop.woodex.pk
composer create-project bagisto/bagisto . "^2.5" \
  --no-interaction --prefer-dist \
  --no-scripts          # run scripts separately so an OOM is visible, not silent

COMPOSER_MEMORY_LIMIT=-1 composer run-script post-create-project-cmd
```

If Composer OOMs, in this order:
1. `COMPOSER_MEMORY_LIMIT=-1` and `--prefer-dist --no-dev` (dev deps only for the build step).
2. Build locally (same PHP 8.4 + Composer 2), upload `vendor/` + `bootstrap/cache` by SFTP, run `php artisan migrate` via cron-once.
3. Last resort: Bagisto on external managed hosting (fallback B).

**H0.1 passes when:** `/admin/login` renders, `php artisan bagisto:install` (or the web installer) completes, and
`storage/logs/laravel.log` has no fatal errors.

---

## Day 3 — Bagisto smoke (H0.2)

| Test | Command / action | Pass |
|---|---|---|
| Create product | admin → Catalog → one simple product, image, PKR price | saved, visible on the default storefront |
| Create customer | register on the shop | appears in admin |
| Place order | add to cart → COD checkout | order # created, invoice generated |
| Memory | `memory_limit = 512M` in the subdomain's PHP config | checkout still completes |
| Media | upload a 3 MB image | resized, served |

Record peak `memory_get_peak_usage` on the order page; if > 400 MB, set 768 M and note it.

---

## Day 4 — Two apps, one account (H0.3–H0.4)

| Test | Pass |
|---|---|
| OS site live at `admin.woodex.pk` from Git deploy | admin dashboard renders |
| Both apps reachable simultaneously | two browser tabs, no 508 |
| Cron: 4 lines, all `--stop-when-empty --max-time=50` | `queue:work` and `schedule:run` for both apps |
| Load: 3 concurrent checkouts + 10 catalog page loads | p95 < 1.5 s, zero 508/503 |
| DB size after install | OS + Bagisto < 300 MB |

```bash
# load probe (from any machine)
for i in $(seq 1 3); do curl -s -o /dev/null -w "%{http_code} %{time_total}\n" https://shop.woodex.pk/checkout & done; wait
```

---

## Day 5 — Go / no-go

| Gate | Result |
|---|---|
| H0.1 install | ☐ pass ☐ fail |
| H0.2 admin + order on 512 M | ☐ pass ☐ fail |
| H0.3 concurrency, no 508 | ☐ pass ☐ fail |
| H0.4 both apps coexisting | ☐ pass ☐ fail |
| H0.5 cron drains both queues < 60 s | ☐ pass ☐ fail |

**All five pass → proceed to P1 as planned.**
**Any fail → invoke `OPEN-QUESTIONS.md` Q1 fallback before week 2.** Do not "try harder" for a second week; the cost of
the fallback is $10–20/month, the cost of a late discovery is the quarter.

---

## Parallel work that does not depend on H0

| Dev | Week-1 task | Output |
|---|---|---|
| B | OS repo → `admin.woodex.pk` Git deploy; staging subdomain; `.env` outside web root | deployable OS |
| B | Freeze the BFF contract: run `openapi.yaml` through a linter, generate the TS client | typed client in the SPA |
| C | Puck Studio build: `@puckeditor/core` 0.24 into the OS admin, static bundle to `public/studio/` | editor opens on a test page |
| C | Component inventory vs the 142 pages; pick the first 12 blocks | migration backlog |
| All | Read `MASTER-PLAN.md` §3 and agree the week-1..4 sequence in one sitting | shared calendar |

---

## Definition of done for the week

- Bagisto: installed, one product, one order, one invoice, on the real account.
- OS: deployed by Git to its subdomain, cron running, queue draining.
- A written number for every row in `HOSTINGER-CAPACITY.md` §1 that was previously an estimate.
- A typed API client in the storefront generated from `openapi.yaml` (45 paths).
- A go/no-go note committed to the repo.
