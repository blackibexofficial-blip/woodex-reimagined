<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets `pages` hold either kind of page (T8, docs/07-woodex-os/PUCK-BUILDER.md §3).
 *
 * The existing 142 pages are files on disk and keep `builder = 'file'` — nothing about them
 * changes, and no page stops working on the day this migration runs. A page converted to Puck
 * gains `puck_data` and flips to `builder = 'puck'`; both are served by the same URL, which is
 * what makes the migration of 142 pages a series of small reversible steps rather than a flag
 * day.
 *
 * `preview_token` lets an editor look at a draft on a real URL while logged out. `source_file`
 * keeps the path of the HTML file a page came from, so converting one is undoable until the
 * file is deleted.
 *
 * One documented column is deliberately missing: `draft_of`. `pages.slug` is unique, so a draft
 * row could not share the published page's slug, and `page_versions` already stores every
 * published snapshot — editing in place with `status` + `published_at` covers the same ground
 * without a second row that duplicates the site's URLs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pages', function (Blueprint $table): void {
            $table->string('builder', 16)->default('file')->after('template');
            $table->json('puck_data')->nullable()->after('builder');
            $table->unsignedInteger('puck_version')->default(1)->after('puck_data');
            $table->string('preview_token', 64)->nullable()->unique()->after('puck_version');
            $table->string('source_file', 255)->nullable()->after('preview_token');

            // The public query is "published puck pages by slug". `slug` is already unique;
            // this index covers the other two columns so no page scans the table.
            $table->index(['builder', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('pages', function (Blueprint $table): void {
            $table->dropIndex(['builder', 'status']);
            $table->dropUnique(['preview_token']);
            $table->dropColumn(['builder', 'puck_data', 'puck_version', 'preview_token', 'source_file']);
        });
    }
};
