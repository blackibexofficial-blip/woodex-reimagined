<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Navigation;

/**
 * The Commerce section of the admin sidebar.
 *
 * Returns exactly the shape `App\Support\AdminNavigation::groups()` uses, so wiring it in is
 * one line in `groups()`:
 *
 *     ...\App\Domain\Commerce\Navigation\CommerceNavigation::groups(),
 *
 * Putting it in a domain class rather than editing the 120-line navigation file keeps the
 * commerce screens together — and makes the whole section greppable from one place.
 *
 * Every entry carries a real permission. A screen with no permission string would be visible
 * to every staff member, which is how a warehouse clerk ends up looking at refunds.
 */
final class CommerceNavigation
{
    /**
     * @return list<array{title: string|null, items: list<array{label: string, icon: string, route: string|null, permission: string|null, phase: string|null}>}>
     */
    public static function groups(): array
    {
        return [
            self::group('Commerce', [
                self::item('Dashboard', 'chart', 'admin.commerce.dashboard', 'commerce.view'),
                self::item('Products', 'archive', 'admin.commerce.products', 'commerce.products.view'),
                self::item('Attributes', 'layers', 'admin.commerce.attributes', 'commerce.products.manage'),
                self::item('Categories', 'layout', 'admin.commerce.categories', 'commerce.products.manage'),
                self::item('Inventory', 'folder', 'admin.commerce.inventory', 'commerce.inventory.manage'),
                self::item('Orders', 'invoice', 'admin.commerce.orders', 'commerce.orders.view'),
                self::item('Invoices', 'file', 'admin.commerce.invoices', 'commerce.orders.view'),
                self::item('Payments', 'wallet', 'admin.commerce.payments', 'commerce.payments.manage'),
                self::item('Refunds & returns', 'refresh', 'admin.commerce.refunds', 'commerce.payments.manage'),
                self::item('Promotions', 'megaphone', 'admin.commerce.promotions', 'commerce.promotions.manage'),
                self::item('Shipping & tax', 'globe', 'admin.commerce.shipping', 'commerce.settings.manage'),
                self::item('Customers', 'users', 'admin.commerce.customers', 'commerce.customers.view'),
                self::item('Reports', 'trending-up', 'admin.commerce.reports', 'commerce.reports.view'),
                self::item('Settings', 'settings', 'admin.commerce.settings', 'commerce.settings.manage'),
            ]),
        ];
    }

    /**
     * Every route name the section owns — used by the wiring test to prove the sidebar and
     * the route file agree, which is the failure that silently hides a whole section.
     *
     * @return list<string>
     */
    public static function routeNames(): array
    {
        $names = [];

        foreach (self::groups() as $group) {
            foreach ($group['items'] as $item) {
                if ($item['route'] !== null) {
                    $names[] = $item['route'];
                }
            }
        }

        return $names;
    }

    /**
     * @param  list<array{label: string, icon: string, route: string|null, permission: string|null, phase: string|null}>  $items
     * @return array{title: string|null, items: list<array{label: string, icon: string, route: string|null, permission: string|null, phase: string|null}>}
     */
    private static function group(?string $title, array $items): array
    {
        return ['title' => $title, 'items' => $items];
    }

    /**
     * @return array{label: string, icon: string, route: string|null, permission: string|null, phase: string|null}
     */
    private static function item(string $label, string $icon, ?string $route, ?string $permission, ?string $phase = null): array
    {
        return ['label' => $label, 'icon' => $icon, 'route' => $route, 'permission' => $permission, 'phase' => $phase];
    }
}
