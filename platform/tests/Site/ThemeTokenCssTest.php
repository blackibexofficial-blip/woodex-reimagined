<?php

declare(strict_types=1);

namespace Tests\Site;

use App\Domain\Website\Content\ContentApi;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The one conversion between what the Theme screen edits and what the storefront wears.
 *
 * A token row is hex, because that is what `<input type="color">` produces. The stylesheet is
 * `hsl(var(--primary))`, so the channel triplet has to come out of it — and every page of the shop depends on
 * this one function being right.
 *
 * It shipped a 500 first. `#FFFFFF` divides `1 - 1`, PHP returns an **int** for an exact integer division, and
 * `0 === 0.0` is false — so pure white and pure black fell past the grey guard and divided by zero. Both are in
 * the token set (page background, card, text-on-primary), which is to say the theme endpoint was broken for
 * every visit. Hence the tolerance, and hence this test.
 */
final class ThemeTokenCssTest extends TestCase
{
    public function testItConvertsTheColoursThePaletteActuallyUses(): void
    {
        $expected = [
            '#FFFFFF' => '0 0% 100%',
            '#000000' => '0 0% 0%',
            '#1F1F1F' => '0 0% 12%',
            '#22262A' => '210 11% 15%',   // --primary: the nav, the footer, every dark CTA
            '#629924' => '88 62% 37%',    // --accent: the brand green
            '#E0E0E0' => '0 0% 88%',
        ];

        foreach ($expected as $hex => $triplet) {
            Assert::same($triplet, ContentApi::cssValue($hex), $hex.' must become '.$triplet);
        }
    }

    public function testWhiteAndBlackDoNotDivideByZero(): void
    {
        // The regression, stated as its own case: both are exact-channel colours, and both used to throw.
        Assert::same('0 0% 100%', ContentApi::cssValue('#FFFFFF'), 'white is a grey with no hue and no saturation');
        Assert::same('0 0% 0%', ContentApi::cssValue('#000000'), 'black is a grey too');
    }

    public function testItAcceptsLowercaseAndSurroundingSpace(): void
    {
        Assert::same('88 62% 37%', ContentApi::cssValue('  #629924  '), 'the picker may save either case');
        Assert::same('88 62% 37%', ContentApi::cssValue('#629924'), 'and the canonical one still works');
    }

    public function testAnythingThatIsNotAHexColourPassesThrough(): void
    {
        // Shadows and font stacks are tokens of type `text`; wrapping them in HSL would break the page.
        $shadow = '0 18px 50px rgba(12,22,40,.10)';

        Assert::same($shadow, ContentApi::cssValue($shadow), 'a shadow is not a colour');
        Assert::same('Inter, sans-serif', ContentApi::cssValue('Inter, sans-serif'), 'nor is a font stack');
        Assert::same('88 62% 37%', ContentApi::cssValue('88 62% 37%'), 'an already-converted triplet is left alone');
    }
}
