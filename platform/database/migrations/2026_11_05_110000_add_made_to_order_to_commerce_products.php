<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "In stock" is the wrong question for a furniture manufacturer.
 *
 * The legacy catalogue's `quantity` column looked like inventory and is not: of the
 * 137 importable products, 101 hold 0, the rest hold only 10, 20 — round placeholder
 * values — and one holds 1950, which is exactly its own price and therefore a typo.
 * Nobody keeps 1 950 workstations on a shelf, and nobody sells 101 of 137 catalogue
 * items as unavailable. The field was used as a "new" marker, never maintained as stock.
 *
 * Importing it as stock and rendering the result would print "Out of Stock" on three
 * quarters of a working catalogue. Inventing quantities would be worse: it would tell a
 * customer a made-to-order sofa ships tomorrow.
 *
 * So the schema gets the distinction the business actually has. A product is either
 * physically stocked (`is_made_to_order = false`, availability from inventory) or built
 * to order (`true`, always available, `lead_time_days` is the promise). This is not a
 * UI flag: it is the answer to "can this be sold today", and it is the column the
 * storefront, the cart and the quotation builder all read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('commerce_products', function (Blueprint $table): void {
            $table->boolean('is_made_to_order')->default(false)->after('is_customisable');
        });
    }

    public function down(): void
    {
        Schema::table('commerce_products', function (Blueprint $table): void {
            $table->dropColumn('is_made_to_order');
        });
    }
};
