<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Billing;

use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Checkout\Models\Payment as CommercePayment;
use App\Domain\Sales\Actions\RecordPayment;
use App\Domain\Sales\Enums\PaymentMethod;
use App\Domain\Sales\Models\Invoice;
use App\Domain\Sales\Models\Payment as LedgerPayment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

/**
 * Turns money that arrived into a receipt the books can defend.
 *
 * `OrderToLedger` books the sale: an order becomes an invoice, and the invoice debits receivable.
 * That is only half of a ledger. Until the cash shows up, every furniture invoice sits at full
 * balance and Accounts is wrong by the size of the business — which for a shop that takes cash on
 * delivery is wrong from the first delivery onwards.
 *
 * So this is the other half, and it does not invent a second way to record a payment. The OS
 * already has one: `RecordPayment` allocates against an invoice, numbers a receipt, freezes its
 * PDF, posts DR cash / CR 1100 and notifies the team. Calling it means a COD delivery and a
 * showroom sale use the same path, produce the same receipt numbers and land in the same journal.
 *
 * What is genuinely different between a shop and a studio is *when* each believes money is real.
 * Commerce writes an attempt at placement and leaves it unpaid until the courier returns with the
 * cash; Accounts only ever records money it has seen. The bridge is where those two clocks are
 * joined, and `payments.commerce_payment_id` is the join: one attempt becomes one receipt, once.
 */
final class PaymentToLedger
{
    public function __construct(private readonly RecordPayment $recorder) {}

    /**
     * Settle the order's payment attempt against its invoice.
     *
     * Returns the receipt that settles it, or null when this install has no ledger to settle
     * into — the same contract `OrderToLedger` keeps, so a bare commerce install still works.
     *
     * @throws RuntimeException when the money has nowhere to be booked.
     */
    public function settle(Order $order, ?User $actor = null): ?LedgerPayment
    {
        if (! $this->hasLedger()) {
            return null;
        }

        // A receipt is an act with a name attached: the person who checked the cash. There is
        // deliberately no anonymous path. A gateway callback that needs to settle without a
        // human will get its own explicit entry point, with the gateway as the actor, rather
        // than this one quietly accepting nobody.
        if ($actor === null) {
            throw new RuntimeException('A payment is settled by a person. Pass the user who confirmed the money arrived.');
        }

        return DB::transaction(function () use ($order, $actor): LedgerPayment {
            $order = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();

            $invoice = Invoice::query()->where('commerce_order_id', $order->id)->first();

            if ($invoice === null) {
                // Booked money with no document is money that cannot be chased, refunded or
                // explained. Refuse before writing anything.
                throw new RuntimeException("Order {$order->number} has no invoice. Book the sale before settling it.");
            }

            $attempt = CommercePayment::query()
                ->where('order_id', $order->id)
                ->orderBy('id')
                ->first();

            if ($attempt === null) {
                throw new RuntimeException("Order {$order->number} has no payment attempt to settle.");
            }

            $existing = LedgerPayment::query()->where('commerce_payment_id', $attempt->id)->first();

            if ($existing !== null) {
                return $existing;
            }

            $amount = (int) $attempt->amount_minor;

            if ($amount <= 0) {
                throw new RuntimeException("Payment attempt {$attempt->id} has no money to settle.");
            }

            // Allocate what the invoice can still take; anything beyond it becomes a customer
            // advance (1150) through the OS's own rule. Capping here rather than allocating the
            // whole amount keeps a COD overpayment from being refused outright by `AllocatePayment`
            // — the shop did receive the money, and the books should say so.
            $allocatable = max(0, min($amount, (int) $invoice->balance_minor));

            $ledgerPayment = $this->recorder->handle([
                'contact_id' => (int) $invoice->contact_id,
                'amount_minor' => $amount,
                'received_on' => now()->toDateString(),
                'method' => $this->methodFor((string) $attempt->gateway)->value,
                'reference' => $this->referenceFor($attempt, $order->number),
                'notes' => "Furniture order {$order->number} · {$invoice->number}",
                'allocations' => $allocatable > 0 ? [(int) $invoice->id => $allocatable] : [],
            ], $actor);

            $ledgerPayment->forceFill(['commerce_payment_id' => $attempt->id])->save();

            // No argument: `markPaid()` would otherwise write the receipt number into
            // `reference`, overwriting the gateway or bank reference the accountant matches
            // against a statement. The receipt is reachable through the link this method just
            // wrote, which is the durable join.
            $attempt->markPaid();

            // `min` because the delivery path already sets `paid_minor` to the full total when a
            // COD order is delivered. Adding blindly would double-count the sale; clamping is
            // correct from both entry points.
            $order->paid_minor = min(
                (int) $order->grand_total_minor,
                (int) $order->paid_minor + $allocatable,
            );

            if ($order->paid_minor >= (int) $order->grand_total_minor) {
                $order->payment_status = 'paid';
            }

            $order->save();

            return $ledgerPayment->refresh();
        });
    }

    /**
     * The gateway a customer chose, expressed as a method the studio's chart understands.
     *
     * `cod` is cash: the courier hands over notes. A gateway is `gateway` rather than the brand,
     * because which brand it was is a fact about the attempt (already on the commerce row and in
     * its payload) and the chart only has one account behind all of them.
     */
    private function methodFor(string $gateway): PaymentMethod
    {
        return match ($gateway) {
            'cod' => PaymentMethod::Cash,
            'bank' => PaymentMethod::BankTransfer,
            'cheque' => PaymentMethod::Cheque,
            'card' => PaymentMethod::Card,
            'jazzcash' => PaymentMethod::JazzCash,
            'easypaisa' => PaymentMethod::Easypaisa,
            'safepay' => PaymentMethod::Gateway,
            default => PaymentMethod::Other,
        };
    }

    /**
     * What the accountant will read on the receipt.
     *
     * A gateway reference when there is one — that is what a bank statement can be matched
     * against — and otherwise the order number, so a cash receipt is still traceable to a
     * delivery.
     */
    private function referenceFor(CommercePayment $attempt, string $orderNumber): string
    {
        $reference = trim((string) $attempt->reference);

        return $reference !== '' ? $reference : $orderNumber;
    }

    /**
     * Read-only view of what settling would do, for a screen that has to say so before it acts.
     *
     * @return array{settled: bool, amount_minor: int, allocatable_minor: int, advance_minor: int, receipt: ?string, invoice: ?string}
     */
    public function summaryFor(Order $order): array
    {
        if (! $this->hasLedger()) {
            return ['settled' => false, 'amount_minor' => 0, 'allocatable_minor' => 0, 'advance_minor' => 0, 'receipt' => null, 'invoice' => null];
        }

        $invoice = Invoice::query()->where('commerce_order_id', $order->id)->first();
        $attempt = CommercePayment::query()->where('order_id', $order->id)->orderBy('id')->first();
        $settled = $attempt === null ? null : LedgerPayment::query()->where('commerce_payment_id', $attempt->id)->first();

        $amount = (int) ($attempt?->amount_minor ?? 0);
        $allocatable = $invoice === null ? 0 : max(0, min($amount, (int) $invoice->balance_minor));

        return [
            'settled' => $settled !== null,
            'amount_minor' => $amount,
            'allocatable_minor' => $allocatable,
            'advance_minor' => $amount - $allocatable,
            'receipt' => $settled?->receipt_number,
            'invoice' => $invoice?->number,
        ];
    }

    /**
     * Whether this install can settle at all.
     *
     * All three pieces are required and none can be assumed: an install may have the invoices
     * without the payments link if it upgraded in the middle of this work.
     */
    private function hasLedger(): bool
    {
        return Schema::hasTable('payments')
            && Schema::hasTable('invoices')
            && Schema::hasColumn('payments', 'commerce_payment_id')
            && Schema::hasColumn('invoices', 'commerce_order_id');
    }
}
