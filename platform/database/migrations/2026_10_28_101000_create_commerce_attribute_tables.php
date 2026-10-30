<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Commerce catalog, part 2 of 3 (T3): attributes.
 *
 * An attribute is data, never a column: adding "colour family" to the catalog must be an
 * admin action, not a migration. Options carry the swatch used by the storefront's
 * Materials page — which is how the material library and the product filter stay one record.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('commerce_attributes', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 60)->unique();                // material, finish, colour_family, warranty
            $table->string('name', 120);
            $table->string('type', 20)->default('select');       // select | multiselect | text | number | boolean | swatch
            $table->string('swatch_type', 20)->nullable();       // colour | image | text
            $table->boolean('is_filterable')->default(false);    // appears in the storefront filter rail
            $table->boolean('is_variant')->default(false);       // may generate variants
            $table->boolean('is_required')->default(false);
            $table->boolean('is_comparable')->default(false);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->index(['is_filterable', 'position']);
        });

        Schema::create('commerce_attribute_options', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('attribute_id')->constrained('commerce_attributes')->cascadeOnDelete();
            $table->string('code', 80);                          // natural-oak
            $table->string('label', 120);                        // Natural Oak
            $table->string('hex', 9)->nullable();                // #C8A97E
            $table->string('swatch_path')->nullable();           // texture image for the materials page
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->unique(['attribute_id', 'code']);
            $table->index(['attribute_id', 'position']);
        });

        Schema::create('commerce_product_attribute_values', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained('commerce_products')->cascadeOnDelete();
            $table->foreignId('attribute_id')->constrained('commerce_attributes')->cascadeOnDelete();
            $table->foreignId('option_id')->nullable()->constrained('commerce_attribute_options')->cascadeOnDelete();
            $table->string('value_text')->nullable();            // when the attribute is free text
            $table->bigInteger('value_number')->nullable();      // when it is numeric (warranty months)
            $table->boolean('value_boolean')->nullable();
            $table->timestamps();

            $table->unique(['product_id', 'attribute_id', 'option_id'], 'commerce_pav_unique');
            $table->index(['attribute_id', 'option_id']);        // the filter query
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commerce_product_attribute_values');
        Schema::dropIfExists('commerce_attribute_options');
        Schema::dropIfExists('commerce_attributes');
    }
};
