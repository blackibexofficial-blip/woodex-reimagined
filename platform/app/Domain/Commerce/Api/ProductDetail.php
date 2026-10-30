<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Api;

use App\Domain\Commerce\Media\ImageVariant;
use App\Domain\Commerce\Media\MediaPath;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Models\ProductMedia;

/**
 * The full product page payload — the contract the storefront already renders.
 *
 * A card is enough for a grid; a product page needs the description, every image, the
 * specifications table, the colours and the delivery promise. All of it is served from here so
 * the SPA never has to hold a second copy of the catalogue to fill in the gaps.
 *
 * The mapping is deliberately two-stage: `fromModel()` reads Eloquent, `fromArray()` does the
 * shape work. Only the second one contains a decision, so the second one is what the tests
 * exercise — a product page that shows the wrong colour hex is a data bug that a mapper test
 * catches in milliseconds and a browser test catches in a week.
 */
final readonly class ProductDetail
{
    /**
     * @param  list<string>  $images
     * @param  list<array{code: string, name: string, hex: string|null, image: string|null}>  $colors
     * @param  list<array{label: string, value: string}>  $specifications
     * @param  list<string>  $features
     * @param  list<string>  $materials
     */
    public function __construct(
        public int $id,
        public string $sku,
        public string $slug,
        public string $name,
        public string $summary,
        public string $description,
        public ?string $category,
        public ?string $categorySlug,
        /** @var list<string> slugs root → leaf */
        public array $categoryPath,
        public ?string $subcategory,
        public ?string $series,
        public int $priceMinor,
        public ?int $compareAtMinor,
        public int $discountBp,
        public bool $inStock,
        public int $availableQty,
        public bool $isFeatured,
        public ?float $rating,
        public int $reviewCount,
        public ?string $image,
        public ?string $imageSrcset,
        public array $images,
        public array $colors,
        public array $specifications,
        public array $features,
        public array $materials,
        public int $warrantyMonths,
        public int $leadTimeDays,
        public bool $customisable,
    ) {}

    public static function fromModel(Product $product, ?MediaPath $paths = null): self
    {
        $paths ??= new MediaPath;

        // The card already knows how to read a product's price, stock, rating and finishes.
        // Re-deriving them here would be a second opinion about money, and the two would drift.
        $card = ProductCard::fromModel($product, $paths);
        $translation = $product->translation;

        $images = $product->media
            ->sortBy('position')
            ->map(fn (ProductMedia $row): string => $paths->url(
                $product->sku,
                ProductCard::hashFromPath($row->path),
                ImageVariant::Card,
            ))
            ->values()
            ->all();

        return self::fromArray([
            'id' => $product->id,
            'sku' => $product->sku,
            'slug' => $product->slug,
            'name' => $card->name,
            'summary' => (string) ($translation?->summary ?? ''),
            'description' => (string) ($translation?->description ?? $translation?->summary ?? ''),
            'category' => $card->category,
            'category_slug' => $card->categorySlug,
            'category_path' => $card->categoryPath,
            'series' => $product->series,
            'price_minor' => $card->priceMinor,
            'compare_at_minor' => $card->compareAtMinor,
            'discount_bp' => $card->discountBp,
            'in_stock' => $card->inStock,
            'available_qty' => $card->availableQty,
            'is_featured' => $card->isFeatured,
            'rating' => $card->rating,
            'review_count' => $card->reviewCount,
            'image' => $card->image,
            'image_srcset' => $card->imageSrcset,
            'images' => $images,
            'colors' => $card->finishes,
            'specifications' => is_array($translation?->specifications) ? $translation->specifications : [],
            'features' => is_array($translation?->features) ? $translation->features : [],
            'materials' => array_values(array_filter([$product->material, $product->frame])),
            'warranty_months' => (int) $product->warranty_months,
            'lead_time_days' => (int) $product->lead_time_days,
            'customisable' => (bool) $product->is_customisable,
        ]);
    }

    /**
     * Build from plain arrays — the shape work, and the part worth testing.
     *
     * @param  array<string, mixed>  $row
     */
    public static function fromArray(array $row): self
    {
        $specifications = [];

        foreach ((array) ($row['specifications'] ?? []) as $specification) {
            if (! is_array($specification)) {
                continue;
            }

            $label = trim((string) ($specification['label'] ?? ''));
            $value = trim((string) ($specification['value'] ?? ''));

            // A blank row renders as an empty line in a table, which reads as a missing spec
            // rather than a missing value. Drop it instead.
            if ($label === '' || $value === '') {
                continue;
            }

            $specifications[] = ['label' => $label, 'value' => $value];
        }

        $features = array_values(array_filter(
            array_map(static fn (mixed $feature): string => trim((string) $feature), (array) ($row['features'] ?? [])),
            static fn (string $feature): bool => $feature !== '',
        ));

        $colors = [];

        foreach ((array) ($row['colors'] ?? []) as $color) {
            if (! is_array($color)) {
                continue;
            }

            $name = trim((string) ($color['label'] ?? $color['name'] ?? ''));

            if ($name === '') {
                continue;
            }

            $hex = isset($color['hex']) && preg_match('/^#?[0-9a-fA-F]{6}$/', (string) $color['hex']) === 1
                ? '#'.ltrim((string) $color['hex'], '#')
                : null;

            $colors[] = [
                'code' => (string) ($color['code'] ?? ''),
                'name' => $name,
                'hex' => $hex,
                'image' => isset($color['image']) && $color['image'] !== '' ? (string) $color['image'] : null,
            ];
        }

        $images = array_values(array_filter(
            array_map(static fn (mixed $image): string => (string) $image, (array) ($row['images'] ?? [])),
            static fn (string $image): bool => $image !== '',
        ));

        $path = array_values(array_filter(
            array_map(static fn (mixed $slug): string => (string) $slug, (array) ($row['category_path'] ?? [])),
            static fn (string $slug): bool => $slug !== '',
        ));

        return new self(
            id: (int) ($row['id'] ?? 0),
            sku: (string) ($row['sku'] ?? ''),
            slug: (string) ($row['slug'] ?? ''),
            name: (string) ($row['name'] ?? ''),
            summary: (string) ($row['summary'] ?? ''),
            description: (string) ($row['description'] ?? ''),
            category: isset($row['category']) && $row['category'] !== '' ? (string) $row['category'] : null,
            categorySlug: isset($row['category_slug']) && $row['category_slug'] !== '' ? (string) $row['category_slug'] : null,
            // The canonical path, so a product page can show "Office Tables / Executive Tables"
            // without the client re-deriving it from two slugs it may not both have.
            categoryPath: $path,
            // The most specific category the product is filed in, read off the path so the two
            // can never disagree about where a product lives.
            subcategory: count($path) > 1 ? $path[count($path) - 1] : null,
            series: isset($row['series']) && $row['series'] !== '' ? (string) $row['series'] : null,
            priceMinor: (int) ($row['price_minor'] ?? 0),
            compareAtMinor: isset($row['compare_at_minor']) ? (int) $row['compare_at_minor'] : null,
            discountBp: (int) ($row['discount_bp'] ?? 0),
            inStock: (bool) ($row['in_stock'] ?? false),
            availableQty: (int) ($row['available_qty'] ?? 0),
            isFeatured: (bool) ($row['is_featured'] ?? false),
            rating: isset($row['rating']) ? (float) $row['rating'] : null,
            reviewCount: (int) ($row['review_count'] ?? 0),
            image: $images[0] ?? ($row['image'] ?? null),
            imageSrcset: isset($row['image_srcset']) ? (string) $row['image_srcset'] : null,
            images: $images,
            colors: $colors,
            specifications: $specifications,
            features: $features,
            materials: array_values(array_filter(
                array_map(static fn (mixed $material): string => trim((string) $material), (array) ($row['materials'] ?? [])),
                static fn (string $material): bool => $material !== '',
            )),
            warrantyMonths: (int) ($row['warranty_months'] ?? 0),
            leadTimeDays: (int) ($row['lead_time_days'] ?? 0),
            customisable: (bool) ($row['customisable'] ?? false),
        );
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->slug,
            'product_id' => $this->id,
            'sku' => $this->sku,
            'slug' => $this->slug,
            'name' => $this->name,
            'summary' => $this->summary,
            'description' => $this->description,
            'category' => $this->category,
            'category_slug' => $this->categorySlug,
            'category_path' => $this->categoryPath,
            'subcategory' => $this->subcategory,
            'series' => $this->series,
            'price_minor' => $this->priceMinor,
            'compare_at_minor' => $this->compareAtMinor,
            'discount_bp' => $this->discountBp,
            'in_stock' => $this->inStock,
            'available_qty' => $this->availableQty,
            'is_featured' => $this->isFeatured,
            'rating' => $this->rating,
            'review_count' => $this->reviewCount,
            'image' => $this->image,
            'image_srcset' => $this->imageSrcset,
            'images' => $this->images,
            'colors' => $this->colors,
            'specifications' => $this->specifications,
            'features' => $this->features,
            'materials' => $this->materials,
            'warranty_months' => $this->warrantyMonths,
            'lead_time_days' => $this->leadTimeDays,
            'customisable' => $this->customisable,
            'url' => '/shop/'.$this->slug,
        ];
    }
}
