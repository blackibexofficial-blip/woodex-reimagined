# Master pending list

_State of the project as of 6 Nov 2026 — every line below was checked against the code or the running
application, not recalled. Updated whenever an item closes._

Measured today:

| Fact | Value |
|---|---|
| Application boot | Laravel 13.40.0, 228 routes (130 under `admin.`) |
| Test suite | 539/555 — 16 failures, classified in §6 |
| Catalogue | 157 products, 64 categories |
| CMS | 16 published pages, 1 442 blocks, 105 media, 48 menu items |
| Redirects | 137 |
| Storefront | `/` and `/shop` both still serve the **React SPA**; the Blade/Puck pages live at `/page-preview/{key}` |

---

## 1. Deploy — HOSTINGER (blocking everything else)

The account has **no Terminal** and the hPanel Git deploy only clones and publishes, so the normal kit
(`apply.sh`, `sync-slice.sh`, `structure.sh`) cannot run there. The answer is the self-contained zip.

| # | Item | Definition of done |
|---|---|---|
| 1.1 | **Upload `woodex-staging-master.zip`** to the staging folder and extract so `.htaccess` + `platform/` sit directly inside it | Folder listing shows `.htaccess`, `platform/`, `READ-ME-FIRST.txt` |
| 1.2 | **Run `setup.php?key=…`** | Every step prints PASS; site loads afterwards |
| 1.3 | **Delete `setup.php`** | 404 when requested |
| 1.4 | **Disconnect the hPanel Git deploy** (Advanced → Git) | No republish on push — otherwise it overwrites the install with a slice again |
| 1.5 | **Change the admin password** — `owner@woodex.test` / `Woodex-Preview-2026` is the demo account and is now on a public URL | Login with the new credentials only |
| 1.6 | Decide the final layout: one app directory, domain document root → `platform/public`, `.htaccess` no longer load-bearing | `curl /.env`, `/.git/config`, `/composer.json` all 403/404 |
| 1.7 | PHP version pinned to 8.4 for the domain | hPanel shows 8.4; `setup.php` reports the same |
| 1.8 | Cron: `schedule:run` every minute, `queue:work --stop-when-empty --tries=3 --max-time=50` | Scheduled tasks and queued jobs actually fire |
| 1.9 | Remove `downloads/` (70 MB) from the repo once installs stop needing it | `git ls-files downloads` empty |

**Blocker:** 1.1–1.3 need the upload you are doing. Everything else can follow in any order.

---

## 2. Storefront cutover — from SPA to the new pages

Both `/` and `/shop` render the React bundle. The new Blade/Puck storefront is complete enough to preview
but is not on any public URL, so none of the recent admin work is visible to a visitor.

| # | Item | Why it matters |
|---|---|---|
| 2.1 | Route `/` to the Puck home page instead of `public/index.html` | The theme, menus and settings screens currently change nothing a visitor sees |
| 2.2 | Route `/shop`, `/product/{slug}`, `/category/{slug}` to the Blade catalogue | The SPA fetches the old API; the new one is Blade-rendered |
| 2.3 | Decide the SPA's fate: keep under `/legacy` for A/B, or delete | Two storefronts drift; the SPA has no admin for its content |
| 2.4 | Port the 137 redirects so old URLs still resolve after the cutover | SEO — the redirect table exists and is seeded, but is only consulted by the old `.htaccess` today |
| 2.5 | Verify SEO head on every cut-over page: title, description, canonical, OG image | `site/partials/head.blade.php` supports it; content must supply it |
| 2.6 | 404 and 500 pages | Currently Laravel's default |

---

## 3. Commerce — from browse to paid order

| # | Item | Notes |
|---|---|---|
| 3.1 | **Cart → checkout → order** end-to-end | Tables exist (`commerce_carts`, `commerce_orders`); the flow is not verified |
| 3.2 | **E-Quotation flow** (the green button in the SPA header) | Business model is quote-led, not pure checkout — decide which is primary |
| 3.3 | Payment method: COD / bank transfer / online | `commerce_payments` + `payment_method_accounts` exist; choosing is a business decision |
| 3.4 | Stock and reservations | `commerce_inventory_items`, `commerce_inventory_reservations` exist; decrement-on-order unverified |
| 3.5 | Emails: order confirmation, quote request, admin alert | `MAIL_MAILER=log` in the package — nothing is actually sent |
| 3.6 | Product page parity: price in PKR, stock state, rating only when reviews exist, warranty said once | These are 5 of the 16 failing tests — see §6, they encode real requirements |

---

## 4. Data

| # | Item | Notes |
|---|---|---|
| 4.1 | Confirm the 157 products are the real catalogue (legacy had 137 categories/products to reconcile) | Decide what the canonical count is |
| 4.2 | Product images: 105 media rows — verify every product has a usable image and no broken paths | Broken images are the most visible failure |
| 4.3 | Legacy content import: services, projects, showrooms, blog | 16 pages exist; the legacy site has more |
| 4.4 | Legacy orders/quotes imported **as history** (not fulfilable) | Standing decision from earlier: history, not live work |
| 4.5 | Backup + restore rehearsal of the staging database | A backup nobody has restored is a hope |

---

## 5. Admin / OS modules

Present and working: **Menu builder** (header + footer, drag-and-drop, depth guards), **Site settings**
(8 sections with live preview), **Theme editor** (25 colour tokens + presets + v1 reset, now actually
reaching the storefront), **Page editor**, **Catalog admin**.

| # | Item | Notes |
|---|---|---|
| 5.1 | Roles and permissions review | 130 admin routes; confirm each hangs off the right permission |
| 5.2 | Media library: upload, resize, alt text, delete | 105 rows seeded; upload path unverified |
| 5.3 | Orders and quotes screens | Tables and models exist; confirm the UI covers fulfilment |
| 5.4 | Leads / CRM / projects / portal | Out of the storefront scope but in the OS — decide whether staging needs them now |
| 5.5 | Integrations: Google, WhatsApp | Tokens present in schema; not configured for staging |
| 5.6 | Audit log review | `activity_log`, `change_requests`, `approvals` exist — is anyone using them? |

---

## 6. The 16 failing tests — triaged

**11 are the test harness, not the app.** The standalone runner has no Laravel container, so tests that
touch framework classes throw instead of asserting. Verified by reading the messages:

| Test | Real message | Verdict |
|---|---|---|
| `CatalogQueryTest` ×3 | `Class "Illuminate\Support\Facades\Cache" not found` | Harness |
| `ProductShellTest` ×5 | `Class "App\Console\Commands\PublishSiteCommand" not found` — the class **does** exist in the app | Harness |
| `ProductMediaRouteTest` ×2 | route registration needs the container | Harness |
| `ContentEditingTest::testABlankCanonical…` | same pattern (0 assertions) | Harness |

**5 need real attention:**

| Test | Problem | Fix |
|---|---|---|
| `SchemaTest::testMigrationsAreTimestampOrderedAndDisjoint` | expects 7 commerce migrations, the repo has **9** (two were added on 5 Nov) | Update the expected count, or confirm the two additions are intended |
| `StorefrontWiringTest::testACategoryMeansItsWholeSubtree` | 6 assertions then fails — subtree query does not match the expectation | Real: a category page would miss subcategory products |
| `LegacyRedirectTest::testPathsAreNormalisedToTheCanonicalForm` | trailing-slash normalisation | Real, and it matters for §2.4 |
| `SiteContentWiringTest::testTheApiRoutesAreRegisteredAndMounted` | expects `routes/api.php` in the slice; the slice only has `commerce/site/storefront/website` | Confirm the OS mounts them; if not, the API the SPA calls is missing |
| `ContentEditingTest::testTheScreenIsReachableAndGuarded` | 1 assertion in | Real: permission guard wiring |

---

## 7. Security and operations

| # | Item | Status |
|---|---|---|
| 7.1 | Delete `recovery/hostinger-diagnostic/` and any `woodex-diagnostic.php` from the server | Left over from a diagnostic upload; must not stay public |
| 7.2 | Delete `inspect.php` from the staging root | Done by you after the report, confirm it |
| 7.3 | `platform/.env` is mode 600 and outside the document root after §1.6 | Pending §1.6 |
| 7.4 | Turn off `APP_DEBUG` in production | Already `false` in the shipped `.env` — verify after setup |
| 7.5 | Nightly database backup (hPanel cron + `mysqldump`) | Not started |
| 7.6 | Uptime + error monitoring | Not started |

---

## 8. Recommended order

1. **§1.1–1.5** — finish the upload, install, lock the front door. Nothing else can be validated on a real host until this is done.
2. **§6 the 5 real test failures** — they are cheap, and two of them (subtree, redirects) block §2.4.
3. **§2.1–2.2** — the cutover. This is the moment the project becomes visible; everything already built starts paying off.
4. **§3.1–3.2** — decide quote-led vs checkout-led, then build that one path properly.
5. **§4** — data completeness, especially images.
6. **§5, §7** — module review, then operations.

**Two decisions only you can make**, and both block work above:

- **Quote-led or checkout-led?** The site's primary CTA is *E-Quotation*; the commerce tables assume orders. If quotes are the business, checkout is a side path and §3.1 shrinks dramatically.
- **Does the SPA survive the cutover?** Keeping it doubles the surface; deleting it loses the only storefront that is currently public.
