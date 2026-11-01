<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The reimagined site's content, in the database (docs/08 INTEGRATION-MASTER-PLAN, option A).
 *
 * Two tables, because the site has two shapes of content:
 *
 *  - `site_pages`   — one row per URL. The page is edited (Puck or the HTML builder) and published to a
 *                     static shell, which is what the web server answers. 16 rows today: home, shop, about…
 *  - `content_items` — many rows, one template. A service, a blog post, a project, a showroom, a series.
 *
 * `pages.archived_at` closes the old site: the 142 interior pages are exported and stamped, so nothing
 * lists them as live pages while their copy is still there to read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_pages', function (Blueprint $table): void {
            $table->id();
            // `key` is the stable name the code and the API use ('home', 'about'); `path` is the URL.
            $table->string('key')->unique();
            $table->string('path')->unique();
            $table->string('title');
            $table->string('kind')->default('route');   // route | puck | html
            $table->string('status')->default('draft'); // draft | published
            $table->json('puck_data')->nullable();
            $table->longText('canvas_html')->nullable();
            $table->json('seo')->nullable();
            $table->string('template')->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->timestamp('published_at')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();

            $table->index(['status', 'sort']);
        });

        Schema::create('content_items', function (Blueprint $table): void {
            $table->id();
            $table->string('type');   // service | post | project | showroom | series
            $table->string('slug');
            $table->string('path');
            $table->string('title');
            $table->string('excerpt', 500)->nullable();
            $table->json('sections')->nullable();
            $table->json('payload')->nullable();
            $table->json('seo')->nullable();
            $table->string('status')->default('draft'); // draft | published
            $table->unsignedBigInteger('featured_media_id')->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->unique(['type', 'slug']);
            $table->index(['type', 'status', 'sort']);
        });

        if (Schema::hasTable('pages') && ! Schema::hasColumn('pages', 'archived_at')) {
            Schema::table('pages', function (Blueprint $table): void {
                $table->timestamp('archived_at')->nullable()->after('published_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('pages') && Schema::hasColumn('pages', 'archived_at')) {
            // SQLite cannot drop a column that carries an index; this one carries none.
            Schema::table('pages', function (Blueprint $table): void {
                $table->dropColumn('archived_at');
            });
        }

        Schema::dropIfExists('content_items');
        Schema::dropIfExists('site_pages');
    }
};
