<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Give a category the fields the live storefront actually merchandises with.
 *
 * The catalog schema shipped with eleven columns, enough to build a menu. The
 * legacy IBPanel category screen holds twenty-eight, and the ones that matter
 * are not decoration: each of them drives a visible module on woodexfurniture.pk.
 *
 *   show_in_home_carousel  → the ten-tile category carousel on the home page
 *   show_in_hot_products   → the "Hot Products" strip
 *   show_in_featured / _best_sellers / _discounted → the other three strips,
 *                            each with its own ordering, so a category can be
 *                            prominent in one list and absent from another
 *   hero_*                 → the full-width category banner: layout variant,
 *                            series tag and subtitle, up to four bullet points
 *                            and two call-to-action buttons
 *
 * They live on the category rather than in a settings blob because they are
 * queried: "give me the carousel categories in order" must be one indexed
 * SELECT, not a scan of a JSON column.
 *
 * Everything here is additive and nullable, so it is safe on a populated table
 * and safe to roll back. `legacy_id` ties an imported row to its IBPanel id —
 * without it a re-import cannot tell a migrated row from one the owner created,
 * and a rollback cannot know what to remove.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('commerce_categories', function (Blueprint $table): void {
            // --- placement in the storefront's merchandising strips -----------
            $table->boolean('show_in_home_carousel')->default(false)->after('show_in_menu');
            $table->boolean('show_in_hot_products')->default(false)->after('show_in_home_carousel');
            $table->boolean('show_in_featured_products')->default(false)->after('show_in_hot_products');
            $table->boolean('show_in_best_sellers')->default(false)->after('show_in_featured_products');
            $table->boolean('show_in_discounted_products')->default(false)->after('show_in_best_sellers');
            $table->unsignedSmallInteger('hot_products_position')->default(0)->after('show_in_discounted_products');

            // --- the category banner -----------------------------------------
            $table->string('hero_layout', 40)->nullable()->after('hot_products_position');
            $table->string('hero_tag', 80)->nullable()->after('hero_layout');
            $table->string('hero_subtitle', 200)->nullable()->after('hero_tag');
            $table->text('hero_description')->nullable()->after('hero_subtitle');
            // A short bulleted list, stored as JSON because it is rendered as a list
            // and never filtered on.
            $table->json('hero_bullets')->nullable()->after('hero_description');
            $table->string('hero_primary_label', 60)->nullable()->after('hero_bullets');
            $table->string('hero_primary_url', 255)->nullable()->after('hero_primary_label');
            $table->string('hero_secondary_label', 60)->nullable()->after('hero_primary_url');
            $table->string('hero_secondary_url', 255)->nullable()->after('hero_secondary_label');

            // A second image: the legacy screen separates the banner backdrop from
            // the tile thumbnail, and both are used.
            $table->string('hero_image_path')->nullable()->after('hero_secondary_url');

            // Depth is stored rather than derived: a recursive path query on every
            // render is exactly the kind of thing that starts fast and ends slow.
            $table->unsignedTinyInteger('depth')->default(0)->after('parent_id');

            // --- migration traceability --------------------------------------
            $table->unsignedInteger('legacy_id')->nullable()->unique()->after('id');
            $table->timestamp('imported_at')->nullable()->after('legacy_id');

            $table->index(['show_in_home_carousel', 'is_active', 'position'], 'commerce_categories_carousel_idx');
            $table->index(['show_in_hot_products', 'hot_products_position'], 'commerce_categories_hot_idx');
        });

        // Products need the same anchor, so a re-import updates rather than duplicates.
        Schema::table('commerce_products', function (Blueprint $table): void {
            $table->unsignedInteger('legacy_id')->nullable()->unique()->after('id');
            $table->timestamp('imported_at')->nullable()->after('legacy_id');
        });
    }

    public function down(): void
    {
        Schema::table('commerce_products', function (Blueprint $table): void {
            $table->dropUnique(['legacy_id']);
            $table->dropColumn(['legacy_id', 'imported_at']);
        });

        Schema::table('commerce_categories', function (Blueprint $table): void {
            $table->dropIndex('commerce_categories_carousel_idx');
            $table->dropIndex('commerce_categories_hot_idx');
            $table->dropUnique(['legacy_id']);
            $table->dropColumn([
                'legacy_id', 'imported_at', 'depth',
                'show_in_home_carousel', 'show_in_hot_products', 'show_in_featured_products',
                'show_in_best_sellers', 'show_in_discounted_products', 'hot_products_position',
                'hero_layout', 'hero_tag', 'hero_subtitle', 'hero_description', 'hero_bullets',
                'hero_primary_label', 'hero_primary_url', 'hero_secondary_label', 'hero_secondary_url',
                'hero_image_path',
            ]);
        });
    }
};
