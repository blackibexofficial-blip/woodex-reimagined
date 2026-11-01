<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Commerce\Media\GdTransformer;
use App\Domain\Commerce\Media\ImageStore;
use App\Domain\Commerce\Media\ImageVariant;
use App\Domain\Commerce\Media\MediaPath;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Models\ProductMedia;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Puts photographs on the products (docs/08 §7.4).
 *
 * The catalogue has 20 products and, until now, no images at all: `commerce_product_media` was empty, so
 * every card in the shop answered `"image": null` and the busiest page on the site was a grid of empty
 * boxes. The storage side was already built (`ImageStore` writes three WebP sizes per photo), but nothing
 * called it and no route served the result.
 *
 *   php artisan commerce:import-images                       # from database/data/product-photos
 *   php artisan commerce:import-images --path=/srv/photos     # a folder with a manifest.json
 *   php artisan commerce:import-images --force                # replace existing photos
 *
 * The manifest is `{"photos": {"WX-1001": "executive.jpg", ...}}`. A product that already has a photo is
 * left alone unless `--force` is given, so running this on every deploy cannot overwrite what the owner
 * uploaded in the admin.
 */
final class ImportProductImagesCommand extends Command
{
    protected $signature = 'commerce:import-images
                            {--path=database/data/product-photos : folder holding manifest.json and the photos}
                            {--force : Replace photos that already exist}';

    protected $description = 'Attach photographs to products and generate their WebP sizes';

    public function handle(): int
    {
        $base = (string) $this->option('path');
        $base = str_starts_with($base, '/') ? $base : base_path($base);
        $manifestFile = $base.'/manifest.json';

        if (! is_file($manifestFile)) {
            $this->components->error('No manifest at '.$manifestFile.' — nothing to import.');

            return self::FAILURE;
        }

        /** @var array{photos?: array<string, string>} $manifest */
        $manifest = (array) json_decode((string) file_get_contents($manifestFile), true);

        $photos = (array) ($manifest['photos'] ?? []);

        if ($photos === []) {
            $this->components->error('The manifest lists no photos.');

            return self::FAILURE;
        }

        $store = new ImageStore(storage_path('app/public'), new MediaPath, new GdTransformer);

        $attached = 0;
        $skipped = 0;
        $failed = 0;

        foreach ($photos as $sku => $filename) {
            $product = Product::query()->where('sku', (string) $sku)->first();

            if ($product === null) {
                $this->components->twoColumnDetail((string) $sku, '<fg=yellow>no such product</>');
                $failed++;

                continue;
            }

            $hasPhoto = ProductMedia::query()->where('product_id', $product->id)->exists();

            if ($hasPhoto && ! $this->option('force')) {
                $skipped++;

                continue;
            }

            $file = $base.'/'.basename((string) $filename);

            if (! is_file($file)) {
                $this->components->twoColumnDetail((string) $sku, '<fg=red>missing file '.$filename.'</>');
                $failed++;

                continue;
            }

            $contents = (string) file_get_contents($file);
            $result = $store->store((string) $product->sku, (string) $filename, $this->mimeFor($file), $contents);

            if (! $result['ok'] || $result['hash'] === null) {
                $this->components->twoColumnDetail((string) $sku, '<fg=red>'.($result['reason'] ?? 'could not store').'</>');
                $failed++;

                continue;
            }

            $hash = (string) $result['hash'];
            $paths = new MediaPath;

            if ($this->option('force')) {
                ProductMedia::query()->where('product_id', $product->id)->delete();
            }

            ProductMedia::query()->create([
                'product_id' => $product->id,
                'variant_id' => null,
                'disk' => 'public',
                // The hero file's name carries the content hash, which is how ProductCard recovers it.
                'path' => $paths->filePath((string) $product->sku, $hash, ImageVariant::Hero),
                'alt' => $this->altFor($product),
                'kind' => ProductMedia::KIND_IMAGE,
                'width' => null,
                'height' => null,
                'is_primary' => true,
                'position' => 0,
            ]);

            $attached++;
        }

        // The catalogue is cached; a new photo must not wait for it to expire.
        cache()->flush();

        $this->newLine();
        $this->components->twoColumnDetail('Photos attached', (string) $attached);
        $this->components->twoColumnDetail('Already had one', (string) $skipped);
        $this->components->twoColumnDetail('Failures', $failed > 0 ? '<fg=red>'.$failed.'</>' : '0');
        $this->components->twoColumnDetail('Stored under', 'storage/app/public/'.(new MediaPath)->directoryFor('SKU'));

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }

    private function mimeFor(string $file): string
    {
        return match (strtolower(pathinfo($file, PATHINFO_EXTENSION))) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            'avif' => 'image/avif',
            default => 'image/jpeg',
        };
    }

    /**
     * Alt text is not decoration: it is what a screen reader says and the only description an image has for
     * a search engine. It is written from the product's own name, and can be edited afterwards in the admin.
     */
    private function altFor(Product $product): string
    {
        $name = (string) DB::table('commerce_product_translations')
            ->where('product_id', $product->id)
            ->where('locale', 'en')
            ->value('name');

        return ($name !== '' ? $name : 'Office furniture').' — WOODEX Pakistan';
    }
}
