<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Shipping and tax')]
class ShippingTaxIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Shipping and tax';
    }

    protected function summary(): string
    {
        return 'Where we deliver, what it costs, and the tax matrix behind every total.';
    }

    protected function phase(): string
    {
        return 'P2';
    }

    protected function planned(): array
    {
        return [
            'Shipping zones by city and province',
            'Flat, free-over and weight-band methods per zone',
            'Tax zones, categories and inclusive/exclusive rates',
            'COD availability and per-order caps',
        ];
    }

    protected function ready(): array
    {
        return [
            'Shipping and tax evaluated in CartCalculator',
            'Inclusive-tax extraction tested in fixture 08',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.settings.manage'];
    }
}
