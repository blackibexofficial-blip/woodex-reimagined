<?php

declare(strict_types=1);

namespace Tests\Catalog;

use Tests\Support\Assert;

/**
 * The customers screen, read as source text.
 *
 * The folding is tested in CustomerLedgerTest. What is pinned here is the decision behind it:
 * that the screen derives people from orders instead of inventing a table, that a cancelled
 * order is not a customer's purchase, and that nothing is merged or edited behind the
 * operator's back.
 */
final class CustomersScreenTest
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
        $source = $this->source('/app/Livewire/Admin/Commerce/CustomersIndex.php');

        Assert::same(false, str_contains($source, 'extends CommerceScreen'), 'it reads real rows');
        Assert::true(str_contains($source, 'CustomerLedger'), 'through the ledger');
        Assert::true(
            is_file($this->root().'/resources/views/livewire/admin/commerce/customers-index.blade.php'),
            'with a view of its own',
        );
    }

    public function testCustomersAreDerivedFromOrdersRatherThanInvented(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/CustomersIndex.php');

        Assert::true(str_contains($source, 'Order::query()'), 'the source of truth is the order table');
        Assert::same(false, str_contains($source, 'commerce_customers'), 'there is no customer table to read');
        Assert::true(str_contains($source, "firstWhere('type', 'shipping')"), 'the shipping address identifies them');
        Assert::true(str_contains($source, "firstWhere('type', 'billing')"), 'with billing as the fallback for phone orders');
    }

    public function testACancelledOrderIsNotACustomerPurchase(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/CustomersIndex.php');

        Assert::true(
            str_contains($source, "->where('status', '<>', 'cancelled')"),
            'a cancelled order does not count towards lifetime value or the repeat count',
        );
    }

    public function testRefundsComeOffWhatTheCustomerPaid(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/CustomersIndex.php');

        Assert::true(
            str_contains($source, '$order->paid_minor - (int) $order->refunded_minor'),
            'paid, net of refunds — the same rule the invoice screen uses',
        );
    }

    public function testGroupingUsesTheNormalisedNumberNotTheRawString(): void
    {
        $view = $this->source('/resources/views/livewire/admin/commerce/customers-index.blade.php');
        $source = $this->source('/app/Livewire/Admin/Commerce/CustomersIndex.php');

        Assert::true(str_contains($source, 'PhoneNumber::format'), 'the number is displayed through the formatter');
        Assert::true(str_contains($view, '$customer->displayPhone()'), 'and the view asks for it there');
        // Raw digits are fine as a React-style row key; they are not fine as the thing a
        // person reads, which is why the only occurrence is inside wire:key.
        Assert::same(1, substr_count($view, '$customer->phone'), 'the raw digits appear exactly once');
        Assert::true(
            str_contains($view, 'wire:key="customer-{{ $customer->phone }}"'),
            'and that once is the row key, not the visible number',
        );
    }

    public function testTheThreeThingsOrdersCannotShowAreOnTheScreen(): void
    {
        $view = $this->source('/resources/views/livewire/admin/commerce/customers-index.blade.php');

        Assert::true(str_contains($view, '$customer->isRepeat()'), 'who came back');
        Assert::true(str_contains($view, '$customer->hasNameConflict()'), 'which numbers carry more than one name');
        Assert::true(str_contains($view, '$customer->outstandingMinor()'), 'and what is still owed');
    }

    public function testOrdersThatCannotBeIdentifiedAreAdmittedNotDropped(): void
    {
        $view = $this->source('/resources/views/livewire/admin/commerce/customers-index.blade.php');

        Assert::true(str_contains($view, "\$summary['unidentified']"), 'the screen says how many orders it could not place');
        Assert::true(str_contains($view, 'still need delivering'), 'and that they are still real orders');
    }

    public function testNothingIsEditedOrMergedAutomatically(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/CustomersIndex.php');
        $view = $this->source('/resources/views/livewire/admin/commerce/customers-index.blade.php');

        Assert::same(false, str_contains($source, '->save()'), 'no writes in the component');
        Assert::same(false, str_contains($source, '->update('), 'and no updates');
        Assert::same(false, str_contains($view, 'wire:click'), 'no merge button, because merging is a judgement call');
        Assert::true(str_contains($source, "can('commerce.customers.view')"), 'and the view permission is checked');
    }
}
