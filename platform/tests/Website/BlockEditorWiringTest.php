<?php

declare(strict_types=1);

namespace Tests\Website;

use Tests\Support\Assert;

/**
 * Wiring for the block editor: route → component → view → registry, and the two ordering rules that
 * are invisible until they bite.
 *
 * Read as source text, like the other wiring tests. Each check below is a failure that would otherwise
 * only show up in a browser: a screen nobody can reach, an editor whose fields are hard-coded instead
 * of generated, a publish that marks a page live before it has written anything to serve, or a
 * `mkdir` race that surfaces as a 500 after the row was already saved.
 */
final class BlockEditorWiringTest
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

    public function testTheEditorHasAComponentAViewAndThePiecesTheViewUses(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/BlockEditor.php');
        $view = $this->source('/resources/views/livewire/admin/website/block-editor.blade.php');

        $this->source('/resources/views/livewire/admin/website/partials/field.blade.php');
        $this->source('/resources/views/components/admin/icon-button.blade.php');

        Assert::true(str_contains($component, 'final class BlockEditor'), 'the component exists');
        // The view name lives in the component's render(), not in the view: a Blade file cannot say
        // which name it is registered under, so checking it there would assert nothing.
        Assert::true(
            str_contains($component, "view('livewire.admin.website.block-editor')"),
            'the component renders the view that was shipped beside it',
        );
        Assert::true(str_contains($view, '$this->selectedFields()'), 'and that view is the editor screen');
    }

    /**
     * The editor must not know what a slide is. If a block's fields were written into the Blade file,
     * adding a block or a field would mean editing the editor — which is exactly what the registry was
     * built to prevent.
     */
    public function testTheRightPaneIsGeneratedFromTheRegistryNotHandWritten(): void
    {
        $view = $this->source('/resources/views/livewire/admin/website/block-editor.blade.php');

        Assert::true(str_contains($view, 'selectedFields()'), 'fields come from the registry');
        Assert::true(str_contains($view, "partials.field"), 'each field renders through the shared control');
        Assert::true(str_contains($view, "'list'"), 'list fields render a repeater');

        foreach (['heroSlider', 'marketWeServe', 'productGrid'] as $block) {
            Assert::true(
                ! str_contains($view, $block),
                "the editor must not special-case the '{$block}' block",
            );
        }
    }

    public function testTheRouteIsRegisteredByTheInstallerBesideThePagesList(): void
    {
        $apply = $this->source('/../tools/furniture-commerce/apply.sh');

        Assert::true(str_contains($apply, "name('website.pages.editor')"), 'the editor route is inserted');
        Assert::true(str_contains($apply, 'use App\\\\Livewire\\\\Admin\\\\Website\\\\BlockEditor;'), 'its import is inserted');
        // Exact name with its closing quote: `website.pages.edit` is a prefix of `website.pages.editor`,
        // and the v2 `pages/{page}` redirect already owns the shorter name in routes/admin.php.
        Assert::true(
            str_contains($apply, "->name('website.pages.edit')") === false,
            'the route name must not collide with the v2 `{page}` redirect that already owns it',
        );
    }

    public function testPuckPagesLinkToTheEditorAndFilePagesStillLinkToTheFileBuilder(): void
    {
        $index = $this->source('/resources/views/livewire/admin/website/pages-index.blade.php');

        Assert::true(str_contains($index, "route('admin.website.pages.editor'"), 'block pages open the editor');
        Assert::true(str_contains($index, "route('admin.website.builder'"), 'file pages keep the file builder');
    }

    /**
     * Publish order: content, then file, then status. Reversed, a failed write leaves a row that says
     * published next to a storefront with nothing to serve — and nobody finds out until a customer asks.
     */
    public function testPublishWritesTheFileBeforeItMarksThePagePublished(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/BlockEditor.php');

        $write = strpos($component, 'ShellPublisher::class');
        $status = strpos($component, '$page->status = SitePage::STATUS_PUBLISHED');

        Assert::true($write !== false, 'publish writes through the shell publisher');
        Assert::true($status !== false, 'publish flips the status');
        Assert::true(
            $write !== false && $status !== false && $write < $status,
            'the static file is written before the page is marked published',
        );

        Assert::true(str_contains($component, 'catch (\\Throwable $e)'), 'a failed write is reported, not fatal');
    }

    /**
     * `mkdir()` on a directory that a concurrent request just created emits a warning, Laravel turns
     * warnings into ErrorExceptions, and the exception escapes a `catch (RuntimeException)`. Publishing
     * then 500s *after* the row was saved. The suppression and the second `is_dir` are the fix.
     */
    public function testThePublisherToleratesADirectoryThatAppearedUnderIt(): void
    {
        $publisher = $this->source('/app/Domain/Website/Content/ShellPublisher.php');

        Assert::true(str_contains($publisher, '@mkdir(dirname($file)'), 'mkdir is silenced and re-checked');
    }
}
