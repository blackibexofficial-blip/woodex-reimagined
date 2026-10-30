<?php

declare(strict_types=1);

namespace Tests\Website;

use Tests\Support\Assert;

/**
 * Wiring for the website module: route → controller → renderer → view → studio.
 *
 * Read as source text, not booted, for the same reason as AdminWiringTest: these fail in
 * production only when someone opens the page, and they are the exact seams a rename breaks
 * silently — a route name used by a Blade file, a data attribute the editor reads but the
 * component no longer writes, a migration that adds a column the model never casts.
 */
final class PuckWiringTest
{
    private function root(): string
    {
        return dirname(__DIR__, 2);
    }

    private function source(string $relative): string
    {
        $path = $this->root().$relative;

        Assert::trueWith(is_file($path), static fn (): string => "missing file {$relative}", 'file exists');

        return is_file($path) ? (string) file_get_contents($path) : '';
    }

    public function testThePublicRouteAndTheSaveRouteAreBothRegistered(): void
    {
        $routes = $this->source('/routes/website.php');

        Assert::true(str_contains($routes, "Route::get('/p/{slug}'"), 'the public page route is registered');
        Assert::true(str_contains($routes, "Route::put('/pages/{page}/document'"), 'the save endpoint is a PUT');
        Assert::true(str_contains($routes, "'admin.website.'"), 'admin routes are namespaced under admin.website');
        Assert::true(str_contains($routes, "->where('slug', '.*')"), 'slugs may contain slashes');
    }

    public function testTheControllerRendersThroughTheComposerAndTheRenderer(): void
    {
        $controller = $this->source('/app/Http/Controllers/Website/PuckPageController.php');

        Assert::true(str_contains($controller, 'PuckDocument::fromStored'), 'the stored document is decoded, never trusted');
        Assert::true(str_contains($controller, '$this->composer->dataFor($document)'), 'bound data is resolved once per render');
        Assert::true(str_contains($controller, "'puck.page'"), 'the shell view is used');
        Assert::true(str_contains($controller, "where('builder', 'puck')"), 'only Puck pages are served here');
    }

    public function testTheSaveEndpointChecksBothPermissionsAndTheVersion(): void
    {
        $controller = $this->source('/app/Http/Controllers/Admin/PageDocumentController.php');

        Assert::true(str_contains($controller, "can('website.edit')"), 'saving needs website.edit');
        Assert::true(str_contains($controller, "can('website.publish')"), 'publishing needs website.publish');
        Assert::true(str_contains($controller, '409'), 'a stale version is a conflict, not an overwrite');
        Assert::true(str_contains($controller, '422'), 'an invalid document is refused with its reasons');
    }

    public function testTheEditorShellPassesEverythingTheStudioReads(): void
    {
        $blade = $this->source('/resources/views/livewire/admin/website/page-editor.blade.php');
        $studio = $this->source('/resources/js/studio/editor.tsx');

        // Every attribute the React entry point destructures must be written by the Blade file.
        foreach (['data-document', 'data-save-url', 'data-csrf', 'data-version', 'data-can-publish', 'data-preview-url'] as $attribute) {
            Assert::true(str_contains($blade, $attribute), "the shell writes {$attribute}");

            $key = lcfirst(str_replace(' ', '', ucwords(str_replace('-', ' ', substr($attribute, 5)))));
            Assert::true(
                str_contains($studio, $key),
                "the studio reads {$key}",
            );
        }
    }

    public function testTheMigrationAddsOnlyTheDocumentedColumns(): void
    {
        $migration = $this->source('/database/migrations/2026_10_28_103000_add_puck_columns_to_pages.php');

        foreach (['builder', 'puck_data', 'puck_version', 'preview_token', 'source_file'] as $column) {
            Assert::true(str_contains($migration, "'{$column}'"), "the migration adds {$column}");
        }

        Assert::true(str_contains($migration, "default('file')"), 'existing pages keep working as file-backed pages');
        Assert::true(str_contains($migration, 'dropColumn'), 'the migration can be reversed');
    }

    public function testTheStudioIsDrivenByTheSameRegistryFileAsTheServer(): void
    {
        Assert::true(str_contains($this->source('/resources/js/studio/registry.ts'), "from './registry.json'"), 'the studio imports the registry');
        Assert::true(str_contains($this->source('/app/Domain/Website/Puck/Registry.php'), 'registry.json'), 'the server reads the registry');
        Assert::true(str_contains($this->source('/resources/js/studio/config.tsx'), 'Object.entries(blocks)'), 'no block is hard-coded in the editor config');

        foreach (['BlockPreview.tsx', 'config.tsx', 'editor.tsx', 'registry.ts'] as $file) {
            $this->source('/resources/js/studio/'.$file);
        }
    }
}
