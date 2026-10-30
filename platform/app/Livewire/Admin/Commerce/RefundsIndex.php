<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Refunds and returns')]
class RefundsIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Refunds and returns';
    }

    protected function summary(): string
    {
        return 'Money going back out, and goods coming back in, as two connected workflows.';
    }

    protected function phase(): string
    {
        return 'P3';
    }

    protected function planned(): array
    {
        return [
            'Line-level refund with a required reason',
            'Restock toggle per returned line',
            'RMA numbering and status tracking',
            'Reversal of the corresponding ledger entry',
        ];
    }

    protected function ready(): array
    {
        return [
            'Refund arithmetic covered by the golden fixtures',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.payments.manage'];
    }
}
