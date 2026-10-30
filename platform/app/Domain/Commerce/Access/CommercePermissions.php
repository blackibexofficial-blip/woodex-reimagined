<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Access;

/**
 * Commerce permissions, in the OS's existing `domain.action` convention.
 *
 * The split follows money, not menus: anyone may look at the catalog, only some may change a
 * price, and only a few may refund. Reading and writing are separate permissions everywhere
 * because "can see the order" and "can mark it paid" are different jobs in a real business.
 *
 * The owner role bypasses every check through the OS's `Gate::before`, so this list is never
 * a lockout risk — it decides what a salesperson, an accountant and a warehouse clerk see.
 */
final class CommercePermissions
{
    /** @var list<string> */
    public const array ALL = [
        'commerce.view',
        'commerce.products.view', 'commerce.products.manage',
        'commerce.inventory.manage',
        'commerce.orders.view', 'commerce.orders.manage',
        'commerce.payments.manage',
        'commerce.customers.view',
        'commerce.promotions.manage',
        'commerce.settings.manage',
        'commerce.reports.view',
    ];

    /**
     * Permissions granted to each existing OS role.
     *
     * Deliberately conservative: nobody who does not already handle money gets a commerce
     * permission that moves money. Sales people see orders (they will quote from them) but
     * cannot mark anything paid.
     *
     * @return array<string, list<string>>
     */
    public static function roleGrants(): array
    {
        $viewOnly = [
            'commerce.view',
            'commerce.products.view',
            'commerce.orders.view',
            'commerce.customers.view',
        ];

        return [
            'owner' => self::ALL,

            'admin' => self::ALL,

            'sales_manager' => array_merge($viewOnly, [
                'commerce.products.manage',
                'commerce.promotions.manage',
                'commerce.reports.view',
                'commerce.orders.manage',
            ]),

            'sales' => $viewOnly,

            'accountant' => array_merge($viewOnly, [
                'commerce.payments.manage',
                'commerce.reports.view',
                'commerce.inventory.manage',
            ]),
        ];
    }

    /**
     * A plain-language description per permission, shown on the Access screen so an
     * administrator does not have to guess what `commerce.payments.manage` unlocks.
     *
     * @return array<string, string>
     */
    public static function descriptions(): array
    {
        return [
            'commerce.view' => 'See the Commerce section and its dashboard.',
            'commerce.products.view' => 'Browse the catalog, prices and stock.',
            'commerce.products.manage' => 'Create and edit products, prices, categories and attributes.',
            'commerce.inventory.manage' => 'Adjust stock, move units between warehouses, set thresholds.',
            'commerce.orders.view' => 'See orders, their items, money breakdown and invoices.',
            'commerce.orders.manage' => 'Edit an order, cancel it, issue an invoice, mark it shipped.',
            'commerce.payments.manage' => 'Verify bank transfers, record payments, issue refunds.',
            'commerce.customers.view' => 'See commerce customers, groups and their order history.',
            'commerce.promotions.manage' => 'Create discounts, coupons and catalog rules.',
            'commerce.settings.manage' => 'Channels, currencies, tax zones, shipping rates, sequences.',
            'commerce.reports.view' => 'Sales, tax, stock valuation and coupon reports.',
        ];
    }
}
