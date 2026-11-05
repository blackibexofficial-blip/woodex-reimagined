<?php

declare(strict_types=1);

namespace Tests\Site;

use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The join between the Theme screen and the shop.
 *
 * Three vocabularies meet here and none of them is optional:
 *
 *   - the token rows, hex, because that is what `<input type="color">` produces;
 *   - `ThemeCss::DERIVED`, which prints `--color-navy-900: var(--navy)` and six siblings, so the shop's
 *     utilities inherit the theme instead of the values compiled into `site.css`;
 *   - the shadcn set the panel actually edits (`--primary`, `--muted`, …).
 *
 * They met badly. The tokens moved to the shadcn vocabulary and the seven v1 names `DERIVED` reads were
 * never re-seeded, so every bridge pointed at an undefined property and the shop silently kept the palette
 * baked into the build. Nothing looked broken, because nothing linked the theme stylesheet: it sat in the
 * `@else` branch of the head — the branch taken only when no built stylesheet exists.
 *
 * So these two things are tested together, because either one alone restores the illusion of a working
 * theme screen: the names must exist (this is what makes the colours move) and the stylesheet must be
 * linked on every page (this is what makes anyone see it).
 */
final class ThemeStorefrontWiringTest extends TestCase
{
    /**
     * Every name `ThemeCss::DERIVED` bridges from, with the value the shop ships.
     *
     * Called out one by one rather than counted, because a count would pass the day someone swaps `--wood`
     * for a token nothing reads — which is precisely the bug this file exists to catch.
     *
     * @return array<string, string>
     */
    private function bridged(): array
    {
        return [
            '--navy' => '#0F1E36',      // header, footer, dark CTAs
            '--navy-2' => '#1A2A45',    // --color-navy-800
            '--wood' => '#A87442',      // --color-wood-500
            '--surface' => '#FCF2E8',   // sand, beige, cream
            '--ink' => '#111111',       // headings
            '--paper' => '#FFFFFF',     // page
            '--line' => '#DEDEDB',      // rules and borders
        ];
    }

    /**
     * The seeder's tokens, read from its source.
     *
     * `ThemeTokensSeeder` extends Laravel's `Seeder`, so it cannot be instantiated without the framework and
     * this suite runs without one. Every other seeder test reads the file the same way. Each token is one
     * line of a fixed shape, so a line-at-a-time read is exact here rather than approximate.
     *
     * @return array<string, array{value: string, type: string}>
     */
    private function tokensByKey(): array
    {
        $source = (string) file_get_contents((string) self::sitePath('database/seeders/ThemeTokensSeeder.php'));

        $keyed = [];

        foreach (preg_split('/\R/', $source) ?: [] as $line) {
            if (! str_contains($line, "'key' =>")) {
                continue;
            }

            if (
                preg_match("/'key' => '([^']+)', 'value' => '([^']*)', 'label' => '[^']*', 'type' => '([^']+)'/", $line, $m) === 1
            ) {
                $keyed[$m[1]] = ['value' => $m[2], 'type' => $m[3]];
            }
        }

        Assert::true(
            count($keyed) >= 25,
            'the token reader found '.count($keyed).' tokens — it is not parsing the seeder any more',
        );

        return $keyed;
    }

    public function testEveryBridgedNameIsSeeded(): void
    {
        $tokens = $this->tokensByKey();

        foreach (array_keys($this->bridged()) as $name) {
            Assert::true(
                isset($tokens[$name]),
                $name.' is not seeded — ThemeCss::DERIVED reads it, so the shop would fall back to site.css',
            );
        }
    }

    public function testTheBridgedValuesAreTheShopItsOwn(): void
    {
        $tokens = $this->tokensByKey();

        foreach ($this->bridged() as $name => $expected) {
            Assert::same($expected, $tokens[$name]['value'], $name.' must start as the built palette, not a placeholder');
        }
    }

    public function testABridgedNameIsAColourThePickerCanEdit(): void
    {
        $tokens = $this->tokensByKey();

        foreach (array_keys($this->bridged()) as $name) {
            Assert::same(
                'color',
                $tokens[$name]['type'],
                $name.' must be a colour token, or the panel renders it as a text box and the picker cannot parse it',
            );

            Assert::true(
                preg_match('/^#[0-9A-F]{6}$/', $tokens[$name]['value']) === 1,
                $name.' must be an uppercase six-digit hex — ThemeBuilder::normalise() writes nothing else',
            );
        }
    }

    public function testTokensAreSeededOnceAndNeverOverwritten(): void
    {
        // The seeder is how an installed site picks up a new token; if it overwrote, every deploy would
        // quietly undo the owner's theme.
        $seeder = (string) file_get_contents((string) self::sitePath('database/seeders/ThemeTokensSeeder.php'));

        Assert::true(
            str_contains($seeder, 'firstOrCreate'),
            'the seeder must create missing tokens and leave existing rows alone',
        );
    }

    public function testTheThemeStylesheetIsLinkedOnEveryPage(): void
    {
        $head = (string) file_get_contents((string) self::sitePath('resources/views/site/partials/head.blade.php'));

        Assert::true(
            str_contains($head, 'ThemeCss'),
            'the head must ask ThemeCss for the hashed URL, so a saved token mints a fresh immutable stylesheet',
        );

        // The regression, stated exactly: the theme link used to be the `@else` arm of the site.css check,
        // which only runs when the build produced no stylesheet. It must not be inside that arm again.
        Assert::true(
            preg_match('/@else\s*<link rel="stylesheet" href="\/assets\/theme\.css">\s*@endif/', $head) !== 1,
            'the theme stylesheet is back inside the fallback branch — a built site would never load it',
        );

        Assert::true(
            str_contains($head, 'href="{{ $themeHref }}"'),
            'the head must link the theme stylesheet unconditionally, after site.css',
        );
    }

    public function testThePropertiesTheBuildNeverDefinedAreRestated(): void
    {
        // Linking the theme sheet makes `--font-sans: var(--wx-font)` win over the build's own stack, and
        // `--wx-font` is not a token — the shop would drop Inter and Nohemi.
        //
        // `--color-muted` is the expensive one: `text-muted` is a text class used throughout the section
        // templates and in the footer, but DERIVED bridges it from `--muted`, which is a shadcn *surface*.
        // Bridged, forty-one elements a page rendered #F5F5F5 — footer links and captions in white on white.
        // It was measured against three live pages before this line was written.
        $head = (string) file_get_contents((string) self::sitePath('resources/views/site/partials/head.blade.php'));

        foreach (['--font-sans', '--font-heading', '--color-muted', '--color-body'] as $property) {
            Assert::true(
                str_contains($head, $property.':'),
                $property.' must be restated in the head, or linking the theme sheet changes it for the worse',
            );
        }

        Assert::true(
            str_contains($head, 'Nohemi'),
            'the heading stack is Nohemi — losing it is a visible font change on every page',
        );
    }
}
