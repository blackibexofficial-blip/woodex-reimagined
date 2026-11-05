<?php

declare(strict_types=1);

namespace Tests\Website;

use App\Domain\Website\Puck\BlockRenderer;
use App\Domain\Website\Puck\Registry;
use InvalidArgumentException;
use RuntimeException;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The registry is a contract between two languages, so it is tested as one.
 *
 * The parity test — every declared block has a Blade view — is the one that earns its keep. A
 * new block can be added to the editor in ten seconds and would then render an exception on a
 * live page; this test fails instead, before the deploy.
 */
final class PuckRegistryTest extends TestCase
{
    private Registry $registry;

    public function setUp(): void
    {
        Registry::flush();
        $this->registry = new Registry(dirname(__DIR__, 2));
    }

    public function testTheCommittedRegistryDeclaresEveryBlockWeShipped(): void
    {
        Assert::same(
            ['hero', 'richText', 'productGrid', 'categoryTiles', 'materialsShowcase', 'faq', 'showroomMap', 'cta', 'heroSlider', 'marketWeServe'],
            $this->registry->names(),
            'registry is the original eight blocks plus the two live-site parity blocks, in file order',
        );
    }

    public function testEveryBlockHasABladeView(): void
    {
        $blade = dirname(__DIR__, 2).'/resources/views/puck/blocks';

        foreach ($this->registry->names() as $name) {
            $view = BlockRenderer::viewName($name);
            $path = $blade.'/'.$view.'.blade.php';

            Assert::trueWith(
                is_file($path),
                static fn (): string => "{$name} has no view at {$path}",
                'block parity',
            );
        }
    }

    public function testViewNamesAreKebabCaseAndCannotCollide(): void
    {
        $views = array_map(BlockRenderer::viewName(...), $this->registry->names());

        Assert::same('product-grid', $views[2], 'productGrid → product-grid');
        Assert::same('rich-text', $views[1], 'richText → rich-text');
        Assert::same(count($views), count(array_unique($views)), 'two blocks must not share a view');
    }

    public function testExactlyTheDataDrivenBlocksAreBound(): void
    {
        $bound = array_values(array_filter(
            $this->registry->names(),
            fn (string $name): bool => $this->registry->isBound($name),
        ));

        Assert::same(
            ['productGrid', 'categoryTiles', 'materialsShowcase', 'faq', 'showroomMap'],
            $bound,
            'a bound block stores a query; the rest store their own copy',
        );
    }

    public function testNormalizePropsDropsUnknownKeysAndFillsDefaults(): void
    {
        $props = $this->registry->normalizeProps('hero', [
            'heading' => 'Made in Lahore',
            'removedField' => 'should not survive',
            'align' => 'center',
        ]);

        Assert::same('Made in Lahore', $props['heading'], 'a supplied value is kept');
        Assert::same(false, array_key_exists('removedField', $props), 'an unknown key is dropped');
        Assert::same('', $props['subheading'], 'a missing key receives its default');
        Assert::same('center', $props['align'], 'a valid select is kept');
        Assert::same(
            ['eyebrow', 'heading', 'subheading', 'image', 'ctaLabel', 'ctaHref', 'align'],
            array_keys($props),
            'the shape is exactly the registry, in registry order',
        );
    }

    public function testNormalizePropsClampsNumbersIntoTheDeclaredRange(): void
    {
        Assert::same(24, $this->registry->normalizeProps('productGrid', ['limit' => 500])['limit'], 'above max clamps to max');
        Assert::same(1, $this->registry->normalizeProps('productGrid', ['limit' => 0])['limit'], 'below min clamps to min');
        Assert::same(8, $this->registry->normalizeProps('productGrid', ['limit' => 'abc'])['limit'], 'garbage falls back to the default');
        Assert::same(12, $this->registry->normalizeProps('productGrid', ['limit' => 12])['limit'], 'a valid number is untouched');
    }

    /**
     * A `list` field is the first field type whose value is a structure rather than a scalar, so it
     * gets the same treatment as a block: unknown keys dropped, missing keys defaulted, garbage
     * rejected. A slider that stores a slide with the wrong keys renders an empty slide forever.
     */
    public function testAListFieldNormalisesEveryItemAgainstItsItemSchema(): void
    {
        $props = $this->registry->normalizeProps('heroSlider', [
            'slides' => [
                ['heading' => 'Design For Your Workspace', 'body' => 'Concept to install', 'removed' => 'x'],
                ['heading' => 'Reception That Welcomes'],
            ],
        ]);

        Assert::same(2, count($props['slides']), 'both slides survive');
        Assert::same(
            ['kicker', 'heading', 'body', 'ctaLabel', 'ctaUrl', 'image', 'imageAlt', 'align'],
            array_keys($props['slides'][0]),
            'each slide has exactly the item schema, in registry order',
        );
        Assert::same('x', $props['slides'][0]['removed'] ?? 'x', 'unknown slide keys are dropped');
        Assert::same('Shop Now', $props['slides'][1]['ctaLabel'], 'a missing slide key gets its default');
        Assert::same('left', $props['slides'][1]['align'], 'select inside a list item falls back correctly');
    }

    public function testAListFieldRefusesGarbageWithoutLosingTheGoodItems(): void
    {
        $props = $this->registry->normalizeProps('marketWeServe', [
            'cards' => ['not an array', ['title' => 'Space Planning'], 42],
        ]);

        Assert::same(1, count($props['cards']), 'non-array entries are skipped, the good one is kept');
        Assert::same('Space Planning', $props['cards'][0]['title'], 'the surviving card keeps its value');
        Assert::same([], $this->registry->normalizeProps('marketWeServe', ['cards' => 'nope'])['cards'], 'a scalar becomes an empty list');
    }

    public function testAListFieldStopsAtItsDeclaredMaximum(): void
    {
        $slides = array_fill(0, 20, ['heading' => 'Same slide']);

        Assert::same(8, count($this->registry->normalizeProps('heroSlider', ['slides' => $slides])['slides']), 'heroSlider allows at most 8 slides');
    }

    public function testNormalizePropsRejectsASelectValueThatIsNotOnTheList(): void
    {
        $props = $this->registry->normalizeProps('cta', ['tone' => 'chartreuse']);

        Assert::same('wood', $props['tone'], 'an unknown select falls back to its default');
    }

    public function testNormalizePropsCoercesBooleansAndText(): void
    {
        Assert::same(true, $this->registry->normalizeProps('faq', ['emitSchema' => '1'])['emitSchema'], '"1" is true');
        Assert::same(false, $this->registry->normalizeProps('faq', ['emitSchema' => 'no'])['emitSchema'], '"no" is false');
        Assert::same('42', $this->registry->normalizeProps('productGrid', ['heading' => 42])['heading'], 'scalars become strings');
        Assert::same('', $this->registry->normalizeProps('productGrid', ['heading' => ['array']])['heading'], 'a non-scalar becomes empty');
    }

    public function testAnUnknownBlockIsRefused(): void
    {
        Assert::throws(
            InvalidArgumentException::class,
            fn () => $this->registry->block('carousel'),
            'asking for a block that is not declared',
        );
    }

    public function testAMalformedRegistryIsRefusedRatherThanRendered(): void
    {
        $directory = sys_get_temp_dir().'/puck-registry-'.getmypid();
        @mkdir($directory.'/resources/js/studio', 0775, true);

        file_put_contents($directory.'/resources/js/studio/registry.json', '{"blocks": {"Hero": {"label": "x", "group": "y", "fields": {"a": {"type": "text"}}}}}');
        Registry::flush();

        Assert::throws(
            RuntimeException::class,
            static fn () => (new Registry($directory))->blocks(),
            'a PascalCase block name is rejected: it would produce a view name nobody wrote',
        );

        Registry::flush();
        @unlink($directory.'/resources/js/studio/registry.json');
        @rmdir($directory.'/resources/js/studio');
        @rmdir($directory.'/resources/js');
        @rmdir($directory.'/resources');
        @rmdir($directory);
    }
}
