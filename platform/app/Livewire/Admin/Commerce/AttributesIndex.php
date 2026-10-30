<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Catalog\AttributeVocabulary;
use App\Domain\Commerce\Catalog\OptionUsage;
use App\Domain\Commerce\Models\Attribute;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * The vocabulary the catalog is described in — and whether it still describes it.
 *
 * The attribute rows themselves are configuration and rarely change, so a screen that just
 * lists them is a screen nobody opens twice. What goes wrong is silence: an option is added,
 * copied from a spreadsheet, or left behind when a product is discontinued, and the storefront
 * keeps drawing a filter checkbox or a finish swatch for it. Nothing errors. The page is just
 * empty when the customer gets there.
 *
 * So this screen counts. Two aggregate queries — products carrying each option, variants
 * pointing at it — and `AttributeVocabulary` decides which of the four states each option is
 * in. The screen then leads with the two states that cost something.
 *
 * Read-only by design. Toggling `is_filterable` from here would be a write on a table the
 * storefront's filter rail reads on every page load, and it belongs with the rest of the
 * attribute editing, behind `commerce.products.manage`, not on a dashboard.
 */
#[Layout('layouts::admin')]
#[Title('Attributes')]
class AttributesIndex extends Component
{
    use InteractsWithAdmin;

    #[Url]
    public string $search = '';

    /** all | attention — the two answers anyone actually wants. */
    #[Url]
    public string $scope = 'all';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.products.view'), 403);
    }

    /**
     * The vocabulary, with usage counted in two queries rather than two per option.
     *
     * Both counts are restricted to what a customer can actually reach: a draft product's
     * finish is not in the shop, and a deleted or inactive variant cannot be bought. Counting
     * everything would make a dead option look busy because of work in progress.
     */
    public function vocabulary(): AttributeVocabulary
    {
        $attributes = Attribute::query()
            ->with(['options' => static fn ($query) => $query->orderBy('position')->orderBy('id')])
            ->orderBy('position')
            ->orderBy('id')
            ->get();

        $products = $this->productCounts();
        $variants = $this->variantCounts();

        $rows = [];

        foreach ($attributes as $attribute) {
            foreach ($attribute->options as $option) {
                $key = $attribute->id.':'.$option->id;

                $rows[] = [
                    'attribute_code' => (string) $attribute->code,
                    'attribute_name' => (string) $attribute->name,
                    'code' => (string) $option->code,
                    'label' => (string) $option->label,
                    'products' => (int) ($products[$key] ?? 0),
                    'variants' => (int) ($variants[$key] ?? 0),
                    'is_variant' => (bool) $attribute->is_variant,
                    'is_filterable' => (bool) $attribute->is_filterable,
                    'hex' => $option->hex,
                ];
            }
        }

        return AttributeVocabulary::fromRows($rows);
    }

    /**
     * Distinct live products carrying each option.
     *
     * `COUNT(DISTINCT product_id)` and not `COUNT(*)`: the same product may carry an option
     * through a variant and a product-level value, and counting rows would report a busy
     * option as busy twice.
     *
     * @return array<string, int> keyed attributeId:optionId
     */
    private function productCounts(): array
    {
        return DB::table('commerce_product_attribute_values as pav')
            ->join('commerce_products as p', 'p.id', '=', 'pav.product_id')
            ->where('p.status', 'published')
            ->selectRaw('pav.attribute_id, pav.option_id, COUNT(DISTINCT pav.product_id) as total')
            ->groupBy('pav.attribute_id', 'pav.option_id')
            ->get()
            ->mapWithKeys(static fn ($row): array => [
                $row->attribute_id.':'.$row->option_id => (int) $row->total,
            ])
            ->all();
    }

    /**
     * Live variants on each option.
     *
     * A soft-deleted variant cannot be bought, and neither can an inactive one, so both are
     * excluded — an option whose only variant was deleted is orphaned, and saying otherwise
     * leaves a swatch on the product page that leads nowhere.
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

    /**
     * What the table shows, optionally reduced to the options that need a decision.
     *
     * @return Collection<int, array{attribute: Attribute, options: list<OptionUsage>}>
     */
    public function groups(): Collection
    {
        $vocabulary = $this->vocabulary();
        $term = strtolower(trim($this->search));

        return Attribute::query()
            ->orderBy('position')
            ->orderBy('id')
            ->get()
            ->map(function (Attribute $attribute) use ($vocabulary, $term): array {
                $options = $vocabulary->of((string) $attribute->code);

                if ($this->scope === 'attention') {
                    $options = array_values(array_filter(
                        $options,
                        static fn (OptionUsage $option): bool => $option->needsAttention(),
                    ));
                }

                if ($term !== '') {
                    $options = array_values(array_filter(
                        $options,
                        static fn (OptionUsage $option): bool => str_contains(strtolower($option->label), $term)
                            || str_contains(strtolower($option->code), $term),
                    ));
                }

                return ['attribute' => $attribute, 'options' => $options];
            })
            ->filter(static fn (array $group): bool => $group['options'] !== [])
            ->values();
    }

    public function render(): View
    {
        $vocabulary = $this->vocabulary();

        return view('livewire.admin.commerce.attributes-index', [
            'groups' => $this->groups(),
            'summary' => $vocabulary->summary(),
            'warnings' => $vocabulary->warnings(),
            'rail' => count($vocabulary->filterRail()),
        ]);
    }
}
