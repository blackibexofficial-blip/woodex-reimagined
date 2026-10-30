<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Promotions')]
class PromotionsIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Promotions';
    }

    protected function summary(): string
    {
        return 'Discounts and coupons: which rule applies, in what order, and what it cost.';
    }

    protected function phase(): string
    {
        return 'P3';
    }

    protected function planned(): array
    {
        return [
            'Catalog rules and cart rules in one place',
            'Coupon codes with usage caps and per-customer limits',
            'Live preview: what would this cart cost with this rule',
            'Usage report showing revenue given away',
        ];
    }

    protected function ready(): array
    {
        return [
            'DiscountRule with catalog, cart and coupon kinds',
            'Percentage, fixed, minimum-spend and free-shipping actions',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.promotions.manage'];
    }
}
