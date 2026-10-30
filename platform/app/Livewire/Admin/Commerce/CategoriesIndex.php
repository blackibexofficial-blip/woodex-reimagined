<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Categories')]
class CategoriesIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Categories';
    }

    protected function summary(): string
    {
        return 'The tree the storefront navigates by, with per-category SEO and per-channel visibility.';
    }

    protected function phase(): string
    {
        return 'P1';
    }

    protected function planned(): array
    {
        return [
            'Drag-order tree with parent and child levels',
            'Per-locale name, tagline and meta fields',
            'Product counts and a jump-to-filtered-products link',
            'Menu visibility toggle separate from active state',
        ];
    }

    protected function ready(): array
    {
        return [
            'Nested category schema and models',
            '20 seeded products across 4 categories',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.products.manage'];
    }
}
