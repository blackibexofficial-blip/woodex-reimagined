<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Billing;

use App\Domain\Accounts\Actions\PostInvoiceToLedger;
use App\Domain\Crm\Enums\BusinessLine;
use App\Domain\Crm\Models\Contact;
use App\Domain\Sales\Enums\InvoiceKind;
use App\Domain\Sales\Enums\InvoiceStatus;
use App\Domain\Sales\Models\Invoice;
use App\Domain\Sales\Models\InvoiceItem;
use App\Domain\Sales\Services\InvoiceFreezer;
use App\Models\User;
use App\Support\Numbering;
use App\Support\Phone;
use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Checkout\OrderStatus;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * A paid-for basket becomes a sales invoice in the OS ledger — the one and only money path.
 *
 * ## Why this class exists
 *
 * The Commerce build shipped with `commerce_invoices`, which was a second set of books. Two
 * systems that both claim to know what was sold is not a duplication problem, it is an audit
 * problem: at year-end the invoice list and the ledger disagree and neither is wrong.
 *
 * So the commerce side no longer issues invoices. It raises one here, in the OS, where:
 *
 *  - the number comes from the OS's own `furniture.invoice` sequence (`WFI-2026-0001`),
 *  - the document is frozen to a PDF by `InvoiceFreezer`, exactly like a milestone invoice,
 *  - the receivable, revenue and tax are booked by `PostInvoiceToLedger` to accounts 1100,
 *    4020 and 2100,
 *  - the customer is an OS `Contact`, so the sale shows up in CRM with the rest of their history.
 *
 * Nothing is re-derived. The order's stored money is copied verbatim; this class never multiplies
 * a quantity by a price, because a cart total was already decided when the order was placed and
 * recalculating it here would silently reprice a sale after the fact.
 *
 * ## Idempotency
 *
 * A customer who double-taps "Place order", a retried webhook, or an operator re-running the
 * console command must all produce one invoice. The guarantee is not a check-then-write (which
 * races); it is the unique index on `invoices.commerce_order_id` plus `lockForUpdate` on the
 * order. The second caller blocks, finds the row, and returns it.
 *
 * ## No staff user required
 *
 * A web checkout has no logged-in employee. `PostInvoiceToLedger` accepts a null actor and
 * `invoices.created_by` is nullable, so a sale is attributed to the order rather than to a
 * person. When an operator triggers the same path from the admin, their user is passed and
 * recorded. That difference is deliberate and visible: `created_by = null` on a furniture
 * invoice means it came from the storefront, not from a member of staff.
 */
final class OrderToLedger
{
    /** Payment terms for a storefront sale: due on delivery is the furniture trade's default. */
    private const int DUE_IN_DAYS = 7;

    public function __construct(
        private readonly Numbering $numbering,
        private readonly InvoiceFreezer $freezer,
        private readonly PostInvoiceToLedger $postToLedger,
    ) {}

    /**
     * Raise (or return) the OS invoice for a placed order.
     *
     * @param  bool  $alreadyPaid  true when the order was paid at placement (a gateway callback),
     *                             false for cash on delivery, which leaves a balance outstanding.
     *
     * @throws RuntimeException when the order has no address, or no money to book.
     */
    public function handle(Order $order, ?User $actor = null, bool $alreadyPaid = false): Invoice
    {
        $existing = Invoice::query()->where('commerce_order_id', $order->id)->first();

        if ($existing !== null) {
            return $existing;
        }

        return DB::transaction(function () use ($order, $actor, $alreadyPaid): Invoice {
            // Lock the order before reading anything else. Two simultaneous callers serialise
            // here, so the second sees the first's invoice instead of raising a duplicate that
            // the unique index would then reject with an ugly SQL error.
            $order = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();

            $existing = Invoice::query()->where('commerce_order_id', $order->id)->first();

            if ($existing !== null) {
                return $existing;
            }

            $total = (int) $order->grand_total_minor;

            if ($total <= 0) {
                // A zero-value order is a data problem, not an invoice. Raising one would post
                // a zero receivable and confuse the ledger's ageing report.
                throw new RuntimeException("Order {$order->number} has nothing to invoice.");
            }

            $contact = $this->contactFor($order);
            $invoice = $this->invoice($order, $contact, $actor, $alreadyPaid);

            $this->items($order, $invoice);

            // Freeze before posting: the ledger entry must reference a document that can be
            // produced byte-for-byte later. Posting first would leave a receivable with no
            // retrievable evidence if the PDF failed.
            $invoice = $this->freezer->freeze($invoice);

            $this->postToLedger->handle($invoice, $actor);

            return $invoice->refresh();
        });
    }

    /**
     * The customer, as the rest of the business knows them.
     *
     * Matched on the normalised phone number, which is the one identifier a Pakistani retail
     * customer reliably gives and remembers. A second order from the same number reuses the
     * contact, so their ledger, quotes and projects sit in one CRM record instead of three.
     *
     * The contact is **not** upgraded to `is_client` here. That belongs to whoever decides a
     * relationship started, and a first cash-on-delivery order is not proof of one.
     */
    private function contactFor(Order $order): Contact
    {
        $address = $order->addresses()->where('type', 'billing')->first()
            ?? $order->addresses()->first();

        if ($address === null) {
            throw new RuntimeException("Order {$order->number} has no address, so there is no one to invoice.");
        }

        // The OS stores E.164 in a 20-character column; the storefront accepts anything the
        // customer types. Normalising at the seam is what keeps the two from disagreeing.
        $phone = Phone::normalize($address->phone);

        if ($phone !== null) {
            $existing = Contact::query()->where('phone', $phone)->first();

            if ($existing !== null) {
                return $existing;
            }
        }

        return Contact::query()->create([
            'name' => $address->name,
            'phone' => $phone,
            'whatsapp' => $phone,
            'city' => $address->city,
            'address' => trim($address->line1.' '.($address->line2 ?? '')),
            'client_type' => 'individual',
            'preferred_language' => 'en',
        ]);
    }

    /**
     * The invoice header. Amounts are copied from the order, never recomputed.
     */
    private function invoice(Order $order, Contact $contact, ?User $actor, bool $alreadyPaid): Invoice
    {
        $total = (int) $order->grand_total_minor;
        $paid = $alreadyPaid ? $total : min((int) $order->paid_minor, $total);
        $issueDate = $order->placed_at ?? now();

        return Invoice::query()->create([
            'number' => $this->numbering->next('furniture.invoice'),
            // A storefront sale is not a "manual" invoice typed by staff — the OS already has a
            // kind for exactly this, and reports group by it.
            'kind' => InvoiceKind::FurnitureSale,
            // Issued, not draft: the customer has already been told the price at checkout, and
            // a draft cannot be frozen or posted.
            'status' => InvoiceStatus::Issued,
            'contact_id' => $contact->id,
            'company_id' => $contact->company_id,
            'commerce_order_id' => $order->id,
            'business_line' => BusinessLine::Furniture,
            'currency' => 'PKR',
            'subtotal_minor' => (int) $order->subtotal_minor,
            'discount_minor' => (int) $order->discount_minor,
            'tax_minor' => (int) $order->tax_minor,
            'shipping_minor' => (int) $order->shipping_minor,
            'total_minor' => $total,
            'paid_minor' => $paid,
            'balance_minor' => $total - $paid,
            'issue_date' => $issueDate->toDateString(),
            'due_date' => $issueDate->copy()->addDays(self::DUE_IN_DAYS)->toDateString(),
            'notes' => "Web order {$order->number}",
            'created_by' => $actor?->id,
        ]);
    }

    /**
     * One invoice line per basket line.
     *
     * The line total is the order's, not `qty × rate × (1 + tax)`. A discount split across
     * lines at checkout does not divide evenly, and recomputing here would make the invoice
     * disagree with the order by a few paisa — which is exactly the sort of difference that
     * costs a day of someone's life to explain.
     */
    private function items(Order $order, Invoice $invoice): void
    {
        foreach ($order->items()->orderBy('position')->get() as $position => $line) {
            InvoiceItem::query()->create([
                'invoice_id' => $invoice->id,
                'description' => $line->name,
                'unit' => 'pcs',
                'qty' => $line->qty,
                'rate_minor' => (int) $line->unit_price_minor,
                'discount_minor' => (int) $line->line_discount_minor,
                'tax_bp' => (int) $line->tax_rate_bp,
                'line_total_minor' => (int) $line->line_total_minor,
                'position' => $position,
            ]);
        }
    }

    /**
     * What the ledger says about an order, for the commerce screens to display.
     *
     * Read-only by design: the screens ask the ledger what the money situation is rather than
     * keeping their own opinion in `commerce_invoices`.
     *
     * @return array{number: string, status: string, total_minor: int, paid_minor: int, balance_minor: int}|null
     */
    public function summaryFor(Order $order): ?array
    {
        $invoice = Invoice::query()->where('commerce_order_id', $order->id)->first();

        if ($invoice === null) {
            return null;
        }

        return [
            'number' => (string) $invoice->number,
            'status' => $invoice->status->value,
            'total_minor' => (int) $invoice->total_minor,
            'paid_minor' => (int) $invoice->paid_minor,
            'balance_minor' => (int) $invoice->balance_minor,
        ];
    }
}
