<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

use App\Domain\Commerce\Checkout\Models\Sequence;

/**
 * Hands out the next order number.
 *
 * It used to hand out invoice numbers too — `INV-000001`, from a counter of its own. That
 * counter is gone: an invoice now takes its number from the OS (`WFI-2026-0001`), which is
 * where the document, the PDF and the journal entry live. Two counters produced two
 * identities for one sale, and a customer quoting the wrong one could not be found.
 *
 * Must be called inside the checkout transaction: `lockForUpdate()` is what makes two
 * simultaneous checkouts produce 127 and 128 rather than two 127s. The lock is held for the
 * duration of the transaction, which is short — a few inserts — so it does not serialise the
 * storefront, only the numbering.
 */
final class SequenceAllocator
{
    public function next(string $key, string $prefix, int $padding = 6): OrderNumber
    {
        // First use of a series creates its row. `firstOrCreate` outside a lock would race; it
        // is called under the transaction's lock in the caller, and the unique index on `key`
        // turns a genuine race into a retry rather than a duplicate number.
        $sequence = Sequence::query()->lockForUpdate()->firstOrCreate(
            ['key' => $key],
            ['prefix' => $prefix, 'next' => 1, 'padding' => $padding],
        );

        $number = new OrderNumber(
            prefix: (string) ($sequence->prefix !== '' ? $sequence->prefix : $prefix),
            number: (int) $sequence->next,
            padding: (int) $sequence->padding,
        );

        $sequence->next = $sequence->next + 1;
        $sequence->save();

        return $number;
    }

    public function order(): OrderNumber
    {
        return $this->next('order', 'WDX');
    }

}
