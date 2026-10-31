<?php

declare(strict_types=1);

namespace Tests\Billing;

use Tests\Support\Assert;

/**
 * The invoices screen, read as source text.
 *
 * The arithmetic is tested in InvoiceBalanceTest without a database. What is pinned here is the
 * boundary, and it changed with the ledger rebinding: the screen no longer reads a table the
 * commerce package writes for itself. It reads the OS invoices that name a commerce order, so
 * the list and the accountant's receivable are the same rows.
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

    /**
     * The whole point of the rebinding. `commerce_invoices` was a second set of books: the same
     * sale had a row here and a different number in Sales, and only one of them was ever posted
     * to the ledger. Nothing on this screen may read that table again.
     */
    public function testTheScreenReadsTheLedgerAndNotTheCommerceInvoiceTable(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/InvoicesIndex.php');

        Assert::true(str_contains($source, 'App\\Domain\\Sales\\Models\\Invoice'), 'it reads the ledger invoices');
        Assert::true(str_contains($source, 'commerce_order_id'), 'limited to the furniture orders');
        // Asserted on code shapes, not on the bare table name: the docblock on this class
        // explains what `commerce_invoices` was, and a substring check would fail on the
        // explanation rather than on a query.
        Assert::same(false, str_contains($source, "from('commerce_invoices')"), 'and never queries the commerce table');
        Assert::same(false, str_contains($source, 'Commerce\\Checkout\\Models\\Invoice'), 'nor uses its model');
    }

    public function testTheStatusIsDerivedAndNotReadFromTheColumn(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/InvoicesIndex.php');
        $view = $this->source('/resources/views/livewire/admin/commerce/invoices-index.blade.php');

        Assert::true(str_contains($source, 'new InvoiceBalance('), 'the balance is constructed per row');
        Assert::true(str_contains($view, '$balance->label()'), 'the badge shows the derived label');
        Assert::true(str_contains($view, '$balance->outstandingMinor()'), 'and the derived balance');

        // The stored status is consulted for exactly one thing: knowing whether a row is void.
        Assert::true(
            str_contains($source, '$invoice->status === InvoiceStatus::Void'),
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

        // `balance_minor` is written by the ledger, so filtering on it asks the question the
        // user is asking — who owes money — instead of "which rows still say issued".
        Assert::true(
            str_contains($source, "->where('invoices.balance_minor', '>', 0)"),
            'outstanding is the money still owed',
        );
        Assert::true(
            str_contains($source, "->whereDate('invoices.due_date', '<', now()->toDateString())"),
            'overdue is computed from the deadline',
        );
        Assert::true(str_contains($source, 'resetPage'), 'a filter change returns to page one');
    }

    /**
     * The printable document moved: the frozen PDF and the invoice page belong to the OS, where
     * the number, the snapshot and the journal entry live. Keeping a second renderer here is how
     * the paper and the ledger drift apart.
     */
    public function testTheDocumentIsServedByTheOneInvoiceTheStudioKeeps(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/InvoicesIndex.php');
        $view = $this->source('/resources/views/livewire/admin/commerce/invoices-index.blade.php');
        $routes = $this->source('/routes/commerce.php');

        Assert::true(str_contains($view, "route('admin.invoices.show'"), 'the row links to the OS invoice');
        Assert::same(false, str_contains($routes, 'invoices/{invoice}/print'), 'and no second renderer is routed');
        Assert::same(false, is_file($this->root().'/app/Http/Controllers/Admin/InvoiceDocumentController.php'), 'the controller is gone');
        Assert::same(false, is_file($this->root().'/resources/views/admin/commerce/invoice-document.blade.php'), 'and so is its view');
    }

    public function testTheScreenIsPermissioned(): void
    {
        $screen = $this->source('/app/Livewire/Admin/Commerce/InvoicesIndex.php');
        $routes = $this->source('/routes/commerce.php');

        Assert::true(str_contains($screen, "can('commerce.orders.view')"), 'the list checks the permission');
        Assert::true(str_contains($routes, "Route::get('/invoices'"), 'the route exists');
        Assert::same(
            false,
            str_contains($routes, "withoutMiddleware"),
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
