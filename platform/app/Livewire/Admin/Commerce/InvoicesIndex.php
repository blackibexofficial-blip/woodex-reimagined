<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Invoices')]
class InvoicesIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Invoices';
    }

    protected function summary(): string
    {
        return 'Invoices raised from orders, including part-payment and credit notes.';
    }

    protected function phase(): string
    {
        return 'P2';
    }

    protected function planned(): array
    {
        return [
            'Issue, void and re-issue an invoice',
            'PDF through the OS\'s existing DomPDF pipeline',
            'Part-payment tracking against the order total',
            'Aging view for unpaid invoices',
        ];
    }

    protected function ready(): array
    {
        return [
            'The OS already renders quotation and invoice PDFs',
            'Payment maths in integer paisa',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.orders.view'];
    }
}
