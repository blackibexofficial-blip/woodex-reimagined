<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Removes the second set of books.
 *
 * `commerce_invoices` and `commerce_invoice_items` were the commerce package's own ledger: an
 * invoice raised at checkout with a number from its own counter (`INV-000001`), no journal
 * entry, no snapshot, and a PDF path nothing ever wrote. The OS already kept invoices with
 * numbers, snapshots, frozen PDFs and postings, so every sale existed twice — and only one of
 * the two was real.
 *
 * `OrderToLedger` closed that: a placed order now raises the OS invoice, copying every amount
 * from the order rather than recomputing it. The commerce tables hold nothing that mattered,
 * nothing writes them and nothing reads them, so they are dropped rather than left as tables a
 * future screen could quietly start filling again.
 *
 * `commerce_payments` stays. A gateway attempt is a commerce fact — a Safepay reference, a
 * payload, a status a callback will change — and it is not an accounting entry. Its `invoice_id`
 * pointed at the dropped table and goes with it; a payment is matched to the sale by `order_id`,
 * and the sale to its invoice by `invoices.commerce_order_id`.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The counter goes first: with the row gone, nothing can mint another INV- number even
        // if a stale code path asks for one.
        if (Schema::hasTable('commerce_sequences')) {
            DB::table('commerce_sequences')->where('key', 'invoice')->delete();
        }

        if (Schema::hasTable('commerce_payments') && Schema::hasColumn('commerce_payments', 'invoice_id')) {
            $this->dropPaymentInvoiceColumn();
        }

        Schema::dropIfExists('commerce_invoice_items');
        Schema::dropIfExists('commerce_invoices');
    }

    /**
     * SQLite and MySQL need different moves for the same change.
     *
     * MySQL can drop the constraint and then the column. SQLite cannot alter a foreign key in
     * place, and refuses to drop a column a foreign key still names, so the table is rebuilt:
     * create the shape without the column, copy every row, swap. That is the documented SQLite
     * procedure, and doing it here keeps the sandbox schema and the Hostinger schema identical —
     * a divergence would only surface as a production-only bug.
     */
    private function dropPaymentInvoiceColumn(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            Schema::table('commerce_payments', function (Blueprint $table): void {
                $table->dropForeign(['invoice_id']);
            });

            Schema::table('commerce_payments', function (Blueprint $table): void {
                $table->dropColumn('invoice_id');
            });

            return;
        }

        $columns = ['id', 'order_id', 'gateway', 'reference', 'amount_minor', 'status', 'paid_at', 'payload', 'created_at', 'updated_at'];

        // Left over from a half-finished run of this migration, if there was one. Dropped
        // before the create so a retry after a failure does not collide with itself.
        Schema::dropIfExists('commerce_payments_rebuilt');

        Schema::create('commerce_payments_rebuilt', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('commerce_orders')->cascadeOnDelete();
            $table->string('gateway', 20);
            $table->string('reference', 120)->nullable();
            $table->bigInteger('amount_minor');
            $table->string('status', 20)->default('pending')->index();
            $table->timestamp('paid_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'status']);
        });

        DB::statement(sprintf(
            'INSERT INTO commerce_payments_rebuilt (%1$s) SELECT %1$s FROM commerce_payments',
            implode(', ', $columns),
        ));

        Schema::drop('commerce_payments');
        Schema::rename('commerce_payments_rebuilt', 'commerce_payments');
    }

    /**
     * Rebuilt, not restored: the rows are gone and were never the record of anything. This
     * exists so a rollback leaves a schema the previous code boots against, which is all a
     * rollback can honestly promise once a table has been dropped.
     */
    public function down(): void
    {
        Schema::dropIfExists('commerce_payments_rebuilt');

        if (! Schema::hasTable('commerce_invoices')) {
            Schema::create('commerce_invoices', function (Blueprint $table): void {
                $table->id();
                $table->string('number', 32)->unique();
                $table->foreignId('order_id')->constrained('commerce_orders')->cascadeOnDelete();
                $table->string('status', 20)->default('issued')->index();
                $table->timestamp('issued_at')->nullable();
                $table->timestamp('due_at')->nullable();
                $table->bigInteger('total_minor');
                $table->string('pdf_path')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('commerce_invoice_items')) {
            Schema::create('commerce_invoice_items', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('invoice_id')->constrained('commerce_invoices')->cascadeOnDelete();
                $table->foreignId('order_item_id')->nullable()->constrained('commerce_order_items')->nullOnDelete();
                $table->string('description', 190);
                $table->integer('qty')->default(1);
                $table->bigInteger('amount_minor');
                $table->timestamps();
            });
        }

        if (Schema::hasTable('commerce_payments') && ! Schema::hasColumn('commerce_payments', 'invoice_id')) {
            Schema::table('commerce_payments', function (Blueprint $table): void {
                $table->foreignId('invoice_id')->nullable()->after('order_id')
                    ->constrained('commerce_invoices')->nullOnDelete();
            });
        }

        if (Schema::hasTable('commerce_sequences')) {
            DB::table('commerce_sequences')->updateOrInsert(
                ['key' => 'invoice'],
                ['prefix' => 'INV', 'next' => 1, 'padding' => 6, 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }
};
