<?php

declare(strict_types=1);

namespace Tests\Billing;

use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The seam between a storefront order and the OS ledger.
 *
 * This is the one class in the commerce package that cannot be exercised here: it speaks to
 * `App\Domain\Sales`, `App\Domain\Accounts` and the OS's `invoices` table, none of which exist
 * in this checkout. Its behaviour is proven end to end in the OS; what is provable here is the
 * set of decisions that must not drift, because each one is a way two sets of books can reappear:
 *
 *   - the invoice must be `FurnitureSale`, not a "manual" invoice typed by staff;
 *   - the number must come from the OS sequence, never from `commerce_sequences`;
 *   - amounts must be copied from the order, never recomputed;
 *   - the order link must be a real column with a unique index, not a JSON blob;
 *   - nothing may reference `commerce_invoices` as the source of truth.
 */
final class OrderToLedgerTest extends TestCase
{
    private function action(): string
    {
        $path = self::sitePath('app/Domain/Commerce/Billing/OrderToLedger.php');
        Assert::same(true, $path !== null, 'the ledger bridge must exist');

        return (string) file_get_contents((string) $path);
    }

    public function testTheBridgeExistsAndIsFinal(): void
    {
        $source = $this->action();

        Assert::same(true, str_contains($source, 'final class OrderToLedger'));
        Assert::same(true, str_contains($source, 'public function handle('));
    }

    public function testTheInvoiceIsAFurnitureSaleIssuedByTheOs(): void
    {
        $source = $this->action();

        Assert::same(true, str_contains($source, 'InvoiceKind::FurnitureSale'), 'not InvoiceKind::Manual');
        Assert::same(true, str_contains($source, 'InvoiceStatus::Issued'), 'issued, so it can freeze and post');
        Assert::same(true, str_contains($source, 'BusinessLine::Furniture'), 'books to account 4020');
    }

    public function testTheNumberComesFromTheOsSequence(): void
    {
        $source = $this->action();

        Assert::same(true, str_contains($source, "next('furniture.invoice')"));
        Assert::same(false, str_contains($source, 'commerce_sequences'), 'not the commerce numbering');
    }

    public function testAmountsAreCopiedFromTheOrderRatherThanRecomputed(): void
    {
        $source = $this->action();

        foreach (['subtotal_minor', 'discount_minor', 'tax_minor', 'shipping_minor', 'grand_total_minor'] as $field) {
            Assert::same(true, str_contains($source, "\$order->{$field}"), "{$field} must come from the order");
        }

        // A multiplication inside the invoice builder is the bug this test exists to prevent.
        Assert::same(false, str_contains($source, 'qty * '), 'the bridge must not reprice a line');
    }

    public function testItPostsThroughTheOsLedgerRatherThanKeepingItsOwn(): void
    {
        $source = $this->action();

        Assert::same(true, str_contains($source, 'PostInvoiceToLedger'), 'the receivable is booked by the OS');
        Assert::same(true, str_contains($source, 'InvoiceFreezer'), 'and the document is frozen before posting');
        Assert::same(false, str_contains($source, 'CommerceInvoice::'), 'must not write a second ledger');
        Assert::same(false, str_contains($source, "from('commerce_invoices')"), 'nor read one');
    }

    public function testAFreezeHappensBeforeTheLedgerPosting(): void
    {
        $source = $this->action();

        $freeze = strpos($source, '->freeze(');
        $post = strpos($source, '->handle($invoice');

        Assert::same(true, $freeze !== false && $post !== false, 'both steps are present');
        Assert::same(true, $freeze < $post, 'the PDF exists before the receivable does');
    }

    public function testTheOrderLinkIsAUniqueColumnNotAJsonKey(): void
    {
        $path = self::sitePath('database/migrations/2026_10_28_105000_add_commerce_order_to_invoices.php');
        Assert::same(true, $path !== null, 'the link migration must exist');

        $migration = (string) file_get_contents((string) $path);

        Assert::same(true, str_contains($migration, "'commerce_order_id'"), 'a real column');
        Assert::same(true, str_contains($migration, "unique('commerce_order_id')"), 'one order, one invoice — enforced by the database');
        Assert::same(true, str_contains($migration, "hasTable('invoices')"), 'inert where the OS is absent');
    }

    public function testTheCustomerBecomesAnOsContact(): void
    {
        $source = $this->action();

        Assert::same(true, str_contains($source, 'Contact::query()->create'), 'the buyer exists in CRM, not only in commerce');
        Assert::same(true, str_contains($source, 'Phone::normalize'), 'matched on a normalised phone');
        Assert::same(true, str_contains($source, "where('phone', \$phone)"), 'a repeat buyer reuses the contact');
    }

    public function testItIsIdempotentByConstruction(): void
    {
        $source = $this->action();

        Assert::same(true, str_contains($source, 'lockForUpdate'), 'the order row is locked before the second read');
        Assert::true(
            substr_count($source, 'Invoice::query()->where(\'commerce_order_id\', $order->id)') >= 2,
            'checked before the transaction and again inside it',
        );
    }

    public function testAWebOrderNeedsNoStaffUser(): void
    {
        $source = $this->action();

        Assert::same(true, str_contains($source, '?User $actor = null'), 'a checkout has no employee');
        Assert::same(true, str_contains($source, "'created_by' => \$actor?->id"), 'null actor means it came from the storefront');
    }
}
