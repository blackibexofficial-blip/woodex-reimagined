<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a sales invoice to the commerce order that raised it — and therefore joins the two money
 * systems into one.
 *
 * Before this, a furniture order and the ledger knew nothing about each other. The commerce
 * screens owned `commerce_invoices`; Accounts owned `invoices`; the same sale existed twice or
 * (worse) once, in whichever system the developer happened to touch. An accountant asking "what
 * did we sell in October" had two answers.
 *
 * After this, an order raises exactly one row in the OS ledger, and the row can be traced back.
 * The pointer lives on the ledger side because the ledger is the authority: a commerce order may
 * exist without an invoice (a failed payment), but an invoice always has a source.
 *
 * `unique()` is the guard that makes double-posting impossible rather than merely unlikely: a
 * second attempt at the same order fails at the database, not in a race between two requests.
 *
 * Guarded by `hasTable` so this file is inert in a checkout that carries the commerce package
 * without the OS — the tests run there.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('invoices') || Schema::hasColumn('invoices', 'commerce_order_id')) {
            return;
        }

        Schema::table('invoices', function (Blueprint $table): void {
            $table->foreignId('commerce_order_id')
                ->nullable()
                ->after('quote_id')
                ->constrained('commerce_orders')
                ->nullOnDelete();

            // One order, one invoice. Not "probably one" — the database says so.
            $table->unique('commerce_order_id');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('invoices') || ! Schema::hasColumn('invoices', 'commerce_order_id')) {
            return;
        }

        Schema::table('invoices', function (Blueprint $table): void {
            $table->dropUnique(['commerce_order_id']);
            $table->dropConstrainedForeignId('commerce_order_id');
        });
    }
};
