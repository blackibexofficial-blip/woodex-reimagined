<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Livewire\Admin\Commerce\Concerns\CommerceScreen;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;

#[Layout('layouts::admin')]
#[Title('Customers')]
class CustomersIndex extends CommerceScreen
{
    protected function heading(): string
    {
        return 'Customers';
    }

    protected function summary(): string
    {
        return 'Commerce customers grouped by what they are allowed to pay — retail, dealer, architect, corporate.';
    }

    protected function phase(): string
    {
        return 'P2';
    }

    protected function planned(): array
    {
        return [
            'Customer list with group and lifetime value',
            'Detail view: orders, quotes, tickets and addresses',
            'Group assignment that immediately changes visible prices',
            'Guest-to-account merging',
        ];
    }

    protected function ready(): array
    {
        return [
            'Customer group schema',
            'Two-way link design to the OS CRM person record',
        ];
    }

    protected function needs(): array
    {
        return ['commerce.customers.view'];
    }
}
