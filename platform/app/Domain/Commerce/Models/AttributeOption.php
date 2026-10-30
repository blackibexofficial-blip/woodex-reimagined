<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single value of an attribute — "Natural Oak", with its hex or texture. The storefront's
 * material library reads these rows directly, so a product's finish and a swatch on the
 * Materials page are the same record and cannot drift apart.
 */
class AttributeOption extends Model
{
    protected $table = 'commerce_attribute_options';

    protected $guarded = ['id'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['position' => 'integer'];
    }

    /** @return BelongsTo<Attribute, $this> */
    public function attribute(): BelongsTo
    {
        return $this->belongsTo(Attribute::class);
    }
}
