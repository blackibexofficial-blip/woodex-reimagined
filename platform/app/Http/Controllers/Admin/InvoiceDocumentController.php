<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Domain\Commerce\Billing\InvoiceBalance;
use App\Domain\Commerce\Checkout\Models\Invoice;
use App\Domain\Commerce\Support\Money;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;

/**
 * The printable invoice.
 *
 * A separate document, not a modal. An invoice is handed to an accountant, emailed to a
 * customer and filed in a folder; all three need one page that prints correctly and carries no
 * navigation, no sidebar and no buttons. `window.print()` on the admin page produces a picture
 * of a dashboard.
 *
 * The money on it is derived the same way the screen derives it — through InvoiceBalance — so
 * the paper and the screen cannot tell a customer two different stories about what they owe.
 *
 * Access follows the same permission as the list. There is no public link: an invoice carries a
 * customer's name, phone and address, and a guessable public URL for that is a data leak with
 * extra steps.
 */
final class InvoiceDocumentController
{
    public function __invoke(Request $request, Invoice $invoice): View
    {
        abort_unless(
            $request->user()?->can('commerce.orders.view') ?? false,
            403,
        );

        $invoice->load(['items', 'order.items', 'order.addresses', 'order.payments']);

        $order = $invoice->order;

        $balance = new InvoiceBalance(
            totalMinor: (int) $invoice->total_minor,
            paidMinor: (int) $order->paid_minor,
            refundedMinor: (int) $order->refunded_minor,
            isVoid: $invoice->status === Invoice::VOID,
            daysUntilDue: $invoice->due_at === null
                ? null
                : (int) now()->startOfDay()->diffInDays($invoice->due_at->startOfDay(), false),
        );

        $shipping = $order->addresses->firstWhere('type', 'shipping');

        return view('admin.commerce.invoice-document', [
            'invoice' => $invoice,
            'order' => $order,
            'balance' => $balance,
            'shipping' => $shipping,
            'lines' => $invoice->items->isNotEmpty() ? $invoice->items : $order->items,
            'onInvoiceItems' => $invoice->items->isNotEmpty(),
            'money' => static fn (int $minor): string => Money::ofMinor($minor, (string) $order->currency)->format(),
        ]);
    }
}
