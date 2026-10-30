<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per number series: `order`, `invoice`, `rma`.
 *
 * The counter lives in the database rather than in PHP because "the next order number" is a
 * shared fact between every checkout that is running right now. Reading it, incrementing it
 * and saving it happen under `lockForUpdate()` inside the checkout transaction — the lock is
 * the whole point of the table, and it is why this is not a max(id) + 1 query.
 */
class Sequence extends Model
{
    protected $table = 'commerce_sequences';

    protected $guarded = ['id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'next' => 'integer',
            'padding' => 'integer',
        ];
    }
}
