<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Inventory')]
class InventoryIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Inventory';
    }

    protected function summary(): string
    {
        return 'Stock per warehouse, reservations held by unpaid carts, and the low-stock queue that stops the showroom promising a chair it does not have.';
    }

    protected function phase(): string
    {
        return 'P1';
    }

    protected function planned(): array
    {
        return [
            'Per-source grid: Lahore, Karachi, online',
            'Bulk adjust with a required reason, written to the audit log',
            'Reserved versus available, with cart expiry release',
            'Thresholds per source and a stock-valuation report',
        ];
    }

    protected function ready(): array
    {
        return [
            'InventorySource and InventoryItem models',
            'Availability computed as qty minus reserved',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.inventory.manage'];
    }
}
