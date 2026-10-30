<?php

declare(strict_types=1);

namespace Tests\Admin;

use Tests\Support\Assert;

/**
 * Wiring tests: the sidebar, the routes, the components, the views, the permissions and the
 * icon set must all agree.
 *
 * These are the bugs that survive code review because every file is individually correct —
 * a nav item pointing at a route nobody registered, a component whose Blade view is missing,
 * a permission string that no seeder creates, an icon name the OS does not have (renders as
 * an empty box and nobody notices for a month). All of them are cheap to check statically
 * and expensive to find in a browser.
 *
 * They read source files rather than booting Laravel, so they run in CI before Composer has
 * installed anything.
 */
final class AdminWiringTest
{
    private const string NAV = '/app/Domain/Commerce/Navigation/CommerceNavigation.php';

    private const string ROUTES = '/routes/commerce.php';

    private const string PERMISSIONS = '/app/Domain/Commerce/Access/CommercePermissions.php';

    /** @var list<string>|null */
    private static ?array $iconSource = null;

    private function root(): string
    {
        return dirname(__DIR__, 2);
    }

    /** @return list<array{label: string, icon: string, route: string|null, permission: string|null, phase: string|null}> */
    private function navItems(): array
    {
        $source = (string) file_get_contents($this->root().self::NAV);
        preg_match_all(
            "/self::item\\('([^']+)', '([^']+)', '([^']+)', '([^']+)'\\)/",
            $source,
            $matches,
            PREG_SET_ORDER,
        );

        return array_map(static fn (array $m): array => [
            'label' => $m[1],
            'icon' => $m[2],
            'route' => $m[3],
            'permission' => $m[4],
            'phase' => null,
        ], $matches);
    }

    public function testTheCommerceGroupHasAllFourteenScreens(): void
    {
        $items = $this->navItems();

        Assert::same(14, count($items), 'the Commerce group lists 14 screens');

        $labels = array_column($items, 'label');
        Assert::same(count($labels), count(array_unique($labels)), 'labels are unique');
    }

    public function testEveryNavigationRouteExistsInTheRouteFile(): void
    {
        $routes = (string) file_get_contents($this->root().self::ROUTES);

        preg_match_all("/->name\\('([a-z.]+)'\\)/", $routes, $matches);

        $registered = array_map(static fn (string $name): string => 'admin.commerce.'.$name, $matches[1]);

        foreach ($this->navItems() as $item) {
            Assert::true(
                in_array($item['route'], $registered, true),
                "nav [{$item['label']}] → route {$item['route']} is registered",
            );
        }
    }

    public function testEveryRoutePointsAtAClassThatExists(): void
    {
        $routes = (string) file_get_contents($this->root().self::ROUTES);

        preg_match_all('/Route::get\\([^,]+, ([A-Za-z]+)::class\\)/', $routes, $matches);

        // Fourteen screens, the per-order detail view from T11, and the printable invoice
        // document from T17 — which is a controller, not a Livewire component, because it
        // renders once and has no state to keep.
        Assert::same(16, count($matches[1]), 'fifteen screens and the printable document are declared');

        foreach ($matches[1] as $class) {
            $component = $this->root().'/app/Livewire/Admin/Commerce/'.$class.'.php';
            $controller = $this->root().'/app/Http/Controllers/Admin/'.$class.'.php';

            $path = is_file($component) ? $component : $controller;

            Assert::true(
                is_file($path),
                "{$class} exists as a Livewire component or an admin controller",
            );

            if (is_file($path)) {
                $source = (string) file_get_contents($path);
                // Livewire components are `class X extends Component`; controllers are often
                // `final class X` — both declare the class, and the test should not care which.
                Assert::true(
                    preg_match('/\b(class|interface|trait|enum)\s+'.$class.'\b/', $source) === 1,
                    "{$class}.php declares class {$class}",
                );
            }
        }
    }

    public function testEveryComponentHasItsBladeView(): void
    {
        $expected = [
            'Dashboard' => 'dashboard',
            'ProductsIndex' => 'products-index',
            'OrdersIndex' => 'orders-index',
            'OrderShow' => 'order-show',
            'InventoryIndex' => 'inventory-index',
            'CategoriesIndex' => 'categories-index',
            'InvoicesIndex' => 'invoices-index',
            'AttributesIndex' => 'attributes-index',
            'CustomersIndex' => 'customers-index',
            'PaymentsIndex' => 'payments-index',
        ];

        foreach ($expected as $class => $view) {
            Assert::true(
                is_file($this->root().'/resources/views/livewire/admin/commerce/'.$view.'.blade.php'),
                "{$class} renders livewire.admin.commerce.{$view}",
            );
        }

        // The remaining placeholder screens all render one shared view. Orders left this list
        // in T11, Inventory in T15, Categories in T16, Invoices in T17, Attributes and
        // Customers in T18/T19, and Payments in T20.
        Assert::true(
            is_file($this->root().'/resources/views/livewire/admin/commerce/coming-soon.blade.php'),
            'placeholder screens render the shared coming-soon view',
        );

        foreach ([
            'RefundsIndex', 'PromotionsIndex', 'ShippingTaxIndex',
            'ReportsIndex', 'SettingsIndex',
        ] as $class) {
            $source = (string) file_get_contents($this->root().'/app/Livewire/Admin/Commerce/'.$class.'.php');

            Assert::true(
                str_contains($source, 'extends CommerceScreen'),
                "{$class} extends the shared CommerceScreen",
            );
        }
    }

    public function testEveryScreenChecksAPermissionThatIsActuallySeeded(): void
    {
        $permissions = (string) file_get_contents($this->root().self::PERMISSIONS);
        preg_match_all("/'(commerce\\.[a-z_.]+)'/", $permissions, $matches);
        $seeded = array_unique($matches[1]);

        // Nav entries
        foreach ($this->navItems() as $item) {
            Assert::true(
                in_array($item['permission'], $seeded, true),
                "nav [{$item['label']}] requires a seeded permission ({$item['permission']})",
            );
        }

        // Livewire components that gate in mount()
        foreach (glob($this->root().'/app/Livewire/Admin/Commerce/*.php') ?: [] as $file) {
            $source = (string) file_get_contents($file);
            preg_match_all("/can\\('(commerce\\.[a-z_.]+)'\\)/", $source, $checks);

            foreach (array_unique($checks[1]) as $permission) {
                Assert::true(
                    in_array($permission, $seeded, true),
                    basename($file)." checks a seeded permission ({$permission})",
                );
            }
        }
    }

    public function testEveryRoleGrantNamesARealPermission(): void
    {
        $source = (string) file_get_contents($this->root().self::PERMISSIONS);

        preg_match("/const array ALL = \\[(.*?)\\];/s", $source, $all);

        Assert::true(isset($all[1]), 'the ALL list is declared');

        preg_match_all("/'([^']+)'/", $all[1], $allPermissions);
        $declared = $allPermissions[1];

        // roleGrants uses the *ViewOnly helper plus literals; every literal must exist in ALL.
        preg_match("/\\\$viewOnly = \\[(.*?)\\];/s", $source, $viewOnly);
        preg_match_all("/'([^']+)'/", $viewOnly[1] ?? '', $viewOnlyPermissions);

        foreach ($viewOnlyPermissions[1] as $permission) {
            Assert::true(in_array($permission, $declared, true), "view-only permission {$permission} is in ALL");
        }

        preg_match("/'sales_manager' => array_merge\\(\\\$viewOnly, \\[(.*?)\\]\\)/s", $source, $manager);
        preg_match_all("/'([^']+)'/", $manager[1] ?? '', $managerPermissions);

        foreach ($managerPermissions[1] as $permission) {
            Assert::true(in_array($permission, $declared, true), "sales_manager permission {$permission} is in ALL");
        }
    }

    public function testEveryIconExistsInTheOsIconSet(): void
    {
        $icons = $this->iconNames();

        Assert::true(count($icons) > 80, 'the OS icon set was parsed');

        foreach ($this->navItems() as $item) {
            Assert::true(
                in_array($item['icon'], $icons, true),
                "nav [{$item['label']}] uses a real icon ({$item['icon']})",
            );
        }

        foreach (glob($this->root().'/resources/views/livewire/admin/commerce/*.blade.php') ?: [] as $file) {
            $source = (string) file_get_contents($file);

            preg_match_all('/<x-icon name="([a-z-]+)"/', $source, $named);
            preg_match_all('/<x-admin\\.(?:stat|button|empty)[^>]*?icon="([a-z-]+)"/', $source, $component);

            foreach (array_unique(array_merge($named[1], $component[1])) as $icon) {
                Assert::true(
                    in_array($icon, $icons, true),
                    basename($file)." uses a real icon ({$icon})",
                );
            }
        }
    }

    public function testNoCommerceTableIsReferencedThatDoesNotExist(): void
    {
        $migrations = implode("\n", array_map(
            static fn (string $file): string => (string) file_get_contents($file),
            glob($this->root().'/database/migrations/*commerce*.php') ?: [],
        ));

        preg_match_all("/Schema::create\\('([a-z_]+)'/", $migrations, $matches);
        $tables = $matches[1];

        foreach (glob($this->root().'/app/Domain/Commerce/Models/*.php') ?: [] as $file) {
            $source = (string) file_get_contents($file);

            if (preg_match("/protected \\\$table = '([a-z_]+)'/", $source, $table) !== 1) {
                continue;
            }

            Assert::true(
                in_array($table[1], $tables, true),
                basename($file)." maps to a table that exists ({$table[1]})",
            );
        }
    }

    /**
     * The OS icon set: parsed live when the OS clone is on this machine, otherwise read from
     * the committed snapshot. Either way, an unknown icon fails the test instead of rendering
     * as an empty square that nobody notices until a customer asks.
     *
     * @return list<string>
     */
    private function iconNames(): array
    {
        if (self::$iconSource !== null) {
            return self::$iconSource;
        }

        $osComponent = dirname($this->root(), 2).'/refs/woodexinterior/platform/resources/views/components/icon.blade.php';

        if (is_file($osComponent)) {
            preg_match_all("/'([a-z0-9-]+)' => '</", (string) file_get_contents($osComponent), $matches);
            self::$iconSource = $matches[1];

            return self::$iconSource;
        }

        $snapshot = $this->root().'/tests/fixtures/os/icon-names.json';

        if (is_file($snapshot)) {
            $decoded = json_decode((string) file_get_contents($snapshot), true);

            /** @var list<string> $names */
            $names = $decoded['names'] ?? [];
            self::$iconSource = $names;

            return $names;
        }

        self::$iconSource = [];

        return [];
    }
}
