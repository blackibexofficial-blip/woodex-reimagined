<?php

declare(strict_types=1);

namespace Tests\Billing;

use Tests\Support\Assert;

/**
 * The invoices screen, read as source text.
 *
 * The arithmetic is tested in InvoiceBalanceTest without a database. What is pinned here is the
 * boundary: that the screen asks the value object instead of trusting the status column, that
 * the printable document is a real page and not a screenshot of the admin, and that neither can
 * be reached without the permission.
 */
final class InvoicesScreenTest
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
        $source = $this->source('/app/Livewire/Admin/Commerce/InvoicesIndex.php');

        Assert::same(false, str_contains($source, 'extends CommerceScreen'), 'it reads real rows');
        Assert::true(str_contains($source, 'InvoiceBalance'), 'through the balance value object');
        Assert::true(
            is_file($this->root().'/resources/views/livewire/admin/commerce/invoices-index.blade.php'),
            'with a view of its own',
        );
    }

    public function testTheStatusIsDerivedAndNotReadFromTheColumn(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/InvoicesIndex.php');
        $view = $this->source('/resources/views/livewire/admin/commerce/invoices-index.blade.php');

        Assert::true(str_contains($source, 'new InvoiceBalance('), 'the balance is constructed per row');
        Assert::true(str_contains($view, '$balance->label()'), 'the badge shows the derived label');
        Assert::true(str_contains($view, '$balance->outstandingMinor()'), 'and the derived balance');

        // The stored column is consulted for exactly one thing: knowing whether a row is void.
        Assert::true(
            str_contains($source, '$invoice->status === Invoice::VOID'),
            'the stored status is only used to detect a void',
        );
        Assert::same(
            false,
            str_contains($view, '$invoice->status'),
            'the view never renders the stored status as a label',
        );
    }

    public function testFiltersAskAboutMoneyRatherThanTheStatusColumn(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/InvoicesIndex.php');

        Assert::true(
            str_contains($source, 'commerce_orders.paid_minor - commerce_orders.refunded_minor < commerce_invoices.total_minor'),
            'outstanding is computed from the money',
        );
        Assert::true(str_contains($source, "where('due_at', '<', now())"), 'overdue is computed from the deadline');
        Assert::true(str_contains($source, 'resetPage'), 'a filter change returns to page one');
    }

    public function testThePrintableDocumentIsItsOwnPage(): void
    {
        $view = $this->source('/resources/views/admin/commerce/invoice-document.blade.php');

        Assert::true(str_contains($view, '<!doctype html>'), 'it is a whole document');
        Assert::same(false, str_contains($view, '<x-app-layout'), 'not wrapped in the admin layout');
        Assert::same(false, str_contains($view, '<x-admin.'), 'and carries no admin chrome');
        Assert::true(str_contains($view, '@media print'), 'with print rules');
        Assert::true(str_contains($view, '@page'), 'and page margins');
        Assert::true(str_contains($view, '.actions { display: none; }'), 'buttons are not printed');
    }

    public function testTheDocumentAndTheScreenCannotDisagree(): void
    {
        $controller = $this->source('/app/Http/Controllers/Admin/InvoiceDocumentController.php');
        $view = $this->source('/resources/views/admin/commerce/invoice-document.blade.php');

        Assert::true(str_contains($controller, 'new InvoiceBalance('), 'the paper uses the same value object');
        Assert::true(str_contains($view, '$balance->outstandingMinor()'), 'and shows the same balance');
        Assert::true(str_contains($view, '$balance->label()'), 'with the same label');

        // Line totals come from the invoice's own items when they exist, and from the order
        // only when the invoice has none — never recalculated from today's prices.
        Assert::true(str_contains($controller, '$invoice->items->isNotEmpty()'), 'invoice items win');
        Assert::true(str_contains($controller, 'Money::ofMinor'), 'and money is formatted, not divided');
    }

    public function testBothRoutesArePermissioned(): void
    {
        $screen = $this->source('/app/Livewire/Admin/Commerce/InvoicesIndex.php');
        $controller = $this->source('/app/Http/Controllers/Admin/InvoiceDocumentController.php');
        $routes = $this->source('/routes/commerce.php');

        Assert::true(str_contains($screen, "can('commerce.orders.view')"), 'the list checks the permission');
        Assert::true(str_contains($controller, "can('commerce.orders.view')"), 'and so does the printed document');
        Assert::true(str_contains($routes, "invoices/{invoice}/print"), 'the print route exists');
        Assert::true(str_contains($routes, "->whereNumber('invoice')"), 'and only accepts a numeric id');
        Assert::same(
            false,
            str_contains($routes, "invoices.{invoice}.print')->withoutMiddleware"),
            'no middleware is stripped to make it reachable',
        );
    }

    public function testAnInvoiceIsNeverEditedFromTheList(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/InvoicesIndex.php');
        $view = $this->source('/resources/views/livewire/admin/commerce/invoices-index.blade.php');

        Assert::same(false, str_contains($source, '->save()'), 'no writes in the component');
        Assert::same(false, str_contains($source, '->update('), 'none at all');
        Assert::same(false, str_contains($view, 'Delete'), 'and no destructive button');
    }
}
