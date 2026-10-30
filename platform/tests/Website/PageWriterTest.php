<?php

declare(strict_types=1);

namespace Tests\Website;

use App\Domain\Website\Puck\InvalidPuckDocument;
use App\Domain\Website\Puck\PageWriter;
use App\Domain\Website\Puck\PuckDocument;
use App\Domain\Website\Puck\Registry;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * Saving is the strict side of the contract.
 *
 * The failure that matters is silent data loss: an editor with an old browser tab saves a page,
 * the build no longer knows one of its blocks, and a lenient writer would delete it without
 * telling anyone. Every test here is about refusing rather than tidying up.
 */
final class PageWriterTest extends TestCase
{
    private PageWriter $writer;

    private Registry $registry;

    public function setUp(): void
    {
        Registry::flush();
        $this->registry = new Registry(dirname(__DIR__, 2));
        $this->writer = new PageWriter($this->registry);
    }

    public function testAWellFormedDocumentSurvivesTheRoundTrip(): void
    {
        $stored = $this->writer->sanitize([
            'root' => ['props' => ['title' => 'Living rooms']],
            'content' => [
                ['type' => 'hero', 'props' => ['id' => 'h1', 'heading' => 'Rooms worth living in']],
                ['type' => 'richText', 'props' => ['id' => 't1', 'html' => '<p>Copy</p>']],
            ],
        ]);

        Assert::same(
            ['h1', 't1'],
            array_map(static fn (array $block): string => $block['props']['id'], $stored['content']),
            'ids are preserved',
        );
        Assert::same('hero,richText', PuckDocument::fromStored($stored, $this->registry)->signature(), 'reading it back gives the same page');
        Assert::same('Living rooms', $stored['root']['props']['title'], 'the root props are kept');
    }

    public function testPropsAreNormalisedOnTheWayIn(): void
    {
        $stored = $this->writer->sanitize([
            'content' => [[
                'type' => 'productGrid',
                'props' => ['heading' => 'Sale', 'limit' => 999, 'removedLongAgo' => 'x'],
            ]],
        ]);

        $props = $stored['content'][0]['props'];

        Assert::same(24, $props['limit'], 'clamped to the declared maximum');
        Assert::same(false, array_key_exists('removedLongAgo', $props), 'a field that no longer exists is dropped, not stored');
    }

    public function testABlockWithoutAnIdGetsOne(): void
    {
        $stored = $this->writer->sanitize([
            'content' => [
                ['type' => 'cta', 'props' => []],
                ['type' => 'cta', 'props' => []],
            ],
        ]);

        Assert::same('cta-1', $stored['content'][0]['props']['id'], 'first');
        Assert::same('cta-2', $stored['content'][1]['props']['id'], 'second, not a duplicate');
    }

    public function testAnUnknownBlockIsRefusedAndNamed(): void
    {
        try {
            $this->writer->sanitize(['content' => [['type' => 'carousel', 'props' => []]]]);
            Assert::true(false, 'saving a page with an unknown block must be refused');
        } catch (InvalidPuckDocument $e) {
            Assert::same(1, count($e->errors), 'one problem, one message');
            Assert::true(str_contains($e->errors[0], 'carousel'), 'the message names the block so it can be found');
        }
    }

    public function testEveryProblemIsReportedAtOnce(): void
    {
        try {
            $this->writer->sanitize([
                'content' => [
                    ['type' => 'carousel', 'props' => []],
                    ['props' => []],
                    ['type' => 'cta', 'props' => 'not an object'],
                    ['type' => 'hero', 'props' => []],
                ],
            ]);
            Assert::true(false, 'the document should have been refused');
        } catch (InvalidPuckDocument $e) {
            Assert::same(3, count($e->errors), 'three problems so the editor can fix them in one pass');
        }
    }

    public function testDuplicateIdsAreRefused(): void
    {
        Assert::throws(
            InvalidPuckDocument::class,
            fn () => $this->writer->sanitize([
                'content' => [
                    ['type' => 'cta', 'props' => ['id' => 'same']],
                    ['type' => 'hero', 'props' => ['id' => 'same']],
                ],
            ]),
            'two blocks sharing an id would receive the same data',
        );
    }

    public function testGarbageIsRefusedWithAReasonRatherThanAnException(): void
    {
        foreach (['{not json', 42, null, ['content' => 'a string'], ['content' => ['keyed' => 'not a list']]] as $raw) {
            Assert::throws(
                InvalidPuckDocument::class,
                fn () => $this->writer->sanitize($raw),
                'input '.json_encode($raw).' must be refused',
            );
        }
    }

    public function testAJsonStringIsAcceptedBecauseTheEditorMayPostEither(): void
    {
        $stored = $this->writer->sanitize('{"content":[{"type":"cta","props":{}}]}');

        Assert::same(1, count($stored['content']), 'a JSON string decodes and validates');
    }

    public function testTheRootKeepsOnlyScalarProps(): void
    {
        $stored = $this->writer->sanitize([
            'root' => ['props' => ['title' => 'Fine', 'nested' => ['a' => 1]]],
            'content' => [],
        ]);

        Assert::same(['title' => 'Fine'], $stored['root']['props'], 'a future Puck key cannot smuggle arrays into the row');
    }
}
