<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a commerce payment attempt to the OS receipt that settles it.
 *
 * The counters run in opposite directions between a shop and a studio, and this table is where
 * they meet. Commerce records an attempt at placement — a COD promise, a gateway reference — and
 * that row says "unpaid" for as long as the money is in a courier's pocket. Accounts records a
 * receipt when the money is real: numbered, PDF'd, allocated and posted.
 *
 * Both rows are necessary and neither can be derived from the other, so the link has to be
 * stored. It is unique for the same reason `invoices.commerce_order_id` is: one attempt settles
 * once. A second confirmation arrives as a bank reference, not as a second receipt.
 *
 * Inert where `payments` is absent, so this file travels with the commerce slice and does
 * nothing in an install that has no ledger to settle into.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payments') || Schema::hasColumn('payments', 'commerce_payment_id')) {
            return;
        }

        Schema::table('payments', function (Blueprint $table): void {
            $table->foreignId('commerce_payment_id')
                ->nullable()
                ->after('project_id')
                ->unique()
                ->constrained('commerce_payments')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('payments') || ! Schema::hasColumn('payments', 'commerce_payment_id')) {
            return;
        }

        Schema::table('payments', function (Blueprint $table): void {
            $table->dropForeign(['commerce_payment_id']);
            $table->dropUnique(['commerce_payment_id']);
            $table->dropColumn('commerce_payment_id');
        });
    }
};
