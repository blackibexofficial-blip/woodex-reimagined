<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Models\Category;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Support\Money;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Locked;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

/**
 * The screen that decides whether staff adopt the system at all.
 *
 * Price and stock are edited *in the row*, because the alternative — open a product, find the
 * price field, save, go back, filter again — is what makes people keep a spreadsheet on the
 * side. Every write goes through one method per field so the audit trail and the validation
 * cannot be bypassed by a different caller later.
 *
 * Prices are typed in rupees and stored in paisa. The conversion happens once, here, at the
 * edge — the database never sees a float.
 */
#[Layout('layouts::admin')]
#[Title('Products')]
class ProductsIndex extends Component
{
    use InteractsWithAdmin, WithPagination;

    #[Url]
    public string $search = '';

    #[Url]
    public string $category = '';

    #[Url]
    public string $status = '';

    #[Url]
    public string $sort = 'position';

    /** Product id currently being edited inline, or null. */
    #[Locked]
    public ?int $editingId = null;

    /** The rupee value shown in the inline editor. */
    public string $priceInput = '';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.products.view'), 403);
    }

    public function updatedSearch(): void
    {
        $this->resetPage();
    }

    public function updatedCategory(): void
    {
        $this->resetPage();
    }

    public function updatedStatus(): void
    {
        $this->resetPage();
    }

    public function startEditing(int $productId): void
    {
        abort_unless($this->user()->can('commerce.products.manage'), 403);

        $product = Product::query()->findOrFail($productId);

        $this->editingId = $product->id;
        $this->priceInput = $product->price_minor !== null
            ? (string) intdiv($product->price_minor, 100)
            : '';
    }

    public function cancelEditing(): void
    {
        $this->editingId = null;
        $this->priceInput = '';
    }

    /**
     * Save the inline price.
     *
     * Rejects anything that is not a whole non-negative rupee amount. Accepts "52,000" and
     * " 52000 " because people paste from invoices, but never silently rounds a decimal —
     * a typed "52000.50" is a mistake worth surfacing, not absorbing.
     */
    public function savePrice(): void
    {
        abort_unless($this->user()->can('commerce.products.manage'), 403);

        if ($this->editingId === null) {
            return;
        }

        $raw = str_replace([',', ' ', 'Rs', 'PKR'], '', $this->priceInput);

        if ($raw === '' || preg_match('/^\d+$/', $raw) !== 1) {
            $this->addError('priceInput', 'Enter a whole rupee amount, for example 52000.');

            return;
        }

        $product = Product::query()->findOrFail($this->editingId);

        if ($product->isConfigurable()) {
            // A configurable product's price belongs to its variants; editing it here would
            // create a second, contradictory price.
            $this->addError('priceInput', 'This product is priced per variant — edit the variants instead.');

            return;
        }

        $product->forceFill(['price_minor' => Money::fromUnits((int) $raw)->minor])->save();

        $this->editingId = null;
        $this->priceInput = '';
        $this->resetErrorBag();
        $this->toast($product->displayName().' price updated.');
    }

    /** Publish or unpublish without leaving the list. */
    public function toggleStatus(int $productId): void
    {
        abort_unless($this->user()->can('commerce.products.manage'), 403);

        $product = Product::query()->findOrFail($productId);

        $product->status = $product->isPublished() ? Product::STATUS_DRAFT : Product::STATUS_PUBLISHED;
        $product->save();

        $this->toast($product->isPublished() ? 'Product published.' : 'Product moved to drafts.');
    }

    /** @return Collection<int, Category> */
    public function categories(): Collection
    {
        // `translation` must be eager loaded. The admin host disables lazy loading outside
        // production, so a category named through `displayName()` would throw rather than
        // fall back to its slug.
        return Category::query()->with('translation')->orderBy('position')->get();
    }

    /** @return Builder<Product> */
    private function query(): Builder
    {
        return Product::query()
            ->with(['translation', 'primaryCategory.translation', 'variants.inventory'])
            ->when($this->search !== '', function (Builder $query): void {
                $term = '%'.$this->search.'%';

                $query->where(function (Builder $inner) use ($term): void {
                    $inner->where('sku', 'like', $term)
                        ->orWhereHas('translations', static fn (Builder $t) => $t->where('name', 'like', $term))
                        ->orWhere('series', 'like', $term);
                });
            })
            ->when($this->category !== '', fn (Builder $query) => $query->where('primary_category_id', (int) $this->category))
            ->when($this->status !== '', fn (Builder $query) => $query->where('status', $this->status))
            ->when(true, function (Builder $query): void {
                match ($this->sort) {
                    'price_asc' => $query->orderBy('price_minor'),
                    'price_desc' => $query->orderByDesc('price_minor'),
                    'name' => $query->orderBy('sku'),
                    'stock' => $query->orderBy('position'),
                    default => $query->orderBy('position'),
                };
            });
    }

    public function render(): View
    {
        return view('livewire.admin.commerce.products-index', [
            'products' => $this->query()->paginate(20),
            'categories' => $this->categories(),
            'canManage' => $this->user()->can('commerce.products.manage'),
        ]);
    }
}
