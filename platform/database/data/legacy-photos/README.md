# Recovered legacy product photography

137 product photographs recovered from the `frontstore.zip` archive (RAR5, mislabelled `.zip`)
in the Drive folder, matched to products through `media-manifest.json` — the mapping the legacy
database itself produced, not by guessing from filenames.

The filenames were renamed in the new catalogue (BALLMER, DYNASTY, THRONE are new names for
Elite, Imperial, Command…), so name matching gives false positives. `manifest.json` here is the
authoritative SKU → file map; it is what `php artisan commerce:import-images` consumes.

Reproduce on any server:

    php artisan commerce:import-images --path=database/data/legacy-photos

Add `--force` to replace existing photos. The command generates the WebP card/detail sizes and
writes rows to `commerce_product_media`; it never overwrites a product that already has one
unless forced.
