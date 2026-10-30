<?php

declare(strict_types=1);

namespace Tests\Website;

use App\Domain\Website\Puck\PuckDocument;
use App\Domain\Website\Puck\Registry;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * A stored page is untrusted input: it was written by an editor, possibly months ago, against
 * a registry that may have changed since. Decoding is therefore total — every input produces a
 * document, never an exception.
 */
final class PuckDocumentTest extends TestCase
{
    private Registry $registry;

    public function setUp(): void
    {
        Registry::flush();
        $this->registry = new Registry(dirname(__DIR__, 2));
    }

    public function testAMalformedDocumentRendersNothingRatherThanThrowing(): void
    {
        foreach (['{not json', '[1,2,3]', '"a string"', '{"content": "not a list"}', '{"content": []}'] as $raw) {
            Assert::true(
                PuckDocument::fromStored($raw, $this->registry)->isEmpty(),
                "a document of {$raw} must decode to no blocks",
            );
        }
    }

    public function testAnEmptyColumnIsAnEmptyDocument(): void
    {
        Assert::true(PuckDocument::fromStored(null, $this->registry)->isEmpty(), 'null');
        Assert::true(PuckDocument::fromStored('', $this->registry)->isEmpty(), 'empty string');
    }

    public function testBlocksKeepTheirOrderAndTheirIds(): void
    {
        $document = PuckDocument::fromStored([
            'root' => ['props' => []],
            'content' => [
                ['type' => 'hero', 'props' => ['id' => 'hero-a', 'heading' => 'One']],
                ['type' => 'richText', 'props' => ['id' => 'text-b', 'html' => '<p>Two</p>']],
                ['type' => 'cta', 'props' => ['id' => 'cta-c', 'heading' => 'Three']],
            ],
        ], $this->registry);

        Assert::same(3, $document->count(), 'three blocks');
        Assert::same(['hero', 'richText', 'cta'], array_column($document->blocks, 'type'), 'order is preserved');
        Assert::same('hero-a', $document->blocks[0]['id'], 'Puck ids survive');
        Assert::same('hero,richText,cta', $document->signature(), 'the signature is the block list');
    }

    public function testABlockWithNoIdReceivesAStableOne(): void
    {
        $document = PuckDocument::fromStored([
            'content' => [
                ['type' => 'cta', 'props' => []],
                ['type' => 'cta', 'props' => []],
            ],
        ], $this->registry);

        Assert::same('cta-1', $document->blocks[0]['id'], 'generated from the type and the position');
        Assert::same('cta-2', $document->blocks[1]['id'], 'so two CTAs on one page do not collide');
    }

    public function testAnUnknownBlockIsSkippedAndTheRestStillRenders(): void
    {
        $document = PuckDocument::fromStored([
            'content' => [
                ['type' => 'hero', 'props' => ['heading' => 'Still here']],
                ['type' => 'pulledFromTheRegistryLastYear', 'props' => ['anything' => true]],
                ['type' => 'faq', 'props' => []],
            ],
        ], $this->registry);

        Assert::same(['hero', 'faq'], array_column($document->blocks, 'type'), 'the removed block disappears quietly');
    }

    public function testAMalformedBlockEntryDoesNotTakeItsNeighboursWithIt(): void
    {
        $document = PuckDocument::fromStored([
            'content' => [
                'a bare string',
                ['props' => ['heading' => 'no type at all']],
                ['type' => 42, 'props' => []],
                ['type' => 'hero', 'props' => ['heading' => 'Survivor']],
            ],
        ], $this->registry);

        Assert::same(1, $document->count(), 'only the well-formed block survives');
        Assert::same('Survivor', $document->blocks[0]['props']['heading'], 'and it is the right one');
    }

    public function testPropsAreNormalisedWhenTheDocumentIsDecoded(): void
    {
        $document = PuckDocument::fromStored([
            'content' => [[
                'type' => 'productGrid',
                'props' => [
                    'heading' => 'On sale',
                    'limit' => 900,
                    'sort' => 'cheapest',
                    'deadField' => 'x',
                ],
            ]],
        ], $this->registry);

        $props = $document->blocks[0]['props'];

        Assert::same(24, $props['limit'], 'clamped on the way in, not on the way out');
        Assert::same('featured', $props['sort'], 'an unknown sort returns to the default');
        Assert::same(false, array_key_exists('deadField', $props), 'stale keys never reach a view');
    }

    public function testATitleIsCarriedButNeverRequired(): void
    {
        Assert::same('Our story', PuckDocument::fromStored(['title' => 'Our story', 'content' => []], $this->registry)->title, 'title');
        Assert::same('', PuckDocument::fromStored(['content' => []], $this->registry)->title, 'absent title');
    }
}
