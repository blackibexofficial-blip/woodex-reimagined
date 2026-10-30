<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Models;

use App\Domain\Commerce\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A catalog product. One row, regardless of how many translations or variants it has.
 *
 * The price lives on the variant when there is one, and here when there is not — a simple
 * product never needs a fake single variant just to hold a number. `lowestPrice()` hides
 * that distinction from every caller.
 */
class Product extends Model
{
    use SoftDeletes;

    public const string TYPE_SIMPLE = 'simple';

    public const string TYPE_CONFIGURABLE = 'configurable';

    public const string TYPE_BUNDLE = 'bundle';

    public const string TYPE_VIRTUAL = 'virtual';

    public const string STATUS_DRAFT = 'draft';

    public const string STATUS_PUBLISHED = 'published';

    public const string STATUS_ARCHIVED = 'archived';

    protected $table = 'commerce_products';

    protected $guarded = ['id'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_featured' => 'boolean',
            'is_customisable' => 'boolean',
            'taxable' => 'boolean',
            'warranty_months' => 'integer',
            'lead_time_days' => 'integer',
            'rating_x10' => 'integer',
            'review_count' => 'integer',
            'position' => 'integer',
        ];
    }

    /** @return HasOne<ProductTranslation, $this> */
    public function translation(): HasOne
    {
        return $this->hasOne(ProductTranslation::class)->where('locale', app()->getLocale());
    }

    /** @return HasMany<ProductTranslation, $this> */
    public function translations(): HasMany
    {
        return $this->hasMany(ProductTranslation::class);
    }

    /** @return BelongsTo<Category, $this> */
    public function primaryCategory(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'primary_category_id');
    }

    /** @return BelongsToMany<Category, $this> */
    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'commerce_product_categories', 'product_id', 'category_id')
            ->withPivot('position');
    }

    /** @return HasMany<ProductVariant, $this> */
    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)->orderBy('position');
    }

    /** @return HasMany<ProductMedia, $this> */
    public function media(): HasMany
    {
        return $this->hasMany(ProductMedia::class)->orderBy('position');
    }

    /** @return HasMany<ProductAttributeValue, $this> */
    public function attributeValues(): HasMany
    {
        return $this->hasMany(ProductAttributeValue::class);
    }

    public function isConfigurable(): bool
    {
        return $this->type === self::TYPE_CONFIGURABLE;
    }

    public function isPublished(): bool
    {
        return $this->status === self::STATUS_PUBLISHED;
    }

    public function displayName(): string
    {
        return $this->translation?->name ?? $this->sku;
    }

    public function rating(): ?float
    {
        return $this->rating_x10 > 0 ? $this->rating_x10 / 10 : null;
    }

    /**
     * The price a listing should show: the cheapest sellable variant, or the simple
     * product's own price. Null when nothing is priced — which the storefront renders as
     * "Request a quote" rather than as zero.
     */
    public function lowestPrice(): ?Money
    {
        $prices = $this->variants
            ->pluck('price_minor')
            ->filter(static fn ($minor): bool => $minor !== null)
            ->map(static fn ($minor): int => (int) $minor);

        if ($prices->isNotEmpty()) {
            return Money::ofMinor($prices->min());
        }

        return $this->price_minor !== null ? Money::ofMinor((int) $this->price_minor) : null;
    }

    public function isInStock(): bool
    {
        return $this->variants->contains(
            static fn (ProductVariant $variant): bool => $variant->availableQty() > 0,
        );
    }

    /** @param  Builder<self>  $query */
    public function scopePublished(Builder $query): void
    {
        $query->where('status', self::STATUS_PUBLISHED);
    }

    /** @param  Builder<self>  $query */
    public function scopeInCategory(Builder $query, int $categoryId): void
    {
        $query->whereHas('categories', static fn (Builder $q) => $q->where('commerce_categories.id', $categoryId));
    }
}
