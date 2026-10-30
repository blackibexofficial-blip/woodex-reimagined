<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Storefront;

use App\Domain\Commerce\Catalog\MaterialLibrary;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * `GET /api/storefront/v1/materials` — the finishes and materials the catalog actually sells.
 *
 * Two grouped queries, one payload, five minutes of cache. The counts matter as much as the
 * labels: a swatch that no product offers is a colour the shop cannot deliver, and the
 * storefront should know that rather than draw it and let the customer find out at checkout.
 *
 * Cached for the same reason the catalogue is — this page is static between deploys, and on
 * shared hosting every uncached request is one of thirty PHP workers.
 */
final class MaterialsController
{
    private const int TTL_SECONDS = 300;

    public function __invoke(): JsonResponse
    {
        $payload = Cache::remember(
            'commerce:materials:v1',
            self::TTL_SECONDS,
            fn (): array => $this->library()->toArray(),
        );

        return new JsonResponse(['data' => $payload['groups'], 'meta' => $payload['meta']], 200, [
            'Cache-Control' => 'public, max-age=300',
        ]);
    }

    private function library(): MaterialLibrary
    {
        $attributes = DB::table('commerce_attributes')
            ->orderBy('position')
            ->orderBy('id')
            ->get(['id', 'code', 'name', 'type', 'swatch_type']);

        $options = DB::table('commerce_attribute_options')
            ->orderBy('attribute_id')
            ->orderBy('position')
            ->orderBy('id')
            ->get(['id', 'attribute_id', 'code', 'label', 'hex', 'swatch_path']);

        $products = $this->productCounts();
        $variants = $this->variantCounts();

        $rows = [];

        foreach ($attributes as $attribute) {
            foreach ($options->where('attribute_id', $attribute->id) as $option) {
                $key = $attribute->id.':'.$option->id;

                $rows[] = [
                    'attribute_code' => (string) $attribute->code,
                    'attribute_name' => (string) $attribute->name,
                    'attribute_type' => (string) $attribute->type,
                    'swatch_type' => $attribute->swatch_type === null ? null : (string) $attribute->swatch_type,
                    'code' => (string) $option->code,
                    'label' => (string) $option->label,
                    'hex' => $option->hex,
                    'swatch_path' => $option->swatch_path,
                    'products' => (int) ($products[$key] ?? 0),
                    'variants' => (int) ($variants[$key] ?? 0),
                ];
            }
        }

        return MaterialLibrary::fromRows($rows);
    }

    /**
     * Distinct published products carrying each option.
     *
     * @return array<string, int> keyed attributeId:optionId
     */
    private function productCounts(): array
    {
        return DB::table('commerce_product_attribute_values as pav')
            ->join('commerce_products as p', 'p.id', '=', 'pav.product_id')
            ->where('p.status', 'published')
            ->whereNull('p.deleted_at')
            ->whereNotNull('pav.option_id')
            ->selectRaw('pav.attribute_id, pav.option_id, COUNT(DISTINCT pav.product_id) as total')
            ->groupBy('pav.attribute_id', 'pav.option_id')
            ->get()
            ->mapWithKeys(static fn ($row): array => [
                $row->attribute_id.':'.$row->option_id => (int) $row->total,
            ])
            ->all();
    }

    /**
     * Live variants on each option — the number that decides whether a finish is buyable.
     *
     * @return array<string, int> keyed attributeId:optionId
     */
    private function variantCounts(): array
    {
        return DB::table('commerce_variant_options as vo')
            ->join('commerce_product_variants as v', 'v.id', '=', 'vo.variant_id')
            ->whereNull('v.deleted_at')
            ->where('v.status', 'active')
            ->selectRaw('vo.attribute_id, vo.option_id, COUNT(*) as total')
            ->groupBy('vo.attribute_id', 'vo.option_id')
            ->get()
            ->mapWithKeys(static fn ($row): array => [
                $row->attribute_id.':'.$row->option_id => (int) $row->total,
            ])
            ->all();
    }
}
