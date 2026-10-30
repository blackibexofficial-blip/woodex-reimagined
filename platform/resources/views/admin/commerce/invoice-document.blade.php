{{--
    The printable invoice.

    Deliberately not inside the admin layout: this page is printed, saved as PDF, emailed to a
    customer and filed. It carries the business header, the customer, the lines, the money and
    nothing else — no sidebar, no breadcrumb, no buttons except the one that starts printing.

    Every figure is derived by InvoiceBalance rather than read from `invoice.status`, so the
    paper cannot tell a customer something the screen contradicts.
--}}
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $invoice->number }} · WOODEX</title>
    <style>
        :root {
            --ink: #111827; --muted: #6b7280; --line: #e5e7eb; --wood: #b08968; --navy: #0e1b2a;
            --danger: #b91c1c; --warn: #b45309; --success: #0f766e;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0; padding: 32px 24px; background: #f3f4f6; color: var(--ink);
            font: 13px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        .sheet {
            max-width: 820px; margin: 0 auto; background: #fff; padding: 40px 44px;
            box-shadow: 0 1px 3px rgba(0,0,0,.08); border-radius: 4px;
        }
        header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
        .brand { display: flex; align-items: center; gap: 10px; }
        .mark {
            width: 38px; height: 38px; border-radius: 8px; background: var(--navy); color: #fff;
            display: grid; place-items: center; font-weight: 800; font-size: 17px;
        }
        .brand h1 { margin: 0; font-size: 17px; letter-spacing: .01em; }
        .brand p { margin: 0; font-size: 11px; color: var(--muted); }
        .doc { text-align: right; }
        .doc h2 { margin: 0 0 2px; font-size: 13px; text-transform: uppercase; letter-spacing: .14em; color: var(--muted); }
        .doc .number { font: 600 18px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
        .doc .meta { font-size: 12px; color: var(--muted); margin-top: 6px; }

        .stamp {
            display: inline-block; margin-top: 10px; padding: 3px 10px; border-radius: 999px;
            font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
        }
        .stamp-paid { background: #d1fae5; color: var(--success); }
        .stamp-part { background: #fef3c7; color: var(--warn); }
        .stamp-overdue { background: #fee2e2; color: var(--danger); }
        .stamp-issued { background: #dbeafe; color: #1d4ed8; }
        .stamp-void { background: #eef0f3; color: #475569; }

        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin: 32px 0 26px; }
        .parties h3 {
            margin: 0 0 6px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
            color: var(--muted); font-weight: 700;
        }
        .parties p { margin: 0; }
        .parties .muted { color: var(--muted); }

        table { width: 100%; border-collapse: collapse; }
        thead th {
            text-align: left; font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
            color: var(--muted); border-bottom: 1px solid var(--line); padding: 0 0 8px;
        }
        thead th.right, tbody td.right { text-align: right; }
        tbody td { padding: 10px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
        .muted { color: var(--muted); }

        .totals { margin-top: 18px; margin-left: auto; width: 320px; }
        .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
        .totals .grand {
            border-top: 1px solid var(--line); margin-top: 6px; padding-top: 10px;
            font-size: 15px; font-weight: 700;
        }
        .totals .owed { color: var(--warn); font-weight: 600; }

        footer { margin-top: 36px; border-top: 1px solid var(--line); padding-top: 14px;
            font-size: 11px; color: var(--muted); display: flex; justify-content: space-between; gap: 20px; }

        .actions { max-width: 820px; margin: 16px auto 0; display: flex; gap: 10px; }
        .actions a, .actions button {
            font: inherit; font-size: 13px; padding: 8px 16px; border-radius: 6px; cursor: pointer;
            border: 1px solid var(--line); background: #fff; color: var(--ink); text-decoration: none;
        }
        .actions button { background: var(--navy); color: #fff; border-color: var(--navy); }

        @media print {
            body { background: #fff; padding: 0; }
            .sheet { box-shadow: none; padding: 0; max-width: none; border-radius: 0; }
            .actions { display: none; }
            @page { margin: 18mm 16mm; }
        }
    </style>
</head>
<body>
<div class="sheet">
    <header>
        <div class="brand">
            <div class="mark">W</div>
            <div>
                <h1>WOODEX</h1>
                <p>Furniture for offices and homes · Lahore, Pakistan</p>
            </div>
        </div>

        <div class="doc">
            <h2>Invoice</h2>
            <div class="number">{{ $invoice->number }}</div>
            <div class="meta">
                Issued {{ $invoice->issued_at?->format('j F Y') ?? '—' }}<br>
                Order {{ $order->number }}
                @if ($invoice->due_at !== null)
                    <br>Due {{ $invoice->due_at->format('j F Y') }}
                @endif
            </div>

            @php
                $stampClass = match (true) {
                    $balance->isVoid => 'stamp-void',
                    $balance->isOverdue() => 'stamp-overdue',
                    $balance->status() === 'paid' => 'stamp-paid',
                    $balance->status() === 'part_paid' => 'stamp-part',
                    default => 'stamp-issued',
                };
            @endphp
            <div class="stamp {{ $stampClass }}">{{ $balance->label() }}</div>
        </div>
    </header>

    <div class="parties">
        <div>
            <h3>Billed to</h3>
            @if ($shipping !== null)
                <p><strong>{{ $shipping->name }}</strong></p>
                <p class="muted">{{ $shipping->line1 }}</p>
                @if ($shipping->line2)
                    <p class="muted">{{ $shipping->line2 }}</p>
                @endif
                <p class="muted">{{ $shipping->city }}@if ($shipping->province), {{ $shipping->province }}@endif</p>
                <p class="muted">{{ $shipping->phone }}</p>
            @else
                <p class="muted">No delivery address on this order.</p>
            @endif
        </div>
        <div>
            <h3>Payment</h3>
            <p>{{ $order->paymentGateway() === 'cod' ? 'Cash on delivery' : 'Bank transfer' }}</p>
            <p class="muted">Placed {{ $order->placed_at?->format('j F Y') ?? '—' }}</p>
            <p class="muted">
                {{ $order->items->count() }} {{ $order->items->count() === 1 ? 'line' : 'lines' }}
            </p>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Description</th>
                <th class="right" style="width:70px">Qty</th>
                <th class="right" style="width:130px">Amount</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($lines as $line)
                <tr>
                    <td>
                        {{ $onInvoiceItems ? $line->description : $line->name }}
                        @unless ($onInvoiceItems)
                            <div class="muted mono">{{ $line->sku }}</div>
                        @endunless
                    </td>
                    <td class="right">{{ $line->qty }}</td>
                    <td class="right mono">
                        {{ $money((int) ($onInvoiceItems ? $line->amount_minor : $line->line_total_minor)) }}
                    </td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="totals">
        <div><span class="muted">Subtotal</span><span class="mono">{{ $money((int) $order->subtotal_minor) }}</span></div>
        @if ((int) $order->discount_minor > 0)
            <div><span class="muted">Discount</span><span class="mono">−{{ $money((int) $order->discount_minor) }}</span></div>
        @endif
        <div><span class="muted">Sales tax</span><span class="mono">{{ $money((int) $order->tax_minor) }}</span></div>
        <div>
            <span class="muted">Delivery</span>
            <span class="mono">{{ (int) $order->shipping_minor === 0 ? 'Free' : $money((int) $order->shipping_minor) }}</span>
        </div>
        <div class="grand"><span>Total</span><span class="mono">{{ $money((int) $invoice->total_minor) }}</span></div>

        @if ($balance->netPaidMinor() > 0)
            <div><span class="muted">Received</span><span class="mono">−{{ $money($balance->netPaidMinor()) }}</span></div>
        @endif
        @if ($balance->outstandingMinor() > 0)
            <div class="owed"><span>Balance due</span><span class="mono">{{ $money($balance->outstandingMinor()) }}</span></div>
        @endif
    </div>

    <footer>
        <div>
            WOODEX · Lahore, Pakistan<br>
            This document was generated from order {{ $order->number }}.
        </div>
        <div style="text-align:right">
            {{ $invoice->number }} · {{ $balance->label() }}<br>
            Printed {{ now()->format('j F Y') }}
        </div>
    </footer>
</div>

<div class="actions">
    <button type="button" onclick="window.print()">Print this invoice</button>
    <a href="{{ route('admin.commerce.invoices') }}">Back to invoices</a>
</div>
</body>
</html>
