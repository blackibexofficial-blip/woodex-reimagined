<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The document the customer keeps.
 *
 * Its total is written from the same CartTotals as the order, at the same moment, so the two
 * cannot disagree. `pdf_path` is filled by the OS's existing PDF pipeline; until then the
 * invoice renders as HTML from these rows.
 */
class Invoice extends Model
{
    public const string ISSUED = 'issued';

    public const string PAID = 'paid';

    public const string VOID = 'void';

    protected $table = 'commerce_invoices';

    protected $guarded = ['id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'total_minor' => 'integer',
            'issued_at' => 'datetime',
            'due_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return HasMany<InvoiceItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class);
    }
}
