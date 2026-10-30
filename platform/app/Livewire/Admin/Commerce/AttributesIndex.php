<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Attributes')]
class AttributesIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Attributes';
    }

    protected function summary(): string
    {
        return 'The vocabulary the catalog is described in: material, finish, colour family, warranty. Data, not columns — adding one must never need a migration.';
    }

    protected function phase(): string
    {
        return 'P1';
    }

    protected function planned(): array
    {
        return [
            'Attribute list with type, filterable and variant flags',
            'Option editor with hex and texture swatches',
            'Variant-generator preview before publishing an axis',
            'Reordering, and a warning when an option is used by a live product',
        ];
    }

    protected function ready(): array
    {
        return [
            '33 schema tables migrated',
            'Attribute, AttributeOption and ProductAttributeValue models',
            'Seeded material, finish and warranty attributes',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.products.manage'];
    }
}
