<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An attribute is configuration, not a schema change: "finish" or "colour family" can be
 * added from the admin without a deploy.
 *
 * `is_variant` marks the attributes that generate sellable combinations; `swatch_type`
 * drives the Materials and Colours page, which is why that page needs no separate model.
 */
class Attribute extends Model
{
    public const string TYPE_SELECT = 'select';

    public const string TYPE_MULTISELECT = 'multiselect';

    public const string TYPE_TEXT = 'text';

    public const string TYPE_NUMBER = 'number';

    public const string TYPE_BOOLEAN = 'boolean';

    public const string TYPE_SWATCH = 'swatch';

    protected $table = 'commerce_attributes';

    protected $guarded = ['id'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_filterable' => 'boolean',
            'is_variant' => 'boolean',
            'is_required' => 'boolean',
            'is_comparable' => 'boolean',
            'position' => 'integer',
        ];
    }

    /** @return HasMany<AttributeOption, $this> */
    public function options(): HasMany
    {
        return $this->hasMany(AttributeOption::class)->orderBy('position');
    }

    /** @return HasMany<ProductAttributeValue, $this> */
    public function values(): HasMany
    {
        return $this->hasMany(ProductAttributeValue::class);
    }

    /** @param  Builder<self>  $query */
    public function scopeFilterable(Builder $query): void
    {
        $query->where('is_filterable', true);
    }

    /** @param  Builder<self>  $query */
    public function scopeVariantAxes(Builder $query): void
    {
        $query->where('is_variant', true);
    }
}
