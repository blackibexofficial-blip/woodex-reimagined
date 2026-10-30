<?php

declare(strict_types=1);

namespace Tests\Billing;

use Tests\Support\Assert;

/**
 * The payments screen, read as source text.
 *
 * The comparisons are tested in PaymentLedgerTest. What is pinned here is that the screen
 * really compares the two tables rather than displaying the payment rows and hoping, and that
 * the thing which moves money is not on it.
 */
final class PaymentsScreenTest
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

    public function testTheScreenIsNoLongerAPlaceholder(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/PaymentsIndex.php');

        Assert::same(false, str_contains($source, 'extends CommerceScreen'), 'it reads real rows');
        Assert::true(str_contains($source, 'PaymentLedger'), 'through the ledger');
        Assert::true(
            is_file($this->root().'/resources/views/livewire/admin/commerce/payments-index.blade.php'),
            'with a view of its own',
        );
    }

    public function testTheTwoTablesAreActuallyCompared(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/PaymentsIndex.php');

        Assert::true(str_contains($source, 'Payment::query()'), 'payments come from the payments table');
        Assert::true(str_contains($source, "'recorded' => (int) \$order->paid_minor"), 'and the comparison reads paid_minor');
        Assert::true(str_contains($source, "'total' => (int) \$order->grand_total_minor"), 'against what the order was for');
    }

    public function testTheLedgerIsBuiltOncePerRequest(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/PaymentsIndex.php');

        Assert::true(str_contains($source, '$this->cachedLedger !== null'), 'the ledger is memoised');
        Assert::same(1, substr_count($source, 'new PaymentLedger('), 'and constructed in exactly one place');
    }

    public function testPendingBankTransfersAreTheFirstWarning(): void
    {
        $view = $this->source('/resources/views/livewire/admin/commerce/payments-index.blade.php');
        $ledger = $this->source('/app/Domain/Commerce/Billing/PaymentLedger.php');

        Assert::true(str_contains($ledger, 'waiting to be checked against the account'), 'the warning names the action');
        Assert::true(strpos($view, '@foreach ($warnings as $warning)') < strpos($view, '<table'), 'warnings come before the table');
        Assert::true(str_contains($view, '$summary[\'pending\']'), 'and the count is on the screen');
    }

    public function testACashOrderIsNotADiscrepancyAndNotABankQuestion(): void
    {
        $ledger = $this->source('/app/Domain/Commerce/Billing/PaymentLedger.php');

        Assert::true(
            str_contains($ledger, "\$payment['status'] === 'pending'\n                && \$payment['gateway'] !== 'cod'"),
            'a cash order awaiting collection is not waiting to be verified',
        );
        Assert::true(
            str_contains($ledger, "if (\$reference === '' || \$payment['gateway'] === 'cod')"),
            'and its handwritten receipt number is not compared against other receipts',
        );
    }

    public function testTheDispatchOfEachRowIsDoneInOnePass(): void
    {
        $ledger = $this->source('/app/Domain/Commerce/Billing/PaymentLedger.php');

        Assert::true(str_contains($ledger, 'public function states(): array'), 'there is a bulk verdict');
        Assert::true(
            str_contains($this->source('/app/Livewire/Admin/Commerce/PaymentsIndex.php'), '->states()'),
            'and the screen uses it rather than asking per row',
        );
    }

    public function testNothingOnTheScreenMovesMoney(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/PaymentsIndex.php');
        $view = $this->source('/resources/views/livewire/admin/commerce/payments-index.blade.php');

        Assert::same(false, str_contains($source, '->save()'), 'no saves in the component');
        Assert::same(false, str_contains($source, '->update('), 'and no updates');
        Assert::same(false, str_contains($source, 'markPaid'), 'nothing marks a payment paid');
        Assert::same(false, str_contains($view, 'wire:click'), 'and the view offers no buttons that would');
        Assert::true(str_contains($source, "can('commerce.payments.manage')"), 'reading the money still needs the money permission');
    }
}
