<?php

declare(strict_types=1);

namespace Tests\Billing;

use Tests\Support\Assert;
use Tests\TestCase;

/**
 * One sale, one invoice, one set of books.
 *
 * The commerce package arrived with its own invoices: a table, a counter, a model and a printed
 * document. The OS had all four already, and only the OS version was ever posted to the ledger.
 * So the same order had two numbers, one of which no accountant had seen.
 *
 * `OrderToLedger` closed that by raising the OS invoice from the placed order. These checks pin
 * the closing — that the checkout books, that nothing still writes `commerce_invoices`, and
 * that the tables are gone rather than merely unused.
 */
final class OneLedgerTest extends TestCase
{
    private static function read(string $relative): string
    {
        $path = self::sitePath($relative);

        Assert::trueWith(is_file((string) $path), static fn (): string => "missing file {$relative}", 'file exists');

        return is_file((string) $path) ? (string) file_get_contents((string) $path) : '';
    }

    /** @return list<string> */
    private static function phpFiles(string $relative): array
    {
        $root = self::sitePath($relative);

        if ($root === null || ! is_dir($root)) {
            return [];
        }

        $files = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));

        foreach ($iterator as $file) {
            if ($file instanceof \SplFileInfo && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }

        return $files;
    }

    public function testTheCheckoutRaisesTheLedgerInvoiceAndNotItsOwn(): void
    {
        $service = self::read('app/Domain/Commerce/Checkout/CheckoutService.php');

        Assert::true(str_contains($service, 'OrderToLedger'), 'the checkout knows the bridge');
        Assert::true(str_contains($service, '$this->ledger()?->handle($order'), 'and calls it with the order it just wrote');
        Assert::true(str_contains($service, "Schema::hasTable('invoices')"), 'resolving it is guarded by the ledger schema');

        // The old arrangement, in full: a number minted beside the order and a row written into
        // a second table.
        Assert::same(false, str_contains($service, 'Invoice::create'), 'it writes no invoice row itself');
        Assert::same(false, str_contains($service, 'toInvoiceRow'), 'and mints no invoice number');
        Assert::same(false, str_contains($service, '$this->numbers->pair()'), 'the pair allocator is gone');
    }

    /**
     * The seam that actually failed once.
     *
     * A class-typed constructor parameter with a default is never autowired — the container
     * returns the default — so `private readonly ?OrderToLedger $ledger = null` was null in every
     * request, and one order was placed with no invoice while the code read as though it booked.
     * The bridge is resolved at call time for exactly this reason.
     */
    public function testTheBridgeIsNotAnAutowiredConstructorParameter(): void
    {
        $service = self::read('app/Domain/Commerce/Checkout/CheckoutService.php');

        // Matched as a property declaration, not as the phrase: the docblock on `ledger()`
        // quotes the broken signature in order to explain it, and a substring check on prose
        // would fail on the explanation rather than on the code.
        Assert::same(false, str_contains($service, 'readonly ?OrderToLedger'), 'not left to autowiring');
        Assert::true(str_contains($service, 'private function ledger(): ?OrderToLedger'), 'resolved on demand');
        Assert::true(str_contains($service, 'app(OrderToLedger::class)'), 'from the container, once the schema says so');
    }

    public function testNoCommerceCodeReferencesTheSecondLedger(): void
    {
        $offenders = [];

        foreach (self::phpFiles('app/Domain/Commerce') as $file) {
            $source = (string) file_get_contents($file);

            foreach (["from('commerce_invoices')", 'Commerce\\Checkout\\Models\\Invoice', 'Commerce\\Checkout\\Models\\InvoiceItem'] as $needle) {
                if (str_contains($source, $needle)) {
                    $offenders[] = basename($file).': '.$needle;
                }
            }
        }

        Assert::same([], $offenders, 'nothing in the commerce domain reads or names a commerce invoice');
    }

    public function testTheSecondLedgerTablesAreActuallyDropped(): void
    {
        $migration = self::read('database/migrations/2026_10_28_106000_drop_commerce_second_ledger.php');

        Assert::true(str_contains($migration, "where('key', 'invoice')"), 'the INV- counter row is deleted');
        Assert::true(str_contains($migration, "dropIfExists('commerce_invoice_items')"), 'the line items table goes');
        Assert::true(str_contains($migration, "dropIfExists('commerce_invoices')"), 'and the invoice table');
        Assert::true(str_contains($migration, 'dropPaymentInvoiceColumn'), 'the payment link goes with it');
        Assert::true(str_contains($migration, 'commerce_payments_rebuilt'), 'SQLite rebuilds rather than leaving the column');
    }

    /**
     * A gateway attempt is not an accounting entry, so it survives. What it loses is the link to
     * a table that no longer exists; the sale is found through the order.
     */
    public function testPaymentsKeepTheAttemptAndLoseTheDeadLink(): void
    {
        $payment = self::read('app/Domain/Commerce/Checkout/Models/Payment.php');

        Assert::true(str_contains($payment, 'public function order(): BelongsTo'), 'a payment names its order');
        Assert::same(false, str_contains($payment, 'public function invoice()'), 'and no longer its invoice');
    }

    /**
     * Two invoices for one order is the failure this whole change exists to prevent, and it is
     * prevented in the schema rather than in a convention: `commerce_order_id` is unique.
     */
    public function testOneOrderCannotProduceTwoInvoices(): void
    {
        $link = self::read('database/migrations/2026_10_28_105000_add_commerce_order_to_invoices.php');
        $bridge = self::read('app/Domain/Commerce/Billing/OrderToLedger.php');

        Assert::true(str_contains($link, "unique('commerce_order_id')"), 'the database refuses a second invoice');
        Assert::true(str_contains($bridge, 'lockForUpdate'), 'and the bridge serialises concurrent callers');
        Assert::true(str_contains($bridge, 'if ($existing !== null)'), 'returning the invoice that already exists');
    }
}
