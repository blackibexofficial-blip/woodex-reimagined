<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Payments')]
class PaymentsIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Payments';
    }

    protected function summary(): string
    {
        return 'The offline payment queue — bank transfers a human must verify — plus the gateway events that verify themselves.';
    }

    protected function phase(): string
    {
        return 'P2';
    }

    protected function planned(): array
    {
        return [
            'Bank-transfer verification queue with amount matching',
            'Record a manual payment against an invoice',
            'Gateway events with idempotency keys',
            'Daily reconciliation against the ledger',
        ];
    }

    protected function ready(): array
    {
        return [
            'Payment idempotency design in the API contract',
            'Double-entry ledger in the OS Accounts domain',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.payments.manage'];
    }
}
