<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Api;

use App\Domain\Commerce\Media\ImageVariant;
use App\Domain\Commerce\Media\MediaPath;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Models\ProductMedia;
use App\Domain\Commerce\Models\ProductVariant;
use App\Domain\Commerce\Support\Money;

/**
 * One product as a listing needs it — a grid tile, a search hit, a Puck product block row.
 *
 * Shaped deliberately for the storefront that already exists: the SPA's `Product` interface
 * uses `id`, `name`, `price`, `originalPrice`, `inStock`. This DTO emits exactly those keys
 * plus what the shop needs and the static data never had (real stock, real rating, URL),
 * so switching a page from `data/products.ts` to the API does not mean rewriting its JSX.
 *
 * Money crosses the boundary as **integer paisa** and as a formatted string. The integer is
 * for arithmetic; the string exists so the client never formats money itself and never
 * re-introduces a float by dividing by 100 somewhere in a component.
 */
final readonly class ProductCard
{
    /**
     * @param  list<array{code: string, label: string, hex: string|null}>  $finishes
     */
    public function __construct(
        public int $id,
        public string $sku,
        public string $slug,
        public string $name,
        public string $summary,
        public ?string $category,
        public ?string $series,
        public int $priceMinor,
        public ?int $compareAtMinor,
        public string $price,
        public ?string $compareAt,
        public int $discountBp,
        public bool $inStock,
        public int $availableQty,
        public bool $isFeatured,
        public ?float $rating,
        public int $reviewCount,
        public ?string $image,
        public ?string $imageSrcset,
        public array $finishes,
        public int $warrantyMonths,
        public int $leadTimeDays,
    ) {}

    public static function fromModel(Product $product, ?MediaPath $paths = null): self
    {
        $paths ??= new MediaPath;
        $price = $product->lowestPrice();
        $primary = self::primaryMedia($product);

        $compareAt = $product->compare_at_minor !== null
            ? Money::ofMinor((int) $product->compare_at_minor)
            : null;

        $available = $product->variants->sum(
            static fn (ProductVariant $variant): int => $variant->availableQty(),
        );

        return new self(
            id: $product->id,
            sku: $product->sku,
            slug: $product->slug,
            name: $product->displayName(),
            summary: (string) ($product->translation?->summary ?? ''),
            category: $product->primaryCategory?->displayName(),
            series: $product->series,
            priceMinor: $price?->minor ?? 0,
            compareAtMinor: $compareAt?->minor,
            price: $price?->format() ?? '',
            compareAt: $compareAt?->format(),
            discountBp: self::discountBasisPoints($price?->minor, $compareAt?->minor),
            inStock: $available > 0,
            availableQty: $available,
            isFeatured: (bool) $product->is_featured,
            rating: $product->rating(),
            reviewCount: (int) $product->review_count,
            image: $primary !== null ? self::mediaUrl($primary, $product->sku, $paths) : null,
            imageSrcset: $primary !== null ? $paths->srcset($product->sku, self::hashFromPath($primary->path)) : null,
            finishes: self::finishes($product),
            warrantyMonths: (int) $product->warranty_months,
            leadTimeDays: (int) $product->lead_time_days,
        );
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'slug' => $this->slug,
            'name' => $this->name,
            'summary' => $this->summary,
            'category' => $this->category,
            'series' => $this->series,
            'price_minor' => $this->priceMinor,
            'price' => $this->price,
            'compare_at_minor' => $this->compareAtMinor,
            'compare_at' => $this->compareAt,
            'discount_bp' => $this->discountBp,
            'in_stock' => $this->inStock,
            'available_qty' => $this->availableQty,
            'is_featured' => $this->isFeatured,
            'rating' => $this->rating,
            'review_count' => $this->reviewCount,
            'image' => $this->image,
            'image_srcset' => $this->imageSrcset,
            'finishes' => $this->finishes,
            'warranty_months' => $this->warrantyMonths,
            'lead_time_days' => $this->leadTimeDays,
            'url' => '/products/'.$this->slug,
        ];
    }

    private static function primaryMedia(Product $product): ?ProductMedia
    {
        return $product->media->firstWhere('is_primary', true) ?? $product->media->first();
    }

    private static function mediaUrl(ProductMedia $media, string $sku, MediaPath $paths): string
    {
        return $paths->url($sku, self::hashFromPath($media->path), ImageVariant::Card);
    }

    /**
     * The stored path is `{slug}/{hash}-{variant}.webp`; the hash is the only part the URL
     * builder needs, so it is read back out rather than duplicated on the row.
     */
    private static function hashFromPath(string $path): string
    {
        if (preg_match('#/([a-f0-9]{8,64})-([a-z]+)\.webp$#', $path, $matches) === 1) {
            return $matches[1];
        }

        return substr(hash('sha256', $path), 0, 32);
    }

    /** @return list<array{code: string, label: string, hex: string|null}> */
    private static function finishes(Product $product): array
    {
        $out = [];

        foreach ($product->variants as $variant) {
            foreach ($variant->options as $option) {
                $out[$option->code] = [
                    'code' => $option->code,
                    'label' => $option->label,
                    'hex' => $option->hex,
                ];
            }
        }

        return array_values($out);
    }

    /** How much is saved, in basis points, so the client can show "-13%" without dividing. */
    private static function discountBasisPoints(?int $price, ?int $compareAt): int
    {
        if ($price === null || $compareAt === null || $compareAt <= $price || $compareAt === 0) {
            return 0;
        }

        return (int) round((($compareAt - $price) / $compareAt) * 10_000);
    }
}
