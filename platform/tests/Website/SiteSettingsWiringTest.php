<?php

declare(strict_types=1);

namespace Tests\Website;

use Tests\Support\Assert;

/**
 * Wiring for the storefront settings screen.
 *
 * The rules worth pinning down are the two that were learned by breaking them:
 *
 *   * A link and an image are not the same kind of value. Links must be a path or a full URL, because
 *     "facebook.com" in an href resolves against the current page and 404s. Images may be relative —
 *     the seeded payment logos are "assets/images/misc/…" and the footer prefixes the slash itself.
 *     Requiring "/" on images rejected the data that ships, which made every save fail.
 *   * A failed save has to be visible. Validation covers all sections at once, so the field that
 *     blocked a save is often not on screen; the component opens the owning section and the view
 *     prints a banner. Without both, the button looks like it does nothing.
 */
final class SiteSettingsWiringTest
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

    public function testTheScreenHasAComponentAndAViewWiredToEachOther(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/SiteSettings.php');
        $view = $this->source('/resources/views/livewire/admin/website/site-settings.blade.php');

        Assert::true(str_contains($component, 'final class SiteSettings'), 'component exists');
        Assert::true(
            str_contains($component, "view('livewire.admin.website.site-settings'"),
            'the component renders the view shipped beside it',
        );
        Assert::true(str_contains($view, 'wire:click="save"'), 'the view can save');
    }

    /** Every value the shell reads must have a field, or it is still seeder-only. */
    public function testEveryShellSettingIsEditableHere(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/SiteSettings.php');
        $settings = $this->source('/app/Settings/SiteShellSettings.php');

        preg_match_all('/public\s+(?:bool|string|array)\s+\$([a-z_]+)/', $settings, $matches);

        Assert::true(count($matches[1]) >= 20, 'the settings class still declares the shell fields');

        foreach ($matches[1] as $property) {
            Assert::true(
                substr_count($component, "'".$property."'") >= 2,
                $property.' is read into the form and written back',
            );
        }
    }

    public function testImagesMayBeRelativeButLinksMayNot(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/SiteSettings.php');

        Assert::true(str_contains($component, 'private function imagePath(): Closure'), 'there is an image rule');
        Assert::true(str_contains($component, 'private function pathOrUrl(): Closure'), 'and a link rule');

        // The logo rows must use the image rule, and the footer links the link rule.
        Assert::true(
            str_contains($component, "\$key === 'payment_logos' ? \$this->imagePath() : \$this->pathOrUrl()"),
            'payment logos are validated as paths, everything else as links',
        );

        // The image rule must not require a leading slash: the seeded values do not have one.
        $imageRule = substr($component, (int) strpos($component, 'private function imagePath'));
        $imageRule = substr($imageRule, 0, (int) strpos($imageRule, 'private function schema'));

        Assert::true(
            ! str_contains($imageRule, "str_starts_with(\$value, '/')"),
            'a relative image path is accepted — the shipped logos are relative',
        );
    }

    public function testAFailedSaveOpensTheSectionThatBlockedIt(): void
    {
        $component = $this->source('/app/Livewire/Admin/Website/SiteSettings.php');
        $view = $this->source('/resources/views/livewire/admin/website/site-settings.blade.php');

        Assert::true(str_contains($component, 'catch (ValidationException $e)'), 'the save catches validation');
        Assert::true(str_contains($component, '$this->section = $this->sectionOwning('), 'and switches section');
        Assert::true(str_contains($component, 'private function sectionOwning('), 'the lookup exists');
        Assert::true(str_contains($view, 'Nothing was saved'), 'the view says so in words');
    }

    public function testTheRouteIsInstalledUnderItsOwnNameAndGuard(): void
    {
        $apply = $this->source('/../tools/furniture-commerce/apply.sh');

        // `admin.website.settings` already belongs to the analytics screen. Two routes on one URL
        // means one of them silently never runs, so this screen lives at /website/shell.
        Assert::true(str_contains($apply, "name('website.shell')"), 'registered as website.shell');
        Assert::true(! str_contains($apply, "name('website.settings')"), 'and does not fight the existing screen');
        Assert::true(
            str_contains($apply, '! grep -qF "website.shell"'),
            'guarded on its own route, so an existing install still receives it',
        );
    }

    public function testTextFieldsBindOnBlurSoTheCaretDoesNotJump(): void
    {
        $view = $this->source('/resources/views/livewire/admin/website/site-settings.blade.php');

        Assert::true(str_contains($view, 'wire:model.blur="form.'), 'fields bind on blur');

        // The one legitimate live binding is the checkbox: it has no caret to lose, and a toggle that
        // waits for blur feels broken. Everything typed must bind on blur.
        //
        // The bindings are templated (`form.{{ $key }}`), so the field name cannot be matched — the
        // check is positional: every line carrying a live binding must also be the checkbox line.
        $liveLines = array_values(array_filter(
            explode("\n", $view),
            static fn (string $line): bool => str_contains($line, 'wire:model.live'),
        ));

        Assert::true(count($liveLines) === 1, 'exactly one live binding in the view');
        Assert::true(
            str_contains($liveLines[0] ?? '', 'type="checkbox"'),
            'and it is the checkbox — a live text binding moves the caret to the end of the value',
        );
    }
}
