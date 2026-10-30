<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Reports')]
class ReportsIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Reports';
    }

    protected function summary(): string
    {
        return 'The numbers the business is actually run on, not a chart for every table.';
    }

    protected function phase(): string
    {
        return 'P3';
    }

    protected function planned(): array
    {
        return [
            'Sales by day, product and category',
            'Tax collected, ready for the return',
            'Stock valuation and dead stock',
            'Coupon and promotion effectiveness',
        ];
    }

    protected function ready(): array
    {
        return [
            'Catalog and inventory tables to aggregate over',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.reports.view'];
    }
}
