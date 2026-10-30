<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Settings')]
class SettingsIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Settings';
    }

    protected function summary(): string
    {
        return 'Sequences, currency, channels and the switches that are dangerous to change twice.';
    }

    protected function phase(): string
    {
        return 'P2';
    }

    protected function planned(): array
    {
        return [
            'Order, invoice and RMA number sequences',
            'Currency and exchange-rate basis points',
            'Channels for web, dealer and export',
            'Reorder thresholds and cart expiry',
        ];
    }

    protected function ready(): array
    {
        return [
            'Money is currency-aware and refuses to mix currencies',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.settings.manage'];
    }
}
