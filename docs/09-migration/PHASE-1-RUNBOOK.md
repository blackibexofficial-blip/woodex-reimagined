# Phase 1 runbook — catalogue import

Everything in Phase 1 has been run against the real dump except **step 4**, which
needs internet access to `woodexfurniture.pk`. The build sandbox cannot reach it
(egress is limited to GitHub and npm), so step 4 runs on the Hostinger box or a
workstation. Steps 1–3 and 5 are already done and verified in the preview.

```sh
# 0. One-time, inside the app
php artisan migrate --force

# 1. Read the dump (no database writes)
php tools/migration/parse-legacy.php u128159657_woodexbaks.sql --out=legacy-manifest.json

# 2. See exactly what the import will do
php artisan commerce:import-legacy --manifest=legacy-manifest.json

# 3. Apply it
php artisan commerce:import-legacy --manifest=legacy-manifest.json --commit --archive-demo

# 4. ON A HOST WITH INTERNET — fetch the photographs
#    (reads storage/app/migration/media-manifest.json, written by step 3)
php tools/migration/fetch-legacy-media.php \
    --manifest=storage/app/migration/media-manifest.json \
    --out=database/data/legacy-photos \
    --base=https://woodexfurniture.pk/

php artisan commerce:import-images --path=database/data/legacy-photos

# 5. Verify
php artisan commerce:import-legacy --manifest=legacy-manifest.json          # dry run must report 0 created, 137 updated
```

## Expected numbers

| | |
|---|---:|
| Categories | 53 (40 created, 13 adopted by slug) |
| Products | 137 published |
| Category links | 169 |
| Quarantined | 34 — 33 zero-priced, 1 placeholder |
| Photos | 137 (one per product; **no product has a gallery**) |
| SKUs derived | 49 — 24 had no SKU, 13 SKUs were shared by 49 products |

## What was verified in the running preview

- `/api/storefront/v1/products` → 137 rows over 3 pages, `meta.total` = 137
- `/shop` renders **137 products from the database**, not the bundled snapshot
  (proof: "Ambassador chairs Executive", an imported product, appears; "BALLMER
  Executive Desk", a snapshot product, does not)
- 0 broken images, 0 page errors, storefront suite 56 passed / 531 assertions
- Category counts match SQL — `reception-desk` 21 in both
- Re-running the import twice: `0 created, 137 updated` both times

## Things that will bite if ignored

**The catalogue cache.** Keys are hashed query shapes, so nothing can enumerate
them. `CatalogCache::bump()` namespaces every key with a generation counter and is
called at the end of the import. If you ever write products by another route
(console, SQL, a seeder), call it or the shop serves stale answers for the TTL:

```sh
php artisan tinker --execute="App\Domain\Commerce\Api\CatalogCache::bump();"
```

**The 33 zero-price products.** They are excluded, not published at 0. Give them
prices and re-run the importer with an updated manifest — or leave them out.

**One photo per product.** The legacy catalogue has no galleries. Every product
page will show a single image. That is a content problem, not a code one.

**`quantity` is not stock.** 101 of 137 are 0, the rest are 10/20, one is 1950
(equal to its own price). It was a placeholder, so imported products are flagged
`is_made_to_order`, which is true of a furniture manufacturer and keeps them
sellable. If some lines really are stocked, set the flag to 0 and give them
inventory through the admin.

## Rollback

```sh
php artisan migrate:rollback --step=1   # removes is_made_to_order
php artisan migrate:rollback --step=1   # removes the category fields + legacy_id
```

Or delete by anchor, leaving anything created by hand:

```sql
DELETE FROM commerce_product_categories WHERE product_id IN (SELECT id FROM commerce_products WHERE legacy_id IS NOT NULL);
DELETE FROM commerce_product_translations WHERE product_id IN (SELECT id FROM commerce_products WHERE legacy_id IS NOT NULL);
DELETE FROM commerce_product_variants WHERE product_id IN (SELECT id FROM commerce_products WHERE legacy_id IS NOT NULL);
DELETE FROM commerce_products WHERE legacy_id IS NOT NULL;
DELETE FROM commerce_categories WHERE legacy_id IS NOT NULL;
```
