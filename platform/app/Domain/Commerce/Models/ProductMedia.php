<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One image, outside the web root and served through an allow-listed route. The three
 * derived sizes are produced at upload time (T6) — the host cannot resize on demand at
 * 2 MB/s of I/O.
 */
class ProductMedia extends Model
{
    public const string KIND_IMAGE = 'image';

    public const string KIND_VIDEO = 'video';

    public const string KIND_DOCUMENT = 'document';

    protected $table = 'commerce_product_media';

    protected $guarded = ['id'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'position' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
        ];
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }
}
