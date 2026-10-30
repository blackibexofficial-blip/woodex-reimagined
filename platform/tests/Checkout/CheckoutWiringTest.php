<?php

declare(strict_types=1);

namespace Tests\Checkout;

use Tests\Support\Assert;

/**
 * The seams of the checkout slice, checked as source text.
 *
 * The pattern that matters here is *ordering*: stock must be refused before an order row is
 * written. That is not something a type checker or a code review reliably catches — a moved
 * `Order::create()` above the `throw` compiles, reads fine, and produces phantom orders under
 * load. So it is pinned by comparing positions in the source.
 */
final class CheckoutWiringTest
{
    private function root(): string
    {
        return dirname(__DIR__, 2);
    }

    private function source(string $relative): string
    {
        $path = $this->root().$relative;

        Assert::trueWith(is_file($path), static fn (): string => "missing file {$relative}", 'file exists');

        return is_file($path) ? (string) file_get_contents($path) : '';
    }

    public function testEveryCheckoutModelPointsAtATableTheMigrationCreates(): void
    {
        $migration = $this->source('/database/migrations/2026_10_28_104000_create_commerce_checkout_tables.php');
        $models = glob($this->root().'/app/Domain/Commerce/Checkout/Models/*.php') ?: [];

        Assert::true(count($models) >= 12, 'the slice ships its models');

        foreach ($models as $file) {
            $source = (string) file_get_contents($file);
            $name = basename($file, '.php');

            preg_match("/protected \\\$table = '([a-z_]+)';/", $source, $match);

            Assert::true(isset($match[1]), "{$name} declares its table");
            Assert::true(
                str_contains($migration, "Schema::create('{$match[1]}'"),
                "{$name} points at {$match[1]}, which the migration creates",
            );
        }
    }

    public function testStockIsRefusedBeforeAnOrderIsWritten(): void
    {
        $service = $this->source('/app/Domain/Commerce/Checkout/CheckoutService.php');

        $refusal = strpos($service, 'throw new InsufficientStock');
        $orderWrite = strpos($service, 'Order::create(');

        Assert::true($refusal !== false, 'the service refuses an order it cannot fill');
        Assert::true($orderWrite !== false, 'and writes orders when it can');
        Assert::true($refusal < $orderWrite, 'the refusal comes first: no phantom orders under load');
    }

    public function testThePlacementPathIsOneTransactionAndLocksStock(): void
    {
        $service = $this->source('/app/Domain/Commerce/Checkout/CheckoutService.php');

        Assert::true(str_contains($service, 'DB::transaction('), 'the whole placement is one transaction');
        Assert::true(str_contains($service, 'lockForUpdate()'), 'stock rows are locked, not just read');
        Assert::true(str_contains($service, 'new CartCalculator'), 'prices come from the one calculator');
        Assert::true(str_contains($service, 'OrderDraft::assemble'), 'the order is assembled by the tested class');
        Assert::true(str_contains($service, '->pair()'), 'order and invoice numbers are taken together, under lock');
    }

    public function testTheCartTotalsAreWrittenBackToTheRow(): void
    {
        $service = $this->source('/app/Domain/Commerce/Checkout/CartService.php');

        Assert::true(str_contains($service, "'grand_total_minor' => \$totals->grandTotal->minor"), 'the cart row caches the calculation');
        Assert::true(str_contains($service, "'discount_minor' => \$totals->discountTotal->minor"), 'including the discount');
        Assert::true(str_contains($service, 'updateOrCreate'), 'one address per type, replaced not duplicated');
    }

    public function testOrderStatusChangesGoThroughTheGraph(): void
    {
        $model = $this->source('/app/Domain/Commerce/Checkout/Models/Order.php');

        Assert::true(str_contains($model, 'OrderStatus::canMoveTo'), 'moveTo consults the graph');
        Assert::true(str_contains($model, 'throw new LogicException'), 'and refuses what it forbids');
        Assert::true(str_contains($model, '->history()->create('), 'every move leaves a record');
    }

    public function testTheMigrationStoresMoneyInMinorUnitsAndDropsItsTables(): void
    {
        $migration = $this->source('/database/migrations/2026_10_28_104000_create_commerce_checkout_tables.php');

        foreach (['commerce_carts', 'commerce_orders', 'commerce_invoices', 'commerce_payments', 'commerce_inventory_reservations', 'commerce_sequences'] as $table) {
            Assert::true(str_contains($migration, "Schema::create('{$table}'"), "creates {$table}");
            Assert::true(str_contains($migration, "Schema::dropIfExists('{$table}'"), "drops {$table}");
        }

        Assert::same(false, str_contains($migration, '$table->float('), 'no float anywhere near money');
        Assert::true(str_contains($migration, "bigInteger('grand_total_minor')"), 'the total is paisa');
    }

    public function testTheDemoCommandPlacesARealOrderThroughTheSamePath(): void
    {
        $command = $this->source('/app/Console/Commands/DemoOrderCommand.php');

        Assert::true(str_contains($command, 'CheckoutService'), 'the command uses the real service');
        Assert::true(str_contains($command, 'CartService'), 'and the real cart');
        Assert::same(false, str_contains($command, 'Order::create('), 'it must not write an order behind the service\'s back');
    }
}
