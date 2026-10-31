# WOODEX Furniture — Master Plan

**Frontend · Backend · Database · Admin · Content migration**

| | |
|---|---|
| **Business** | WOODEX **Furniture** — office furniture, Karachi/Lahore manufacture + delivery |
| **Live today** | `https://woodexfurniture.pk` — a legacy **PHP** store with its own cart, checkout and e-quotation |
| **Target** | WOODEX OS (Laravel 13 + Livewire 4) becomes the **single admin and the only database**; the reimagined React frontend becomes the only storefront |
| **Sibling site** | WOODEX **Interior** (`woodexinterior`) keeps **its own domain** — separate business, separate deployment, not in this plan |
| **Hosting** | Hostinger **shared** — no Node runtime, no Redis, no SSH required, ~30 PHP workers |
| **Date** | 1 November 2026 |

---

## 0. What I verified before writing this

Not assumptions — these were read from the live site and the two repositories today.

**The live store is a PHP application.** Its own URLs prove it: `space_planing.php`, `projectbased.php`, `factorydirect.php`, `deliveryandinstallation.php`, alongside `/shop`, `/categories/{slug}`, `/cart`, `/checkout`, `/e-quotation`.

**Its real catalogue, not demo data:**

| Fact | Value |
|---|---|
| Products on `/shop` page 1 | **24** ("Showing 24 products") |
| Categories | **10** — reception-desk, cubicle-workstation, meeting-table, office-sofas, home-office-furniture, office-storages, executive-table, staff-table, executive-chairs, workstation |
| Real prices seen | Rs 35,000 · 42,000 · 45,000 · 48,000 · 50,000 · 52,000 · 55,000 · 62,000 · 65,000 · 70,000 · 72,000 · 75,000 · 80,000 · 82,000 · 130,000 · 145,000 · 155,000 · 185,000 |
| Product detail fields | SKU (`CT-10002`), name, category, price, stock badge, description, specs table, FAQs, related products |
| Images | `assets/images/products/{timestamp}_{name}.jpg` |

**And these defects, on the live site today.** They matter because the migration is not cosmetic — copying this data blindly copies the bugs:

| # | Defect | Evidence |
|---|---|---|
| D1 | **Impossible sale price** | *Ambassador Executive Table* — "Rs.185,000 → Rs.15,000, **92% OFF**". A CEO table priced below a chair. Almost certainly meant Rs 165,000. |
| D2 | **Warranty contradicts itself** | Badge says "**3 years** manufacturer warranty"; the description on the same page says "A **2-year** manufacturer's warranty". |
| D3 | **Wrong page title** | `/shop` title reads *"Shop Premium **Wardrobe Essentials** \| Store"* — leftover template text on an office-furniture store. |
| D4 | **Duplicated boilerplate copy** | Every chair shares one marketing paragraph that also talks about conference rooms, storage cabinets and bookcases. |
| D5 | **Empty structure** | Specifications tab has one row ("Lumbar support: Yes"); FAQ tab says "No FAQs available for this product." |
| D6 | **Malformed title tag** | Newlines and trailing spaces: `"\n        Black Pearl Executive Chair \| Shop  "`. |

> **Design consequence:** the importer must *validate*, not *copy*. D1 and D2 become blocking checks — a product whose sale price is more than 60 % below list, or whose warranty text disagrees with its warranty field, is quarantined for a human, not imported.

---

## 1. The decision that shapes everything

**WOODEX Furniture gets its own Laravel app — the same WOODEX OS codebase, deployed separately, scoped to `business_line = 'furniture'`.**

Why not run interior and furniture from one install:

- Interior already has a live domain and its own SEO history. A shared install means a shared deploy — one bad furniture migration breaks interior.
- The OS already models business lines (`BusinessLine` enum: `interior`, `furniture`, `project`), gives furniture its own `WF-` quote sequence and revenue account `4020`. Scoping is a column, not a fork.
- Both installs share the same **codebase** (one repo, one set of tests), so the furniture work still benefits interior and vice versa.

```
woodexfurniture.pk          woodexinterior.pk (unchanged)
┌─────────────────────┐     ┌─────────────────────┐
│ WOODEX OS (Laravel) │     │ WOODEX OS (Laravel) │
│ business_line =     │     │ business_line =     │
│   'furniture'       │     │   'interior'        │
│ /admin   (Livewire) │     │ /admin   (Livewire) │
│ /api     (REST)     │     │ /api     (REST)     │
│ /  (React build)    │     │ /  (v1 + CMS/Puck)  │
└─────────────────────┘     └─────────────────────┘
        same repository, two deployments, two databases
```

**Non-negotiable:** one database per install. No cross-site reads, no shared tables.

---

## 2. Frontend plan

### 2.1 Runtime — React, built to static files, served by Laravel

Hostinger has **no Node runtime**. Node is needed only to *build*, never to *serve*.

```
GitHub Actions (or a laptop)        Hostinger shared
  npm ci                              public/
  vite build            ──────►        ├── index.html      ← SPA shell
  prerender 23 routes                  ├── assets/*.js|css  ← hashed, immutable
                                       ├── prerendered/     ← 23 static HTML pages
                                       └── index.php        ← Laravel
```

- The React app is **same-origin** with Laravel: it calls `/api/storefront/v1/...`. No CORS, no proxy, no second domain, so no preflight on a shared host.
- Vite emits hashed assets → `Cache-Control: immutable`, which is the only cheap win available without a CDN.
- Laravel routes: `/api/*` → API, `/admin/*` → Livewire, **everything else → the SPA shell** (with the route's prerendered HTML if one exists).

### 2.2 SEO — prerender at build time, not runtime

The storefront's own titles today are broken (D3, D6), so this is a fix, not a tax.

- At build time, sign in to nothing, render each of the 23 routes headlessly, write `prerendered/shop/index.html`, etc.
- Crawlers and social scrapers get complete HTML; users get the hydrated SPA.
- `sitemap.xml` and JSON-LD (`Product`, `BreadcrumbList`, `FAQPage`) are generated by the Laravel API from the database — never hand-written in React.

**Measured gate:** every one of the 23 routes must return non-empty `<title>`, one `<h1>`, and a description of 50–160 chars. A page that fails this does not ship. This is how D3/D6 stop recurring.

### 2.3 Pages that must stop holding their own data

23 pages exist; **7** read the API. The other 16 render hard-coded arrays — the same class of defect already fixed twice on this project:

| Page group | Today | After |
|---|---|---|
| Shop, product, series, quotation, materials, **home** | ✅ API | keep |
| Showrooms | 5 invented addresses | API + one shared address list |
| Contact | form stores nothing | `POST /leads` → OS CRM |
| Projects, Blog, Services | hard-coded arrays | API + Puck content |
| About, Warranty, B2B, Custom Design, Room Packages | hard-coded copy | Puck content |
| Checkout, Cart | real (`/checkout/quote`, `/checkout`) | keep |

### 2.4 Delivery format

- **Mobile-first.** Pakistan traffic is majority mobile. The quote builder and product configurator must work on a 360 px screen.
- **Money** is integer paisa end-to-end; the browser only formats for display.
- **Degrade, never blank.** Every page renders the bundled snapshot first and swaps in the API when it answers. This already works on the 7 live pages and is why the storefront never shows a spinner where a grid should be.

---

## 3. Backend plan

### 3.1 The OS is the only backend

Nothing is built twice. Furniture commerce extends the existing Laravel app:

| Layer | Responsibility | Status |
|---|---|---|
| `App\Domain\Commerce\*` | Catalog, cart, checkout, billing, inventory | ✅ built, 430 checks passing |
| `App\Livewire\Admin\Commerce\*` | 17 admin screens | ✅ built |
| `App\Http\Controllers\Api\Storefront\*` | Public REST | ✅ built (products, categories, materials, checkout) |
| `App\Domain\Accounts\*` | Ledger, journals, invoices | ✅ exists in the OS |
| `App\Domain\Sales\*` | Quotes, estimates, `WF-` sequence | ✅ exists in the OS |
| `App\Domain\Crm\*` | Leads, contacts, `BusinessLine` | ✅ exists in the OS |

### 3.2 API surface for furniture

Already implemented: `GET /products`, `/products/{slug}`, `/categories`, `/materials`, `POST /checkout/quote`, `POST /checkout`.

Still to add (each is a thin controller over an existing domain class):

| Endpoint | Reads | Needed by |
|---|---|---|
| `GET /pages/{slug}` | Puck JSON, blocks resolved server-side | About, Blog, Services, Projects, Warranty, B2B |
| `GET /projects`, `/projects/{slug}` | Projects | Projects page |
| `GET /posts`, `/posts/{slug}` | Blog | Blog |
| `GET /services` | Services | Services |
| `GET /showrooms` | Showrooms table | Showrooms, Contact |
| `POST /leads` | → OS CRM `Lead` with `business_line=furniture` | Contact, B2B, Custom Design |
| `POST /quotes` | → Lead + Quote, returns `WF-` number + token | Quotation, E-Quotation |
| `POST /room-packages`, `GET /room-packages` | Bundles | Room Packages |
| `GET /search?q=` | MySQL FULLTEXT | Shop search |

**Every read is `Cache::remember` for 5 minutes and `Cache-Control: public, max-age=300`.** On 30 PHP workers, caching is the difference between a working shop and a 508.

### 3.3 Money rule (unchanged, non-negotiable)

> **Money never leaves the OS.** The browser never computes a total that is stored. `/checkout/quote` prices the basket server-side; `/checkout` writes an order and an invoice with a sequence number. A cart total is a *quote*; the invoice is authoritative.

### 3.4 The two money systems — resolved once, here

The OS has accounting tables (`invoices`, `payments`, `payment_allocations`, `journal_entries`). The Commerce build has `commerce_invoices` / `commerce_payments`. **Running both is the one mistake this plan exists to prevent.**

**Decision: the OS ledger wins.**

- A furniture order creates a **sale**, and its invoice posts to the OS ledger via the existing `PostInvoiceToLedger` action with `business_line='furniture'`.
- `commerce_invoices` is retired as a *source of truth*; it becomes a projection the invoice screen reads.
- The 14 Commerce screens are rewired to read OS ledger rows (T17, T20, T21, T24 are the affected ones).

This is more work than pasting the screens in, and it is the only version that survives an audit.

**Status: done (F2).** `OrderToLedger` raises the OS invoice for a placed order, and the
checkout calls it inside the placement transaction:

```
commerce order WDX-000001  (Rs 125,220)
   -> CRM contact #27            (matched on a normalised phone)
   -> invoice WFI-2026-0001      (kind = furniture_sale, status = issued)
   -> PDF frozen                 (invoices/01M6.../invoice-WFI-2026-0001.pdf)
   -> journal entry JE-2026-0001
        DR 1100 Accounts receivable   125,220
        CR 4020 Furniture revenue     106,500
        CR 2100 Taxes payable          18,720
        balanced
```

The second ledger is gone, not merely unused. `commerce_invoices`, `commerce_invoice_items`,
the `INV-` counter and the commerce printable document were removed; `commerce_payments` keeps
the gateway attempt and lost the invoice link; Commerce -> Invoices reads the OS invoices that
name a commerce order, and every row opens `admin.invoices.show`, where the document already is.

Verified in the running OS rather than in a fixture: three orders placed through the real
checkout each produced exactly one `WFI-` invoice, one balanced journal entry and one frozen
PDF; the trial balance moves; running the bridge twice leaves one invoice and one entry; and all
eighteen admin screens answer 200.

---

## 4. Database plan

### 4.1 New tables (from the Commerce build — 13, already migrated and seeded)

```
commerce_categories            commerce_products              commerce_product_translations
commerce_product_media         commerce_attributes            commerce_attribute_options
commerce_product_attribute_values
commerce_product_variants      commerce_variant_options
commerce_inventory_sources     commerce_inventory_items
commerce_carts                 commerce_cart_items            commerce_orders
commerce_order_items           commerce_refunds               commerce_sequences
```

### 4.2 Existing OS tables reused (not duplicated)

| Table | Used for | Change |
|---|---|---|
| `catalog_items` | **Rate book** — 6 furniture lines already priced (Dining table 4'6"×3'0" = Rs 13,500) | link `commerce_products.catalog_item_id` |
| `leads`, `contacts` | Enquiries from every form | add `business_line` filter |
| `quotes`, `quote_items` | E-Quotation | `WF-` sequence already exists |
| `invoices`, `payments`, `journal_entries` | **The ledger** | post commerce orders here |
| `pages`, `page_blocks` | Puck content | serve via `/pages/{slug}` |
| `users`, `roles`, `permissions` | Staff | add Commerce permissions |
| `media` | Images | store hero/product images |

### 4.3 The bridge that keeps prices honest

A product and its rate-book line must not disagree:

```
commerce_products.translates_to → catalog_items (nullable FK)
    price source of truth = catalog_items.rate_minor
    commerce_products.price_minor = derived, checked by a test
```

**Test:** for every product with a linked rate-book line, `price_minor == catalog_items.rate_minor`. If a merchandiser edits one and not the other, the build fails. This is precisely the class of bug already found on this project — `Materials.tsx` advertised six finishes the catalogue never had.

### 4.4 Migration & integrity rules

1. **Integer paisa.** No floats. `bigInteger price_minor`, always.
2. **Soft deletes** on products, orders, customers — an order line must never vanish because a product was removed.
3. **Money is immutable after posting.** An invoice is corrected by a credit note, never an `UPDATE`.
4. **Every write is idempotent** — `Idempotency-Key` on checkout and quote, 48 h table.
5. **Sequence health** — `commerce_sequences` next number must equal `max(issued) + 1`, checked on the Settings screen.

---

## 5. Content migration — v1 → data → API → delete

This is the "remove v1 HTML" instruction, done in the only order that doesn't lose content:

```
1. EXTRACT   read every v1 page → structured JSON (title, h1, body, meta, images, URL, JSON-LD)
2. VALIDATE  flag: missing title, duplicate copy, price anomalies, broken images, orphan URLs
3. SEED      write into `pages` (Puck document) + `posts` + `projects` + `services` + `showrooms`
4. SERVE     GET /pages/{slug} returns it; the React page renders it
5. VERIFY    every old URL returns 200 with the same h1 and the same body text
6. DELETE    remove the HTML files
7. REDIRECT  301 old URL → new URL (see the map below)
```

**Step 5 is the gate.** Nothing is deleted until its content is readable from the API and the new page renders the same words. Deleting first is how SEO disappears.

### 5.1 The 142 static HTML files — correction

I checked them. They are **WOODEX Interior** pages, not furniture:

> `1-kanal-house-design`, `2-kanal-house-design`, `apartment-interior-design`, `bathroom-design`, `beauty-salon-design`, `cafe-interior-design`, `commercial-fit-out`, `coworking-space-design`, `complete-home-redesign`, `3d-visualization`, `architecture`, `bahawalpur`…

Those are interior-design services and city landing pages. **They belong to the interior site**, which keeps its own domain.

So there are two different v1 migrations and they must not be confused:

| | WOODEX Interior (142 HTML) | WOODEX Furniture (PHP site) |
|---|---|---|
| Lives in | `woodexinterior/platform/public/**/index.html` | `woodexfurniture.pk` (PHP, separate host) |
| Owner of this task | interior | **this plan** |
| Action | extract → data → API, then delete **in the interior deployment** | extract products/categories/pages → data → API |

**Recommendation:** do not delete the 142 from the interior deployment as part of furniture work. If the goal is that the *furniture* OS must not carry interior's pages, the correct action is that the furniture deployment simply never publishes that folder — no deletion needed, nothing lost.

### 5.2 What furniture's v1 actually contains (to migrate)

| v1 URL | Becomes |
|---|---|
| `/` (4 hero slides + 10 categories + latest collection) | Puck `home` page + `commerce_categories` |
| `/shop` (24+ products) | `commerce_products` |
| `/shop/{slug}` | `commerce_products` + media + specs |
| `/categories/{slug}` (10) | `commerce_categories` |
| `/categories` | category index page |
| `/cart`, `/checkout` | React pages → `/api` cart + checkout |
| `/e-quotation` | React Quotation → `POST /quotes` (`WF-` sequence) |
| `/space_planing.php` | Service page (Puck) |
| `/projectbased.php` | Service page (Puck) |
| `/factorydirect.php` | Service page (Puck) |
| `/deliveryandinstallation.php` | Service page (Puck) |

---

## 6. Admin — merging Commerce into the OS

### 6.1 What happens

The 17 Commerce Livewire screens move from `woodex-reimagined/platform/` into the OS repo and appear as a **Commerce** group in the existing dark sidebar — after Sales, because their money flows through the same invoices and ledger.

```
Overview    Dashboard · Approvals · Reports
CRM         Leads · Contacts · Tasks & Visits
Sales       Estimations · Quotations · Invoices · Payments · Documents
Commerce    Dashboard · Products · Attributes · Categories · Inventory
            Orders · Invoices · Payments · Refunds · Promotions
            Shipping & tax · Customers · Reports · Settings
Accounts    Chart of Accounts · Journals · Trial balance · Profit & loss …
```

### 6.2 Why they connect cleanly

They were written against the OS's own shell from the start — every screen is `#[Layout('layouts::admin')]` and uses `App\Livewire\Concerns\InteractsWithAdmin` for permissions. I verified that concern exists in the OS.

### 6.3 What does not connect yet (the honest list)

| Missing | Effect | Fix |
|---|---|---|
| `App\Domain\Commerce\*` (domain classes) | screens 500 | copy package |
| `commerce_*` migrations | tables absent | run migrations |
| Commerce permissions | screens 403 | seed `commerce.*` |
| Ledger rebinding (§3.4) | two money systems | rewire 4 screens |
| Nav registration | no sidebar entry | add `AdminNavigation` group |

### 6.4 Verification gate

Not "it looks fine". Before the merge is called done:

- `php artisan route:list` shows all 17 routes
- their `smoke.sh` passes for every new route (currently **87 pages, all 200** — must become 104)
- the 430-assertion commerce suite passes **inside the OS repo**
- one real order is placed through checkout and its invoice is visible in **Accounts → Invoices**

---

## 7. Bagisto — my recommendation

**Do not add Bagisto. Keep the OS-native Commerce screens.**

You asked directly, so here is the direct answer.

| Reason | Detail |
|---|---|
| **Your own standing rule** | Permanent correction: *"do NOT run Bagisto as an engine or separate site; WOODEX OS is the single master admin; Bagisto's features are built INTO the OS."* Merging Bagisto reverses that. |
| **It cannot run on your hosting** | Bagisto 2.5 needs PHP 8.4 ✓, but also **Node 22 at build**, **Redis for queues**, **MySQL 8.0.32+**, and its own community says "you must have a VPS". Hostinger shared gives ~30 PHP workers and no Redis. |
| **The features already exist here** | 17 screens, 430 checks, 16,400 assertions — products, variants, inventory, orders, invoices, payments, refunds, promotions, shipping & tax, reports, customers, attributes, categories, settings. That *is* the Bagisto feature set, rebuilt. |
| **It would create a second admin** | Two sidebars, two permission systems, two catalogs. Exactly the failure mode the plan forbids. |
| **Divergence cost** | Bagisto ships frequently. A vendored fork becomes unmergeable within months, and you own the merge forever. |

**What is worth taking from Bagisto:** specific MIT-licensed algorithms, ported with attribution and a test — their indexer/price-index approach, cart price rules, and the tier-price resolution order. That is code you read, adapt, attribute and test. It is not a package you install.

If you still want Bagisto specifically — as a **reference to compare screen-by-screen**, not a dependency — say so and I will build a parity checklist against it.

---

## 8. Phases

| # | Phase | Deliverable | Done when | Est. |
|---|---|---|---|---|
| **F0** | **Crawl the real store** | `products.json`, `categories.json`, `pages.json` from woodexfurniture.pk | 24+ products with SKUs, prices, images, categories — anomalies quarantined | 1–2 d |
| **F1** | **Commerce into OS** | 17 screens in the dark sidebar | `smoke.sh` 104/104 · commerce suite green in OS repo | 4–5 d |
| **F2** | **Ledger rebinding** | one money system | order → invoice → **Accounts** with `business_line=furniture` | 3–4 d |
| **F3** | **Import** | real catalogue in DB | every v1 product & category present, price links verified | 2–3 d |
| **F4** | **Catalog API** | full read/write API | reimagined frontend reads 100 % from API, 0 hard-coded arrays | 3–4 d |
| **F5** | **Content → Puck** | pages in DB | every v1 content URL served by `/pages/{slug}` | 3–4 d |
| **F6** | **Frontend build** | static build + prerender | 23 routes, title/h1/description gate passes | 3–4 d |
| **F7** | **Switch** | furniture domain on OS | 301 map live, v1 PHP retired, 0 404s on old URLs | 2–3 d |
| **F8** | **Hardening** | load probe, backups, rollback | 30 concurrent + 5 checkouts, p95 < 1.5 s, 0 oversell | 2–3 d |

**Total ≈ 23–32 working days** for one developer; ~3 weeks with two.

**Order matters:** F1 before F3 (you cannot import into screens that don't exist), F2 before F7 (never switch the domain while two ledgers run), F5 before F7 (never delete content before it is served).

---

## 9. Non-negotiables

1. **One database per install.** No shared tables between furniture and interior.
2. **One admin** — the OS. No second sidebar, no Bagisto.
3. **Money never leaves the OS.** Browser quotes, server stores.
4. **Integer paisa.** No float touches a price.
5. **Nothing is deleted until it is served.** Content first, then delete, then 301.
6. **Imported data is validated, not copied.** D1/D2 are blocking checks.
7. **Hostinger reality** — no Node at runtime, no Redis, no SSH, ~30 workers, every read cached.
8. **Every screen is verified in a real browser**, not just by source-text tests.

---

## 10. Open questions

1. **The 142 HTML files** — confirm they are interior's and stay untouched by this project (my reading), or do you want them extracted to data + API and removed from the furniture OS deployment?
2. **Frontend runtime** — React SPA + build-time prerender (recommended, keeps all 23 designed pages) or convert content pages to Blade/Puck (staff-editable, bigger rebuild)?
3. **Bagisto** — accept my recommendation (no vendoring), or do you want it added despite §7?
4. **Catalogue source** — may I crawl `woodexfurniture.pk` fully to import the real 24+ products, or will you supply an export/database dump (faster and exact)?
