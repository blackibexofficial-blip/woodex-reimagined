<?php

declare(strict_types=1);

namespace Tests\Billing;

use Tests\Support\Assert;

/**
 * The last five screens, read as source text.
 *
 * They share one property worth pinning: each is a screen that *reconciles* something rather
 * than a table that edits something. The arithmetic behind each is tested in its own file
 * (RefundAuditTest, PromotionLedgerTest, ChargeAuditTest, SalesReportTest, SequenceHealthTest);
 * what is checked here is that the screen asks its value object, shows the finding before the
 * list, and offers no way to write.
 */
final class RemainingScreensTest
{
    /** @var array<string, array{class: string, view: string, audit: string, permission: string}> */
    private const SCREENS = [
        'refunds' => [
            'class' => 'RefundsIndex',
            'view' => 'refunds-index',
            'audit' => 'RefundAudit',
            'permission' => 'commerce.payments.manage',
        ],
        'promotions' => [
            'class' => 'PromotionsIndex',
            'view' => 'promotions-index',
            'audit' => 'PromotionLedger',
            'permission' => 'commerce.promotions.manage',
        ],
        'shipping-tax' => [
            'class' => 'ShippingTaxIndex',
            'view' => 'shipping-tax-index',
            'audit' => 'ChargeAudit',
            'permission' => 'commerce.settings.manage',
        ],
        'reports' => [
            'class' => 'ReportsIndex',
            'view' => 'reports-index',
            'audit' => 'SalesReport',
            'permission' => 'commerce.reports.view',
        ],
        'settings' => [
            'class' => 'SettingsIndex',
            'view' => 'settings-index',
            'audit' => 'SequenceHealth',
            'permission' => 'commerce.settings.manage',
        ],
    ];

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

    public function testEveryCommerceScreenIsReal(): void
    {
        // The placeholder base class is still in the tree for the next section; nothing in
        // Commerce may extend it any more.
        foreach (glob($this->root().'/app/Livewire/Admin/Commerce/*.php') ?: [] as $file) {
            $source = (string) file_get_contents($file);

            Assert::same(false, str_contains($source, 'extends CommerceScreen'), basename($file).' is real');
        }
    }

    public function testEveryScreenHasItsOwnView(): void
    {
        foreach (self::SCREENS as $slug => $screen) {
            Assert::true(
                is_file($this->root().'/resources/views/livewire/admin/commerce/'.$screen['view'].'.blade.php'),
                "{$slug} renders its own view",
            );
        }
    }

    public function testEveryScreenAsksAValueObjectRatherThanCountingInline(): void
    {
        foreach (self::SCREENS as $slug => $screen) {
            $source = $this->source('/app/Livewire/Admin/Commerce/'.$screen['class'].'.php');

            Assert::true(
                str_contains($source, $screen['audit']),
                "{$slug} delegates its arithmetic to {$screen['audit']}",
            );
        }
    }

    public function testTheFindingIsStatedBeforeTheList(): void
    {
        foreach (self::SCREENS as $slug => $screen) {
            $view = $this->source('/resources/views/livewire/admin/commerce/'.$screen['view'].'.blade.php');

            $warningsAt = strpos($view, '@foreach ($warnings as $warning)');
            $tableAt = strpos($view, '<table');

            Assert::true($warningsAt !== false, "{$slug} has a warning block");

            if ($tableAt !== false) {
                Assert::true($warningsAt < $tableAt, "{$slug} says what is wrong before listing rows");
            }
        }
    }

    public function testEachScreenChecksItsOwnPermission(): void
    {
        foreach (self::SCREENS as $slug => $screen) {
            $source = $this->source('/app/Livewire/Admin/Commerce/'.$screen['class'].'.php');

            Assert::true(
                str_contains($source, "can('{$screen['permission']}')"),
                "{$slug} gates on {$screen['permission']}",
            );
        }
    }

    public function testNoScreenWrites(): void
    {
        foreach (self::SCREENS as $slug => $screen) {
            $source = $this->source('/app/Livewire/Admin/Commerce/'.$screen['class'].'.php');

            Assert::same(false, str_contains($source, '->save()'), "{$slug} does not save");
            Assert::same(false, str_contains($source, '->update('), "{$slug} does not update");
            Assert::same(false, str_contains($source, '->delete('), "{$slug} does not delete");
            Assert::same(false, str_contains($source, 'DB::table(') && str_contains($source, '->update('), "{$slug} writes nothing through the query builder");
        }
    }

    public function testRefundsReadsCancelledOrdersTooBecauseThatIsWhereTheMoneyIsHeld(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/RefundsIndex.php');

        Assert::true(
            str_contains($source, "->where('status', 'cancelled')->where('paid_minor', '>', 0)"),
            'a cancelled order holding money is not refunded, so it would be missed by a refund-only query',
        );
    }

    public function testPromotionsReportsDiscountMoneyWithNoCode(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/PromotionsIndex.php');
        $view = $this->source('/resources/views/livewire/admin/commerce/promotions-index.blade.php');

        Assert::true(str_contains($source, '$ledger->unattributed()'), 'the component asks for unwrapped discounts');
        Assert::true(str_contains($view, '$unattributed'), 'and the view shows them');
        Assert::true(str_contains($view, 'Discounted with no code'), 'in words that name the problem');
    }

    public function testShippingTaxAuditsRatherThanRecalculates(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/ShippingTaxIndex.php');

        Assert::true(str_contains($source, 'taxMismatches()'), 'it compares instead of writing a new total');
        Assert::true(str_contains($source, 'shippingMismatches()'), 'both charges');
        Assert::true(str_contains($source, 'CartService::DEFAULT_TAX_RATE_BP'), 'against the configured rate');
    }

    public function testReportsCountsOrdersNotLinesAndKeepsRefundsOutOfTheLines(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/ReportsIndex.php');

        Assert::true(str_contains($source, "'refunded' => 0"), 'refunds are not spread across product lines');
        Assert::true(str_contains($source, 'refundedInPeriod'), 'they are reported on their own');
        Assert::true(str_contains($source, 'commerce_order_items'), 'and the grain is the order line');
    }

    public function testSettingsComparesTheCounterWithTheNumbersAlreadyIssued(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/SettingsIndex.php');

        Assert::true(str_contains($source, 'Order::query()->pluck(\'number\')'), 'orders are read from the orders');
        Assert::true(str_contains($source, 'Invoice::query()->pluck(\'number\')'), 'and invoices from the invoices');
        Assert::true(str_contains($source, 'SequenceHealth'), 'so the counter is checked, not trusted');
        Assert::true(
            str_contains($source, 'preg_match'),
            'and the numeric tail is compared as a number, not a string',
        );
    }
}
