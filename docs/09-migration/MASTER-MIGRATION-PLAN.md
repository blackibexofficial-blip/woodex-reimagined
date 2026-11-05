# Master Migration Plan — IBPanel & woodexfurniture.pk → Woodex OS

**Date:** 2026-11-05
**Target system:** Laravel Woodex OS, branch `arena/0378ff53-woodex-reimagined`, commit `4becb17`
**Sources:** legacy MariaDB dump `u128159657_woodexbaks.sql`, Drive folder `1oww6rFqvwHBqrJKKPJ5Kme4pD10BAvJ2`, live site `woodexfurniture.pk`
**Decisions taken:** Laravel OS is the destination · Bagisto modelled natively, not installed · data first · legacy transactions imported as history

---

## 1. What exists today — measured, not assumed

### 1.1 Legacy database (`u128159657_woodexbaks.sql`)

Dumped 2026-11-03 from MariaDB 11.8.9 / PHP 7.2.34. **41 tables, 637 rows.**

| Group | Tables | Rows | Notes |
|---|---|---:|---|
| Catalog | `products` | **171** | 20 columns; all `simple` type; 5 in `product_variations` |
| | `categories` | **53** | 3-level tree (3 / 16 / 34), 28 columns of merchandising fields |
| | `product_categories` | **204** | many-to-many links; 0 orphan links |
| | `attributes` / `attribute_values` | 4 / 8 | Size, Status, color, New |
| | `brands` | 1 | |
| Content | `faqs` | **87** | polymorphic: `faq_for` + `item_id` |
| | `footer_links` | 18 | 4 sections |
| | `footer_settings` | 1 | 28 columns |
| | `topbar_settings` | 1 | |
| | `hero_sliders` / `hero_slides` / `hero_slides_alt` | 1 / 3 / 4 | two competing slide schemas |
| | `blogs` | 3 | 2 are duplicates/test |
| | `projects` | 3 | 1 is a placeholder row |
| | `customer_reviews` / `reviews` | 5 / 3 | two competing review tables |
| | `sale_page_settings` | 1 | |
| Commerce | `orders` / `order_items` | 5 / 6 | |
| | `pos_transactions` / `pos_transaction_items` | 3 / 5 | full POS ledger |
| | `pos_refunds` / `pos_refund_items` | 1 / 1 | |
| | `quotation_requests` / `quotation_request_items` | **11 / 25** | |
| | `coupons` | 0 | table exists, never used |
| Ops | `url_redirects` | 1 | live site has far more in `.htaccess` |
| | `contact_forms` | 1 | |
| | `users` | 1 | single admin |
| | `email_settings` | 1 | 15 columns, raw SMTP |
| Empty | `customers`, `subscribers`, `doctors`, `pos_bank_accounts`, `pos_payment_apps`, `pos_replacements`, `pos_replacement_items`, `product_attributes`, `product_attribute_terms` | 0 | schema only |

**Data quality — must be cleaned during ETL, not after:**

- Leading/trailing spaces on nearly every value (`' Office Furniture '`, `' simple'`, SKU `' SKU: EC-10001 '`).
- **34 of 171 products priced 0.00.** Cannot publish without a price decision.
- Test rows: hero slide 3 is `sss`/`ssssss`; project 1 is "Project Title"; blog 1 is "This is test blog".
- Duplicate blog titles with `-1` suffixed slugs.
- `old_price` is `0.00` on many rows while `current_price` is set — the "was" price is unreliable.
- Literal `\r\n` inside hero titles (`Best Seller\r\nSofa & Collection`).
- Two review tables and two hero-slide tables hold overlapping data — pick one, quarantine the other.

### 1.2 Drive folder — 7 items

| File | Size | Status | Role |
|---|---:|---|---|
| `woodex furniture os .zip` | 2.1 MB | analysable | PHP 8 API-first OS: `wx_*` schema (22 tables), 350 admin actions, 26 builder actions, 18 MCP tools |
| `woodex (1).zip` | 36.8 MB | analysable | Older legacy storefront, includes `lbpanel/` (418 files), 40 root PHP pages |
| `frontstore.zip` | 83.2 MB | **RAR5 mislabelled `.zip`** | Newer storefront: 51 root pages, 460 images, 13 `api/` scripts |
| `woodexfurniture.pk (1).zip` | **150 MB** | **not retrievable** | Exceeds the Drive connector's 100 MB limit. Contents unknown. |
| `MASTER_AUDIT_REPORT_2026-11-05` (.md + Doc) | 41 KB | read | Full static audit of the three analysable archives |
| `Audit_Appendices.zip` | 49 KB | not yet read | API inventory, DB schema, security findings, routes |

**The three archives are two generations of one business, not three systems.** 39 files are byte-identical between `site` and `frontstore` → `frontstore` is a later derivative. The `os` archive is backend/admin only, not a storefront.

**The 150 MB archive is not a blocker for data.** Media can be pulled directly from the live site (verified reachable). It only matters for historical source, which the audit already covers for the other three.

### 1.3 Live site — the public contract

Reachable and content-verified. Structure that must be reproduced:

- **Top bar:** Showrooms · Material and Colors · Warranty · Sale
- **Header:** Products ▾ · Markets ▾ · Series ▾ · Projects · Services · Blog · About · Contact · Custom Design · search · account · cart · **E-Quotation** button
- **Home:** 5-slide hero, "Market We Served" (5 service cards), 10-category carousel, Latest Collection product grid
- **Pages:** `/shop` `/cart` `/checkout` `/sale` `/blog` `/projects` `/about-us` `/contact-us` `/services` `/showrooms` `/e-quotation` `/terms-and-conditions` `/material-and-color` `/planning-ideas` `/delivery-installation` `/workspace-design`
- **Legacy PHP pages still live:** `space_planing.php`, `projectbased.php`, `factorydirect.php`, `deliveryandinstallation.php`, `showrooms.php`
- **Footer:** 4 link columns (Quick Links, Shop, Learn More, Contact) + newsletter + payment logos + socials + legal links

### 1.4 Woodex OS — the destination today

132 tables. The commerce module is **already Bagisto-shaped**, which is why "emulate, don't install" costs almost nothing:

```
commerce_products (25 cols)      sku, type, status, slug, series, brand, material, frame,
                                 dimensions, price_minor, compare_at_minor, cost_minor,
                                 warranty_months, lead_time_days, is_featured, rating_x10
commerce_product_translations    name, summary, description, features, specifications,
                                 meta_title, meta_description
commerce_categories (11 cols)    parent_id, slug, code, path, image_path, show_in_menu
commerce_product_variants (14)   sku, barcode, price_minor, weight_g, status
commerce_attributes (12)         code, type, swatch_type, is_filterable, is_variant
commerce_attribute_options (9)   value + hex + swatch_path
commerce_product_media (13)      disk, path, alt, kind, width, height, is_primary
commerce_carts / cart_items / cart_addresses
commerce_orders (24)             number, source, status, payment_status, subtotal_minor,
                                 discount_minor, tax_minor, grand_total_minor, paid_minor,
                                 refunded_minor, coupon_code, placed_at
commerce_order_items (16)
commerce_inventory_items / reservations / sources
commerce_payments
commerce_sequences
```

Also present: `site_pages` (15 cols — **already carries `puck_data` and `canvas_html`, i.e. the page-builder data model**), `media` (Spatie-shaped, 18 cols, empty), `quote_*` (6 tables), `redirects`, `leads`.

Current content: **20 products, 24 categories, 16 site pages, 30 content records, 137 redirects, 67 published files.**

---

## 2. Gap analysis — legacy module → OS destination

| # | IBPanel module | Legacy table(s) | OS destination | Gap |
|---:|---|---|---|---|
| 1 | Product | `products` 171 | `commerce_products` + `_translations` + `_media` | **Import.** `images` JSON → media rows. `product_details` → `description`. `specifications` → `specifications`. `old_price` → `compare_at_minor`. |
| 2 | Category | `categories` 53 | `commerce_categories` + `_translations` | **Schema extension.** OS has 11 cols; legacy uses 28. Add merchandising flags + hero fields (§4.6). |
| 3 | Product ↔ Category | `product_categories` 204 | `commerce_product_categories` | Direct map. |
| 4 | Variations | `product_variations` 5 | `commerce_product_variants` | Map `variation_data` → variant option links. |
| 5 | Attributes | `attributes`, `attribute_values` 4/8 | `commerce_attributes` + `_options` | Map sizes/colours to swatch options. |
| 6 | Orders | `orders` 5 + items | `commerce_orders` (`source='web'`) + `_order_items` | Import as history; `total_amount` → `grand_total_minor`. |
| 7 | POS | `pos_transactions` 3, `pos_refunds` 1 | `commerce_orders` (`source='pos'`) + `commerce_payments` | Refund → `refunded_minor` + status history. |
| 8 | Quotation requests | `quotation_requests` 11 / 25 | `quotes` / `quote_items` (verify shape) or `leads` + basket | Map `quote_no` → quote reference; keep basket lines. |
| 9 | E-Quotation builder | (customer-facing basket) | storefront quote basket + `quotes` | **Build** — does not exist in OS. |
| 10 | Hero Slider | `hero_sliders`, `hero_slides`, `hero_slides_alt` | **new** `site_hero_slides` + admin module | **Build.** Pick `hero_slides` (19 cols) as canonical; quarantine `_alt`. |
| 11 | Header / mega menu | hardcoded PHP + `categories` tree | `site_menus` + `site_menu_items` | **Build** menu builder driven by category tree. |
| 12 | Top Bar | `topbar_settings` | `site_settings` (key/value) | **Build** settings module. |
| 13 | Footer | `footer_settings` (28) + `footer_links` (18) | `site_settings` + `site_footer_links` | **Build.** 28 named fields → grouped settings. |
| 14 | FAQs | `faqs` 87 | **new** `faqs` (polymorphic) | **Build** + admin CRUD + storefront accordion. |
| 15 | Blog | `blogs` 3 | CMS content (`pages`/content records) | Import 1 real post, discard 2 test rows. |
| 16 | Projects | `projects` 3 | OS projects module | Import 2 real, discard placeholder. |
| 17 | Reviews | `reviews`, `customer_reviews` 3+5 | **new** `commerce_reviews` | **Build.** Feed `rating_x10` / `review_count` on products. |
| 18 | Sale page | `sale_page_settings` | `site_pages` row + `is_sale` flag | Map to a CMS page. Only 1 product is flagged `is_sale_item`. |
| 19 | Hot products | `show_in_hot_products` flags | `commerce_products.is_featured` + category flags | Map. |
| 20 | SEO & redirects | `url_redirects` 1 | `redirects` (already 137) | Import + **crawl live site for the full map** (legacy `.htaccess` holds the rest). |
| 21 | Contact forms | `contact_forms` 1 | `leads` | Import submission as lead history. |
| 22 | Customers | `customers` 0 | `customers` | Empty — derive customers from orders/quotations. |
| 23 | Mail settings | `email_settings` 15 | `.env` + `site_settings` | Do **not** import SMTP passwords; re-enter as env. |

### The three things that block everything

1. **`PageRenderer` does not exist.** `site_pages` can store `puck_data`/`canvas_html`, but nothing renders a page from the CMS. Until it does, no CMS page can reach the storefront. This is the single highest-leverage item and it is a prerequisite for modules 10–18.
2. **Categories are 11 columns wide; legacy uses 28.** The category hero / carousel / series-block design shown on the live site cannot be represented.
3. **No settings layer.** Header, top bar, footer, hero and sale page all need a settings store that survives publish.

---

## 3. Phase plan

Ordering is dependency-driven, not preference-driven. Each phase ships something verifiable in the running preview.

### Phase 0 — Foundations (blocks all)
- `PageRenderer`: CMS row → rendered route, with draft/publish, preview token, and cache invalidation.
- `site_settings` key/value store + admin screen (top bar, footer, hero, sale-page config).
- Category schema extension (migrate 11 → 30 columns, backward compatible).
- Migration harness: `legacy:*` artisan commands that read the SQL dump into a `legacy_*` staging schema — never straight into live tables.
- **Exit:** a CMS page renders at a real URL; settings save and survive publish.

### Phase 1 — Catalog & media  ← *first milestone (chosen)*
- ETL 171 products, 53 categories, 204 links, 5 variations, 4 attributes.
- Media pipeline: fetch every product/category image from the live site, normalise, generate WebP + thumbnails, write `commerce_product_media` rows.
- Clean-room rules: trim, dedupe slugs, drop test rows, flag zero-price products into a review queue (do not publish them silently).
- **Exit:** `/shop` lists 171 real products with images; category pages resolve; counts match the source and are printed by the command.

### Phase 2 — Page builder & content modules
- Block library: hero, category grid, product carousel, product grid, FAQ, testimonial, CTA banner, rich text, gallery, footer strip.
- Builder UI on `puck_data`; live preview; versioning via `site_pages`.
- Hero slider module → storefront carousel.
- Header/mega-menu builder, top bar, footer builder.
- **Exit:** the home page is assembled in the admin from blocks and matches the live site's structure, published by an explicit **Publish** action.

### Phase 3 — Storefront parity
- Home, category, product, shop, sale, blog, projects, showrooms, FAQ, contact.
- Cart → checkout → order.
- E-Quotation basket + submission.
- **Exit:** side-by-side with `woodexfurniture.pk`, same pages, same structure, same content.

### Phase 4 — Commerce depth (Bagisto model)
- Attributes/variants enforcing option selection; inventory reservations on order.
- Coupons, tax, shipping, payments.
- POS surface + refunds/replacements.
- **Exit:** a POS sale and a web order both land in `commerce_orders` with correct money fields.

### Phase 5 — CRM & integrations
- Leads from every form; quotations pipeline; customers derived from orders.
- SEO: meta per page, sitemap, schema.org Product/FAQ/Breadcrumb, redirect manager.
- WhatsApp / Telegram / SMTP from the settings layer.

### Phase 6 — Cutover
- Full redirect map for every legacy URL (crawl + `.htaccess` + `url_redirects`).
- Deploy v1.x on Hostinger; DNS switch; 301 verification; analytics.

---

## 4. Detail: the parts you called out

### 4.1 Page builder — complete plan

**Data model (already exists):** `site_pages.puck_data` holds the block tree; `site_pages.canvas_html` holds compiled output; `status` drives draft/published; `updated_by` gives an audit trail.

- **Block schema:** each block = `{id, type, props, children}`. Registry of ~14 block types, each with a JSON schema for props, so the editor can validate and the renderer can be dumb.
- **Renderer:** server-side Blade renderer over `puck_data` → HTML. No client-side JS required for a published page. This is what makes it fast and SEO-safe.
- **Editor:** drag/drop canvas, block palette, inspector panel, responsive preview (desktop/tablet/mobile), undo/redo, autosave drafts.
- **Publish:** explicit button → compiles pages → writes `canvas_html` → publishes files → updates sitemap. Nothing goes live silently (standing rule).
- **Versioning:** every publish snapshots `puck_data` (mirrors the 30-backup behaviour of the old builder, but in the database).
- **Integration:** blocks that surface catalog data (product grid, category grid, carousel) query `commerce_*`, so content and catalog never diverge.

### 4.2 Frontend — what gets rebuilt

| Element | Source of truth | Notes |
|---|---|---|
| Top bar | `site_settings` | Showrooms · Material & Color · Warranty · Sale |
| Header + mega menu | `site_menus` + category tree | 3-level: Office Furniture / Home Furniture / Series with images |
| Hero | `site_hero_slides` | 5 slides, per-slide colours, CTA, schedule window (`start_at`/`end_at`) |
| Market We Served | CMS block | 5 service cards → link to planning/custom/e-quote/factory/delivery |
| Category carousel | `commerce_categories` flags | 10 home-carousel categories |
| Latest Collection | `commerce_products.is_featured` | Live prices |
| Reviews | `commerce_reviews` | Feeds product ratings |
| Footer | `site_settings` + `site_footer_links` | 4 columns, newsletter, payments, legal |

### 4.3 Commerce — why native beats installing Bagisto

Bagisto's value is its *model*, not its code: attribute sets, variants, carts, inventory, orders, invoices, refunds, POS. The OS already has 23 commerce tables covering that model. Installing Bagisto would add a second admin, a second auth system, a second schema and a Composer footprint measured in hundreds of megabytes — the same "two divergent stacks" problem the audit flags as the project's biggest structural risk.

**Decision: implement the Bagisto model in the OS.** Concrete work: enforce variant option selection, add inventory reservation on cart add, add coupon rules, complete the order state machine, add invoices/refunds on top of `commerce_payments`.

### 4.4 Data quality rules for the ETL

1. Trim every string; collapse internal whitespace.
2. Convert `\r\n` → real newlines (hero titles).
3. Slug: lowercase, strip SKU prefix noise (`SKU: EC-10001` → `EC-10001`), dedupe with `-2`, `-3`.
4. Money: legacy `decimal(10,2)` → integer minor units. Never float.
5. **Zero-price products are quarantined**, not published. 34 rows need a price decision from you.
6. Test rows are excluded by rule (`sss`, `Project Title`, `This is test blog`) and listed in the report.
7. Two competing tables (hero slides, reviews) → one canonical, other archived to `legacy_*`.
8. Every imported row keeps `legacy_id` + `imported_at` for traceability and rollback.
9. Idempotent: re-running the import must not duplicate. Verified by row counts before/after.

### 4.5 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| 150 MB archive never inspected | Unknown legacy pages/media may be missing | Media pulled from live site; audit covers other three archives |
| 34 zero-price products | Catalogue looks broken if published | Quarantine + review queue |
| Building on demo data | Migration looks done but isn't | Acceptance = counts match source, printed by command |
| Two stacks drifting again | The audit's #1 structural risk | One repo, one schema, migrations only |
| Sandbox resets | ~25 min rebuild per session | Move review to Hostinger after Phase 1 |

---

## 5. Immediate next actions (Phase 1 start)

1. **Legacy staging loader** — parse the dump into `legacy_*` tables; assert 41 tables / 637 rows.
2. **Category schema extension** — 11 → 30 columns, reversible migration.
3. **Catalog importer** — `php artisan migrate:catalog --dry-run` prints the plan (171 products, 53 categories, 204 links) without writing; then `--commit`.
4. **Media fetcher** — pulls the 460 live images, dedupes by hash, writes `commerce_product_media`.
5. **Verification command** — compares source vs destination counts and exits non-zero on mismatch.

**Acceptance for Phase 1:** `/shop` in the running preview shows 171 products with real images and real prices, category tree resolves 3 levels deep, and the verification command reports zero mismatches.

---

*Sources verified 2026-11-05: SQL dump parsed (41 tables, 637 rows), Drive folder listed (7 items), live site fetched, OS schema read from the running SQLite database (132 tables).*
