<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cart, checkout, order and money (T11).
 *
 * Fourteen tables, in the order a customer touches them: a cart, its lines, its addresses; an
 * order copied from that cart at the moment it is placed; the invoice and the payment that
 * follow. The copy is the point — a cart is mutable and an order is not. Changing a price in
 * the catalog tomorrow must not change what someone was charged today, so every amount on an
 * order line is written from the calculated totals, not looked up later.
 *
 * Three rules hold across the whole file:
 *
 *  - **money is `bigInteger … _minor`.** No floats, no decimals, no `decimal(10,2)`. The
 *    arithmetic is the calculator's job; the database only stores paisa.
 *  - **stock is never a boolean.** `commerce_inventory_reservations` records which cart or
 *    order is holding which units, so a release is a row update rather than a guess.
 *  - **every status is a short string with a documented set of values**, not an enum: MySQL
 *    enums require a migration to add a value, and order statuses change.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Numbers are allocated, never guessed. One row per series, incremented under a row
        // lock, because two checkouts in the same second must not produce the same order number.
        Schema::create('commerce_sequences', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 40)->unique();          // order | invoice | rma
            $table->string('prefix', 8)->default('');     // WDX-, INV-
            $table->unsignedBigInteger('next')->default(1);
            $table->unsignedTinyInteger('padding')->default(6);
            $table->timestamps();
        });

        Schema::create('commerce_carts', function (Blueprint $table): void {
            $table->id();
            $table->string('token', 64)->unique();        // the guest's handle; a cookie holds this
            // Not a foreignId: the OS customer table is `people`, which this module must not
            // assume it owns. The constraint is added by the OS's own migration that links them.
            $table->unsignedBigInteger('customer_id')->nullable()->index();
            $table->string('currency', 3)->default('PKR');
            $table->string('status', 20)->default('active')->index(); // active | converted | abandoned
            $table->string('coupon_code', 40)->nullable();

            $table->bigInteger('subtotal_minor')->default(0);
            $table->bigInteger('discount_minor')->default(0);
            $table->bigInteger('tax_minor')->default(0);
            $table->bigInteger('shipping_minor')->default(0);
            $table->bigInteger('grand_total_minor')->default(0);

            $table->string('shipping_method_code', 40)->nullable();
            $table->timestamp('expires_at')->nullable()->index();  // reservations die with it
            $table->timestamps();
        });

        Schema::create('commerce_cart_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('cart_id')->constrained('commerce_carts')->cascadeOnDelete();
            $table->foreignId('variant_id')->nullable()->constrained('commerce_product_variants')->nullOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('commerce_products')->nullOnDelete();
            $table->string('sku', 64);
            $table->string('name', 190);                  // the name at the time it was added
            $table->unsignedInteger('qty');

            $table->bigInteger('unit_price_minor');
            $table->bigInteger('line_discount_minor')->default(0);
            $table->bigInteger('line_tax_minor')->default(0);
            $table->bigInteger('line_total_minor')->default(0);
            $table->unsignedSmallInteger('tax_rate_bp')->default(0);

            $table->json('meta')->nullable();             // finish, swatch, personalisation
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->index(['cart_id', 'position']);
        });

        Schema::create('commerce_cart_addresses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('cart_id')->constrained('commerce_carts')->cascadeOnDelete();
            $table->string('type', 10)->default('shipping');  // shipping | billing
            $table->string('name', 120);
            $table->string('phone', 32);
            $table->string('line1', 190);
            $table->string('line2', 190)->nullable();
            $table->string('city', 80);
            $table->string('province', 80)->nullable();
            $table->string('postcode', 16)->nullable();
            $table->string('country', 2)->default('PK');
            $table->timestamps();

            $table->unique(['cart_id', 'type']);
        });

        Schema::create('commerce_orders', function (Blueprint $table): void {
            $table->id();
            $table->string('number', 32)->unique();       // WDX-000001
            $table->foreignId('cart_id')->nullable()->constrained('commerce_carts')->nullOnDelete();
            $table->unsignedBigInteger('customer_id')->nullable()->index(); // see commerce_carts
            $table->string('currency', 3)->default('PKR');
            $table->string('source', 16)->default('web');  // web | admin | quote

            $table->string('status', 20)->default('placed')->index();
            $table->string('payment_status', 20)->default('pending')->index();
            $table->string('fulfilment_status', 20)->default('unfulfilled');

            // Copied from the cart at placement. Never recalculated from the catalog.
            $table->bigInteger('subtotal_minor')->default(0);
            $table->bigInteger('discount_minor')->default(0);
            $table->bigInteger('tax_minor')->default(0);
            $table->bigInteger('shipping_minor')->default(0);
            $table->bigInteger('grand_total_minor')->default(0);
            $table->bigInteger('paid_minor')->default(0);
            $table->bigInteger('refunded_minor')->default(0);

            $table->string('coupon_code', 40)->nullable();
            $table->json('applied_rules')->nullable();    // what the customer was promised
            $table->timestamp('placed_at')->nullable()->index();
            $table->timestamp('cancelled_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('commerce_order_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('commerce_orders')->cascadeOnDelete();
            $table->foreignId('variant_id')->nullable()->constrained('commerce_product_variants')->nullOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('commerce_products')->nullOnDelete();
            $table->string('sku', 64);
            $table->string('name', 190);
            $table->unsignedInteger('qty');

            $table->bigInteger('unit_price_minor');
            $table->bigInteger('line_discount_minor')->default(0);
            $table->bigInteger('line_tax_minor')->default(0);
            $table->bigInteger('line_total_minor');
            $table->unsignedSmallInteger('tax_rate_bp')->default(0);

            $table->json('meta')->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->index(['order_id', 'position']);
        });

        Schema::create('commerce_order_addresses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('commerce_orders')->cascadeOnDelete();
            $table->string('type', 10)->default('shipping');
            $table->string('name', 120);
            $table->string('phone', 32);
            $table->string('line1', 190);
            $table->string('line2', 190)->nullable();
            $table->string('city', 80);
            $table->string('province', 80)->nullable();
            $table->string('postcode', 16)->nullable();
            $table->string('country', 2)->default('PK');
            $table->timestamps();

            $table->unique(['order_id', 'type']);
        });

        // Who changed what, when. Written by the same transaction as the change it describes.
        Schema::create('commerce_order_status_history', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('commerce_orders')->cascadeOnDelete();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->string('note', 255)->nullable();
            $table->unsignedBigInteger('actor_id')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'created_at']);
        });

        Schema::create('commerce_invoices', function (Blueprint $table): void {
            $table->id();
            $table->string('number', 32)->unique();       // INV-000001
            $table->foreignId('order_id')->constrained('commerce_orders')->cascadeOnDelete();
            $table->string('status', 20)->default('issued')->index();  // issued | paid | void
            $table->timestamp('issued_at')->nullable();
            $table->timestamp('due_at')->nullable();
            $table->bigInteger('total_minor');
            $table->string('pdf_path')->nullable();
            $table->timestamps();
        });

        Schema::create('commerce_invoice_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('invoice_id')->constrained('commerce_invoices')->cascadeOnDelete();
            $table->foreignId('order_item_id')->nullable()->constrained('commerce_order_items')->nullOnDelete();
            $table->string('description', 190);
            $table->integer('qty')->default(1);
            $table->bigInteger('amount_minor');
            $table->timestamps();
        });

        Schema::create('commerce_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('commerce_orders')->cascadeOnDelete();
            $table->foreignId('invoice_id')->nullable()->constrained('commerce_invoices')->nullOnDelete();
            $table->string('gateway', 20);                // cod | bank | safepay | jazzcash | easypaisa
            $table->string('reference', 120)->nullable();
            $table->bigInteger('amount_minor');
            $table->string('status', 20)->default('pending')->index();  // pending | paid | failed | refunded
            $table->timestamp('paid_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'status']);
        });

        /*
         * Which cart or order is holding which units, at which source.
         *
         * This table is the reason overselling is a bug rather than a race: allocation locks
         * the inventory rows, subtracts, and writes a reservation naming the holder. Releasing
         * is an update to `released_at`, so the history of what was held and let go survives.
         */
        Schema::create('commerce_inventory_reservations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('cart_id')->nullable()->constrained('commerce_carts')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('commerce_orders')->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('commerce_product_variants')->cascadeOnDelete();
            $table->foreignId('source_id')->constrained('commerce_inventory_sources')->cascadeOnDelete();
            $table->unsignedInteger('qty');
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->string('release_reason', 40)->nullable();  // converted | expired | cancelled
            $table->timestamps();

            $table->index(['cart_id', 'released_at']);
            $table->index(['order_id', 'released_at']);
            $table->index(['variant_id', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commerce_inventory_reservations');
        Schema::dropIfExists('commerce_payments');
        Schema::dropIfExists('commerce_invoice_items');
        Schema::dropIfExists('commerce_invoices');
        Schema::dropIfExists('commerce_order_status_history');
        Schema::dropIfExists('commerce_order_addresses');
        Schema::dropIfExists('commerce_order_items');
        Schema::dropIfExists('commerce_orders');
        Schema::dropIfExists('commerce_cart_addresses');
        Schema::dropIfExists('commerce_cart_items');
        Schema::dropIfExists('commerce_carts');
        Schema::dropIfExists('commerce_sequences');
    }
};
