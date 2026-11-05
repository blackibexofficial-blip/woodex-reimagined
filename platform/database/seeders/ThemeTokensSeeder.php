<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Website\Models\ThemeToken;
use Illuminate\Database\Seeder;

/**
 * The storefront's palette, as the tokens the Theme Builder edits.
 *
 * These keys are not decoration: every Tailwind class in the storefront is `hsl(var(--primary))`, so a row
 * here *is* the colour of a button. `ContentApi::theme()` converts each hex back to the `H S% L%` triplet the
 * stylesheet needs, which is why the admin can keep using a native colour picker.
 *
 * The vocabulary replaced v1's (`--navy`, `--wood`, `--paper`): the interior site those tokens styled is
 * archived, and a theme describing a site that no longer renders is a screen with nothing behind it.
 *
 * `tokens()` is static because `ThemeBuilder::loadTokens()` calls it on every visit — a token added in a later
 * release then appears in the panel without a manual seed.
 */
class ThemeTokensSeeder extends Seeder
{
    /**
     * @return list<array{group: string, key: string, value: string, label: string, type: string}>
     */
    public static function tokens(): array
    {
        return [
            ['group' => 'colour', 'key' => '--background', 'value' => '#FFFFFF', 'label' => 'Page background', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--foreground', 'value' => '#1F1F1F', 'label' => 'Body text', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--card', 'value' => '#FFFFFF', 'label' => 'Card background', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--card-foreground', 'value' => '#1F1F1F', 'label' => 'Card text', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--popover', 'value' => '#FFFFFF', 'label' => 'Popover background', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--popover-foreground', 'value' => '#1F1F1F', 'label' => 'Popover text', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--primary', 'value' => '#22262A', 'label' => 'Primary (nav, footer, CTAs)', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--primary-foreground', 'value' => '#FFFFFF', 'label' => 'Text on primary', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--secondary', 'value' => '#F2F2F2', 'label' => 'Secondary surface', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--secondary-foreground', 'value' => '#1F1F1F', 'label' => 'Text on secondary', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--muted', 'value' => '#F5F5F5', 'label' => 'Muted surface', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--muted-foreground', 'value' => '#737373', 'label' => 'Muted text', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--accent', 'value' => '#629924', 'label' => 'Accent (brand green)', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--accent-foreground', 'value' => '#FFFFFF', 'label' => 'Text on accent', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--destructive', 'value' => '#EF4343', 'label' => 'Error / sale red', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--destructive-foreground', 'value' => '#FAFAFA', 'label' => 'Text on error', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--border', 'value' => '#E0E0E0', 'label' => 'Borders', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--input', 'value' => '#E0E0E0', 'label' => 'Input borders', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--ring', 'value' => '#629924', 'label' => 'Focus ring', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--hon-green', 'value' => '#629924', 'label' => 'Brand green', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--hon-green-light', 'value' => '#7EB83D', 'label' => 'Brand green — light', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--hon-green-dark', 'value' => '#4B7915', 'label' => 'Brand green — dark', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--hon-green-pale', 'value' => '#F3F7ED', 'label' => 'Brand green — pale', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--utility-bar', 'value' => '#22262A', 'label' => 'Utility bar background', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--utility-text', 'value' => '#BFBFBF', 'label' => 'Utility bar text', 'type' => 'color'],

            // ---- The storefront's own palette -------------------------------------------------
            //
            // `ThemeCss::DERIVED` prints `--color-navy-900: var(--navy)` and six siblings: the shop's
            // sections are written against `navy-*`, `wood-*`, `sand-*`, `ink`, `body`, `paper` and
            // `line`, and it re-derives all of them from these names. When the token vocabulary moved
            // from v1's `--navy/--wood/--paper` to the shadcn set above, these were never re-seeded —
            // so every one of those `var()` lookups pointed at an undefined property, `--color-navy-900`
            // resolved to nothing, and the shop fell back to the values compiled into `site.css`.
            // Harmless while nothing linked the theme stylesheet. Not harmless once it did: the fallbacks
            // in `site.css` are what makes the shop look like itself.
            //
            // These are the shop, editable. The shadcn set above is the admin/OS surfaces; the two
            // vocabularies now both resolve instead of one shadowing the other.
            ['group' => 'colour', 'key' => '--navy', 'value' => '#0F1E36', 'label' => 'Shop header & footer', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--navy-2', 'value' => '#1A2A45', 'label' => 'Shop header, lifted', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--wood', 'value' => '#A87442', 'label' => 'Wood accent', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--surface', 'value' => '#FCF2E8', 'label' => 'Sand surface', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--ink', 'value' => '#111111', 'label' => 'Shop headings', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--paper', 'value' => '#FFFFFF', 'label' => 'Shop page paper', 'type' => 'color'],
            ['group' => 'colour', 'key' => '--line', 'value' => '#DEDEDB', 'label' => 'Shop rules & borders', 'type' => 'color'],
        ];
    }

    public function run(): void
    {
        $added = 0;

        foreach (self::tokens() as $index => $token) {
            $created = ThemeToken::query()->firstOrCreate(
                ['key' => $token['key']],
                $token + ['sort' => $index * 10],
            );

            if ($created->wasRecentlyCreated) {
                $added++;
            }
        }

        $total = count(self::tokens());

        $this->command?->info('Theme tokens: '.$added.' added, '.($total - $added).' already there.');
    }
}
