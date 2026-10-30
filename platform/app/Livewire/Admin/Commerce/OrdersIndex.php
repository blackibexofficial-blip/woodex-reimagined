<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Orders')]
class OrdersIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Orders';
    }

    protected function summary(): string
    {
        return 'Every order, its money breakdown, its history and the actions a human is allowed to take on it.';
    }

    protected function phase(): string
    {
        return 'P2';
    }

    protected function planned(): array
    {
        return [
            'Filter by status, payment state, date and customer',
            'Order detail: items, addresses, totals, timeline',
            'Cancel with reason, re-send confirmation, edit with audit',
            'Bulk actions and CSV export',
        ];
    }

    protected function ready(): array
    {
        return [
            'CartTotals ready to be stored on order creation',
            'CartCalculator with 14 golden fixtures',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.orders.view'];
    }
}
