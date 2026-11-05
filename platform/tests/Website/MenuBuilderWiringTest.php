<?php

declare(strict_types=1);

namespace Tests\Website;

use Tests\Support\Assert;

/**
 * Wiring for the menu builder.
 *
 * The interesting checks here are the ones that describe rules rather than plumbing:
 *
 *   * Depth is capped at three. The shell renders a link, a column heading and the links inside it;
 *     a fourth level would be stored, saved, and never drawn — a link that exists in the admin and
 *     not on the site, which is the worst kind of missing.
 *   * Structure saves on click, text saves on the button. Both halves are asserted, because a screen
 *     that only does one of them looks correct until someone closes the tab.
 *   * Text fields bind on blur. Binding live re-renders the input on every debounce tick and throws
 *     the caret to the end of the value, which turned "Home Furniture" into
 *     "Home FurnitureHome & Living" in testing.
 */
final class MenuBuilderWiringTest
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

    public function testTheBuilderHasAComponentAndAViewThatAreWiredToEachOther(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/MenuBuilder.php');
        $view = $this->source('/resources/views/livewire/admin/website/menu-builder.blade.php');

        Assert::true(str_contains($component, 'final class MenuBuilder'), 'component exists');
        Assert::true(
            str_contains($component, "view('livewire.admin.website.menu-builder')"),
            'the component renders the view shipped beside it',
        );
        Assert::true(str_contains($view, 'wire:click="addItem('), 'the view can add links');
        Assert::true(str_contains($view, 'wire:click="save"'), 'the view can save text');
    }

    public function testTheMenusCoverTheHeaderAndEveryFooterColumnTheShellRenders(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/MenuBuilder.php');

        Assert::true(str_contains($component, 'NavigationItem::HEADER'), 'header is editable');
        Assert::true(str_contains($component, "'footer:shop'"), 'footer shop column is editable');
        Assert::true(str_contains($component, "'footer:quick_links'"), 'footer quick links are editable');
        Assert::true(str_contains($component, "'footer:learn_more'"), 'footer learn more is editable');
    }

    public function testDepthIsCappedAtWhatTheShellCanRender(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/MenuBuilder.php');

        Assert::true(str_contains($component, 'public const int MAX_DEPTH = 3'), 'three levels, matching the shell');

        // Both operations that change depth must refuse past the cap — adding a child, and indenting
        // an existing subtree under a new parent — and the button that does the second must be hidden
        // at the cap. Checked per method rather than by counting mentions, so a refactor that drops one
        // of the three sites fails here.
        $body = static function (string $source, string $method, string $next): string {
            $start = strpos($source, 'public function '.$method);

            Assert::true($start !== false, $method.' exists');

            return substr($source, (int) $start, (int) strpos($source, 'public function '.$next) - (int) $start);
        };

        Assert::true(
            str_contains($body($component, 'addItem', 'deleteItem'), 'self::MAX_DEPTH'),
            'adding a child is capped',
        );
        Assert::true(
            str_contains($body($component, 'indent', 'outdent'), 'self::MAX_DEPTH'),
            'indenting a subtree is capped',
        );
        Assert::true(
            str_contains($this->source('/resources/views/livewire/admin/website/menu-builder.blade.php'), 'MAX_DEPTH'),
            'the indent button is hidden at the cap',
        );
    }

    /** Structure on click, text on the button: the two halves of the save model. */
    public function testStructuralChangesWriteThroughImmediatelyAndTextDoesNot(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/MenuBuilder.php');

        $addItem = substr($component, (int) strpos($component, 'public function addItem'));
        $addBody = substr($addItem, 0, (int) strpos($addItem, 'public function deleteItem'));

        Assert::true(str_contains($addBody, '->create(['), 'adding writes a row straight away');

        $save = substr($component, (int) strpos($component, 'public function save'));
        $saveBody = substr($save, 0, (int) strpos($save, 'public function markDirty'));

        Assert::true(str_contains($saveBody, '$item->label = $label'), 'text is written only by save()');
        Assert::true(str_contains($saveBody, "'#'"), 'a link with no URL becomes # rather than an empty href');
    }

    public function testUntitledRowsAreDiscardedRatherThanPublishedAsInvisibleLinks(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/MenuBuilder.php');
        $save = substr($component, (int) strpos($component, 'public function save'));
        $saveBody = substr($save, 0, (int) strpos($save, 'public function markDirty'));

        Assert::true(str_contains($saveBody, "if (\$label === '')"), 'an empty label is handled');
        Assert::true(str_contains($saveBody, '$item->delete()'), 'the empty row is removed');
    }

    public function testTextFieldsBindOnBlurSoTheCaretDoesNotJump(): void
    {
        $view = $this->source('/resources/views/livewire/admin/website/menu-builder.blade.php');

        Assert::true(str_contains($view, 'wire:model.blur="items.'), 'label and link bind on blur');
        Assert::true(
            ! str_contains($view, 'wire:model.live.debounce.600ms="items.'),
            'no live binding on a text input in this screen — that is the caret bug',
        );
    }

    /**
     * Drag and drop is only safe with two refusals in place: a link cannot be dropped inside its own
     * descendant (the subtree detaches and disappears from every render), and the moved subtree must
     * still fit under the shell's three levels.
     */
    public function testDraggingIsServerSideAndRefusesTheTwoDestructiveMoves(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/MenuBuilder.php');

        Assert::true(str_contains($component, 'public function moveTo('), 'there is one entry point for a drop');

        $moveTo = substr($component, (int) strpos($component, 'public function moveTo('));
        $moveTo = substr($moveTo, 0, (int) strpos($moveTo, 'Persist the text fields'));

        Assert::true(str_contains($moveTo, "in_array(\$position, ['before', 'after', 'inside']"), 'three drop zones');
        Assert::true(str_contains($moveTo, '$this->descendantsOf($id)'), 'a parent cannot land in its own child');
        Assert::true(str_contains($moveTo, '$this->subtreeHeight($item)'), 'the subtree is measured, not just the row');
        Assert::true(str_contains($moveTo, '$this->normalise()'), 'the order is renumbered after every drop');
    }

    /** Dragging reloads from the database, so it must not be allowed to eat unsaved text. */
    public function testADropIsRefusedWhileTextIsUnsaved(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/MenuBuilder.php');
        $moveTo = substr($component, (int) strpos($component, 'public function moveTo('));

        Assert::true(
            str_contains(substr($moveTo, 0, 900), 'if ($this->dirty)'),
            'the dirty guard runs before anything is written',
        );
        Assert::true(str_contains($moveTo, 'Save your text changes before moving links'), 'and says why');
    }

    /** The markup has to be draggable, and the buttons must survive for keyboard and touch. */
    public function testRowsAreDraggableAndKeepTheirButtons(): void
    {
        $view = $this->source('/resources/views/livewire/admin/website/menu-builder.blade.php');

        Assert::true(str_contains($view, 'draggable="true"'), 'rows are draggable');
        Assert::true(str_contains($view, '$wire.moveTo(drag'), 'a drop calls the server');
        Assert::true(str_contains($view, "zone === 'inside'"), 'the middle of a row means nest');
        Assert::true(str_contains($view, 'wire:click="moveUp('), 'the arrow buttons are still there');
        Assert::true(str_contains($view, 'wire:click="indent('), 'including nesting by button');
    }

    public function testTheRouteIsInstalledAndThePagesScreenLinksToIt(): void
    {
        $apply = $this->source('/../tools/furniture-commerce/apply.sh');
        $index = $this->source('/resources/views/livewire/admin/website/pages-index.blade.php');

        Assert::true(str_contains($apply, "name('website.menus')"), 'the route is inserted by the installer');
        Assert::true(str_contains($apply, 'use App\\\\Livewire\\\\Admin\\\\Website\\\\MenuBuilder;'), 'its import is inserted');
        Assert::true(str_contains($index, "route('admin.website.menus')"), 'the Pages screen links to it');
    }
}
