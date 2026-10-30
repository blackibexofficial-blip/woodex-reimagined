<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A printed line of an invoice.
 *
 * Separate from the order line because an invoice can include things an order does not — a
 * delivery charge, a discount presented as its own row, later a partial invoice for one item
 * that shipped early. It carries a description rather than a SKU for exactly that reason.
 */
class InvoiceItem extends Model
{
    protected $table = 'commerce_invoice_items';

    protected $guarded = ['id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'qty' => 'integer',
            'amount_minor' => 'integer',
        ];
    }

    /** @return BelongsTo<Invoice, $this> */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
