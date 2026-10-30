<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Commerce catalog, part 3 of 3 (T3): variants and stock.
 *
 * A simple product has no rows here. A configurable product creates one row per sellable
 * combination, because price and stock live with the thing a customer actually buys — not
 * with the family page above it.
 *
 * Stock is per source (Lahore, Karachi, online) and never a single global number: the
 * showroom page promises "3 available now in Lahore", which is only true if it is measured
 * in Lahore.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('commerce_product_variants', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained('commerce_products')->cascadeOnDelete();
            $table->string('sku', 64)->unique();
            $table->string('barcode', 64)->nullable();
            $table->string('name', 160)->nullable();             // "BALLMER — Dark Walnut"
            $table->bigInteger('price_minor')->nullable();       // null = inherit the product price
            $table->bigInteger('compare_at_minor')->nullable();
            $table->bigInteger('cost_minor')->nullable();
            $table->unsignedInteger('weight_g')->default(0);
            $table->string('status', 20)->default('active');
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['product_id', 'status']);
        });

        Schema::create('commerce_variant_options', function (Blueprint $table): void {
            $table->foreignId('variant_id')->constrained('commerce_product_variants')->cascadeOnDelete();
            $table->foreignId('attribute_id')->constrained('commerce_attributes')->cascadeOnDelete();
            $table->foreignId('option_id')->constrained('commerce_attribute_options')->cascadeOnDelete();

            $table->primary(['variant_id', 'attribute_id']);
        });

        // Back-fill the FK that the catalog migration could not reference yet.
        Schema::table('commerce_product_media', function (Blueprint $table): void {
            $table->foreign('variant_id')
                ->references('id')->on('commerce_product_variants')
                ->nullOnDelete();
        });

        Schema::create('commerce_inventory_sources', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name', 120);
            $table->string('city', 80)->nullable();
            $table->string('address')->nullable();
            $table->string('phone', 32)->nullable();
            $table->unsignedSmallInteger('priority')->default(1);  // 1 = preferred for allocation
            $table->boolean('is_active')->default(true);
            $table->boolean('is_pickup')->default(false);
            $table->timestamps();
        });

        Schema::create('commerce_inventory_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('variant_id')->constrained('commerce_product_variants')->cascadeOnDelete();
            $table->foreignId('source_id')->constrained('commerce_inventory_sources')->cascadeOnDelete();
            $table->integer('qty')->default(0);                  // may be negative only with an explicit adjustment reason
            $table->unsignedInteger('reserved')->default(0);     // held by an unpaid cart, released on expiry
            $table->unsignedInteger('low_stock_threshold')->default(3);
            $table->timestamps();

            $table->unique(['variant_id', 'source_id']);
            $table->index(['source_id', 'qty']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commerce_inventory_items');
        Schema::dropIfExists('commerce_inventory_sources');
        Schema::table('commerce_product_media', function (Blueprint $table): void {
            $table->dropForeign(['variant_id']);
        });
        Schema::dropIfExists('commerce_variant_options');
        Schema::dropIfExists('commerce_product_variants');
    }
};
