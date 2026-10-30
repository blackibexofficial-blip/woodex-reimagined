<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Commerce catalog, part 1 of 3 (T3): what a product *is*.
 *
 * Money is always an integer in minor units (paisa) and the column always ends `_minor` —
 * a float here would be a rounding bug on every invoice for the next ten years.
 * Translatable text lives in its own table so a second locale never means a second column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('commerce_categories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('commerce_categories')->nullOnDelete();
            $table->string('slug', 120)->unique();
            $table->string('code', 60)->nullable()->unique();   // seed key: office-tables, chairs…
            $table->string('path', 255)->nullable()->index();    // materialised ancestry: /1/4/9
            $table->string('image_path')->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('show_in_menu')->default(true);
            $table->timestamps();

            $table->index(['parent_id', 'position']);
        });

        Schema::create('commerce_category_translations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('category_id')->constrained('commerce_categories')->cascadeOnDelete();
            $table->string('locale', 8)->default('en');
            $table->string('name', 160);
            $table->string('tagline', 200)->nullable();
            $table->text('description')->nullable();
            $table->string('meta_title', 70)->nullable();
            $table->string('meta_description', 170)->nullable();
            $table->timestamps();

            $table->unique(['category_id', 'locale']);
        });

        Schema::create('commerce_products', function (Blueprint $table): void {
            $table->id();
            $table->string('sku', 64)->unique();
            $table->string('type', 20)->default('simple');       // simple | configurable | bundle | virtual
            $table->string('status', 20)->default('draft');      // draft | published | archived
            $table->string('slug', 160)->unique();
            $table->foreignId('primary_category_id')->nullable()
                ->constrained('commerce_categories')->nullOnDelete();
            $table->string('series', 80)->nullable();            // EK, INFINITY, LINK… from the live catalog
            $table->string('brand', 80)->nullable();
            $table->string('material', 120)->nullable();         // denormalised for the compact list view
            $table->string('frame', 120)->nullable();
            $table->string('dimensions', 160)->nullable();
            // A simple product keeps its price here; a configurable one leaves these null and
            // prices each variant instead. Never both, never a float.
            $table->bigInteger('price_minor')->nullable();
            $table->bigInteger('compare_at_minor')->nullable();
            $table->bigInteger('cost_minor')->nullable();
            $table->unsignedSmallInteger('warranty_months')->default(12);
            $table->unsignedSmallInteger('lead_time_days')->default(7);
            $table->boolean('is_featured')->default(false);
            $table->boolean('is_customisable')->default(false);
            $table->boolean('taxable')->default(true);
            $table->unsignedSmallInteger('rating_x10')->default(0);   // 4.7 → 47, integer like everything else
            $table->unsignedInteger('review_count')->default(0);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'is_featured']);
            $table->index(['primary_category_id', 'status']);
            $table->index('series');
        });

        Schema::create('commerce_product_translations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained('commerce_products')->cascadeOnDelete();
            $table->string('locale', 8)->default('en');
            $table->string('name', 200);
            $table->string('summary', 300)->nullable();
            $table->longText('description')->nullable();
            $table->json('features')->nullable();                // ["3 lockable drawers", …]
            $table->json('specifications')->nullable();          // [{"label":"Material","value":"38mm MDF"}, …]
            $table->string('meta_title', 70)->nullable();
            $table->string('meta_description', 170)->nullable();
            $table->timestamps();

            $table->unique(['product_id', 'locale']);
            $table->index('name');
        });

        Schema::create('commerce_product_categories', function (Blueprint $table): void {
            $table->foreignId('product_id')->constrained('commerce_products')->cascadeOnDelete();
            $table->foreignId('category_id')->constrained('commerce_categories')->cascadeOnDelete();
            $table->unsignedSmallInteger('position')->default(0);

            $table->primary(['product_id', 'category_id']);
            $table->index('category_id');
        });

        Schema::create('commerce_product_media', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained('commerce_products')->cascadeOnDelete();
            // Plain column, not foreignId(): the FK is declared in the variant migration, once
            // the referenced table exists in creation order.
            $table->unsignedBigInteger('variant_id')->nullable();
            $table->string('disk', 20)->default('local');
            $table->string('path');
            $table->string('alt', 200)->nullable();
            $table->string('kind', 20)->default('image');        // image | video | document
            $table->unsignedSmallInteger('width')->nullable();
            $table->unsignedSmallInteger('height')->nullable();
            $table->boolean('is_primary')->default(false);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->index(['product_id', 'position']);
            $table->index(['product_id', 'is_primary']);
            $table->index('variant_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commerce_product_media');
        Schema::dropIfExists('commerce_product_categories');
        Schema::dropIfExists('commerce_product_translations');
        Schema::dropIfExists('commerce_products');
        Schema::dropIfExists('commerce_category_translations');
        Schema::dropIfExists('commerce_categories');
    }
};
