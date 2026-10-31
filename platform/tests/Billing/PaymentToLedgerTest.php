<?php

declare(strict_types=1);

namespace Tests\Billing;

use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The seam between money arriving and the OS recording it.
 *
 * `OrderToLedger` books the sale, which leaves every furniture invoice at full balance until
 * somebody settles it. This bridge closes that. Like its sibling it cannot be exercised here —
 * it speaks to `App\Domain\Sales` and the OS `payments` table — so what is pinned is the set of
 * decisions that must not drift, each one a way the two clocks (shop and ledger) can disagree:
 *
 *   - the receipt must be the OS's, not a second payment record invented for commerce;
 *   - one attempt settles once, enforced by a unique column rather than by code care;
 *   - the amount posted must be the amount received, and nothing may exceed the invoice;
 *   - a method must map onto the studio's chart, not leak a gateway name into it.
 */
final class PaymentToLedgerTest extends TestCase
{
    private function bridge(): string
    {
        $path = self::sitePath('app/Domain/Commerce/Billing/PaymentToLedger.php');

        Assert::same(true, $path !== null, 'the payment bridge must exist');

        return (string) file_get_contents((string) $path);
    }

    public function testTheBridgeIsFinalAndSettlesThroughTheOs(): void
    {
        $source = $this->bridge();

        Assert::same(true, str_contains($source, 'final class PaymentToLedger'), 'a single, final bridge');
        Assert::same(true, str_contains($source, 'use App\\Domain\\Sales\\Actions\\RecordPayment;'), 'it calls the studio action');
        Assert::same(true, str_contains($source, '$this->recorder->handle('), 'and does not reimplement it');
        Assert::same(false, str_contains($source, 'Payment::create'), 'no second payment table');
    }

    /**
     * The whole point. A shop believes money is real when the courier hands it over; a ledger
     * believes it when somebody counted it. One attempt must become one receipt, and the guard
     * has to be a unique column because two confirmations can arrive at the same instant.
     */
    public function testOneAttemptSettlesOnce(): void
    {
        $source = $this->bridge();

        Assert::same(true, str_contains($source, 'where(\'commerce_payment_id\', $attempt->id)'), 'it looks up an existing receipt');
        Assert::same(true, str_contains($source, 'if ($existing !== null)'), 'and returns it rather than making another');
        Assert::same(true, str_contains($source, 'lockForUpdate'), 'serialising two confirmations');

        $migration = (string) file_get_contents(
            (string) self::sitePath('database/migrations/2026_10_28_107000_add_commerce_payment_to_payments.php'),
        );

        Assert::same(true, str_contains($migration, "->unique()"), 'the database refuses a second receipt for one attempt');
        Assert::same(true, str_contains($migration, "Schema::hasTable('payments')"), 'and the migration is inert without a ledger');
    }

    /**
     * Allocating more than the invoice can take is how a COD overpayment gets refused outright by
     * `AllocatePayment` — the shop did receive the money, and the books should say so.
     */
    public function testTheAllocationIsCappedByTheInvoiceAndTheRestBecomesAnAdvance(): void
    {
        $source = $this->bridge();

        Assert::same(true, str_contains($source, '$allocatable = max(0, min($amount, (int) $invoice->balance_minor))'), 'capped at the balance');
        Assert::same(true, str_contains($source, '[(int) $invoice->id => $allocatable]'), 'allocated against this invoice only');
        Assert::same(true, str_contains($source, "'advance_minor' => \$amount - \$allocatable"), 'and the remainder is reported as an advance');
    }

    public function testTheReceiptIsAttributedToAPerson(): void
    {
        $source = $this->bridge();

        Assert::same(true, str_contains($source, 'if ($actor === null)'), 'there is no anonymous receipt');
        Assert::same(true, str_contains($source, 'A payment is settled by a person.'), 'and it says so plainly');
    }

    public function testTheOrderAndAttemptAreMarkedSettledTogether(): void
    {
        $source = $this->bridge();

        Assert::same(true, str_contains($source, '$attempt->markPaid();'), 'the attempt is closed');
        Assert::same(true, str_contains($source, 'min('), 'and the order total is clamped, never double-counted');
        Assert::same(true, str_contains($source, "'paid'"), 'the order reports itself paid');
    }

    /**
     * A COD promise is not an accounting method. What the chart understands is cash, a transfer,
     * a cheque — not "safepay". The brand stays on the commerce row where it belongs.
     */
    public function testGatewaysMapOntoTheStudiosChart(): void
    {
        $source = $this->bridge();

        Assert::same(true, str_contains($source, "'cod' => PaymentMethod::Cash"), 'cash on delivery is cash');
        Assert::same(true, str_contains($source, "'bank' => PaymentMethod::BankTransfer"), 'a transfer is a transfer');
        Assert::same(true, str_contains($source, 'default => PaymentMethod::Other'), 'and anything new lands somewhere honest');
        // JazzCash and easypaisa are OS `PaymentMethod` cases in their own right, so they map to
        // themselves. Safepay is a card brand with no account behind it, which is why it is the
        // one that must collapse into `Gateway` rather than inventing a ledger account.
        Assert::same(true, str_contains($source, "'safepay' => PaymentMethod::Gateway"), 'a card brand is just a gateway');
    }

    /**
     * The delivery path already sets `paid_minor` to the full total when a COD order is marked
     * delivered. A bridge that adds the receipt on top of that would count the sale twice.
     */
    public function testSettlingAfterDeliveryDoesNotDoubleCountTheSale(): void
    {
        $source = $this->bridge();

        Assert::same(true, str_contains($source, '(int) $order->paid_minor + $allocatable'), 'it adds to what is recorded');
        Assert::same(true, str_contains($source, '(int) $order->grand_total_minor,'), 'and clamps at the order total');

        $screen = (string) file_get_contents((string) self::sitePath('app/Livewire/Admin/Commerce/OrderShow.php'));

        Assert::same(true, str_contains($screen, 'OrderStatus::PAYMENT_PAID'), 'the delivery action checks whether money became real');
        Assert::same(true, str_contains($screen, '$this->settle(silent: true)'), 'and settles when it did');
    }

    public function testNoLedgerMeansNoSettlementRatherThanAFailure(): void
    {
        $source = $this->bridge();

        Assert::same(true, str_contains($source, 'private function hasLedger(): bool'), 'the install is asked first');
        Assert::same(true, str_contains($source, "Schema::hasColumn('payments', 'commerce_payment_id')"), 'all three pieces are required');
        Assert::same(true, str_contains($source, 'return null;'), 'and absence is a null, not an exception');
    }
}
