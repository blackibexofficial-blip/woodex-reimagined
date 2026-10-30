<?php

declare(strict_types=1);

namespace Tests\Website;

use App\Domain\Website\Puck\BlockData;
use App\Domain\Website\Puck\PageComposer;
use App\Domain\Website\Puck\PuckDocument;
use App\Domain\Website\Puck\Registry;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The composer decides what data a page needs and fetches each of it once.
 *
 * The second half of that sentence is the point. A page with three product grids is common on
 * a landing page; three identical queries against a shared database would be the difference
 * between a page that loads in 300 ms and one that does not load at all on a busy evening.
 */
final class PageComposerTest extends TestCase
{
    private Registry $registry;

    public function setUp(): void
    {
        Registry::flush();
        $this->registry = new Registry(dirname(__DIR__, 2));
    }

    public function testOnlyBoundBlocksAskForData(): void
    {
        $data = new RecordingBlockData;
        $composer = new PageComposer($this->registry, $data);

        $resolved = $composer->dataFor($this->document([
            ['type' => 'hero', 'props' => ['heading' => 'Welcome']],
            ['type' => 'cta', 'props' => ['heading' => 'Talk to us']],
            ['type' => 'richText', 'props' => ['html' => '<p>Copy</p>']],
        ]));

        Assert::same([], $resolved, 'a static block needs nothing fetched');
        Assert::same([], $data->calls, 'and nothing is called');
    }

    public function testEachBoundBlockReceivesTheVariableItsViewExpects(): void
    {
        $data = new RecordingBlockData;
        $composer = new PageComposer($this->registry, $data);

        $resolved = $composer->dataFor($this->document([
            ['type' => 'productGrid', 'props' => ['id' => 'grid-1']],
            ['type' => 'categoryTiles', 'props' => ['id' => 'tiles-2']],
            ['type' => 'materialsShowcase', 'props' => ['id' => 'mats-3']],
            ['type' => 'faq', 'props' => ['id' => 'faq-4']],
            ['type' => 'showroomMap', 'props' => ['id' => 'map-5']],
        ]));

        Assert::same(['products'], array_keys($resolved['grid-1']), 'productGrid → $products');
        Assert::same(['categories'], array_keys($resolved['tiles-2']), 'categoryTiles → $categories');
        Assert::same(['swatches'], array_keys($resolved['mats-3']), 'materialsShowcase → $swatches');
        Assert::same(['faqs'], array_keys($resolved['faq-4']), 'faq → $faqs');
        Assert::same(['showrooms'], array_keys($resolved['map-5']), 'showroomMap → $showrooms');
    }

    public function testIdenticalBlocksShareOneFetch(): void
    {
        $data = new RecordingBlockData;
        $composer = new PageComposer($this->registry, $data);

        $resolved = $composer->dataFor($this->document([
            ['type' => 'productGrid', 'props' => ['id' => 'grid-a', 'category' => 'sofas']],
            ['type' => 'productGrid', 'props' => ['id' => 'grid-b', 'category' => 'sofas']],
        ]));

        Assert::same(1, $data->countOf('products'), 'one query for two identical grids');
        Assert::same(['products'], array_keys($resolved['grid-a']), 'the first grid renders');
        Assert::same(['products'], array_keys($resolved['grid-b']), 'and so does the second');
    }

    public function testDifferentQueriesAreFetchedSeparately(): void
    {
        $data = new RecordingBlockData;
        $composer = new PageComposer($this->registry, $data);

        $composer->dataFor($this->document([
            ['type' => 'productGrid', 'props' => ['id' => 'grid-a', 'category' => 'sofas']],
            ['type' => 'productGrid', 'props' => ['id' => 'grid-b', 'category' => 'tables']],
            ['type' => 'productGrid', 'props' => ['id' => 'grid-c', 'category' => 'tables']],
        ]));

        Assert::same(2, $data->countOf('products'), 'sofas once, tables once — not three times');
    }

    public function testTheResolverMapCoversEveryBoundBlockInTheRegistry(): void
    {
        $composer = new PageComposer($this->registry, new RecordingBlockData);
        $declared = array_keys($this->registry->blocks());

        foreach ($declared as $name) {
            $resolver = $composer->resolverName($name);

            Assert::same(
                $this->registry->isBound($name),
                $resolver !== null,
                "{$name}: bound blocks must have a resolver, static blocks must not",
            );
        }
    }

    public function testAnEmptyDocumentResolvesToNothing(): void
    {
        Assert::same([], (new PageComposer($this->registry, new RecordingBlockData))->dataFor(PuckDocument::empty()));
    }

    /**
     * @param  list<array{type: string, props: array<string, mixed>}>  $blocks
     */
    private function document(array $blocks): PuckDocument
    {
        return PuckDocument::fromStored(['content' => $blocks], $this->registry);
    }
}

/**
 * A BlockData that returns one recognisable row per call and remembers every call it served.
 * A fake rather than a mock library: the assertions are about counts, not about call order.
 */
final class RecordingBlockData implements BlockData
{
    /** @var list<string> */
    public array $calls = [];

    public function products(array $props): array
    {
        $this->calls[] = 'products';

        return [['name' => 'Sofa']];
    }

    public function categories(array $props): array
    {
        $this->calls[] = 'categories';

        return [['name' => 'Sofas']];
    }

    public function swatches(array $props): array
    {
        $this->calls[] = 'swatches';

        return [['label' => 'Natural Oak']];
    }

    public function faqs(array $props): array
    {
        $this->calls[] = 'faqs';

        return [['question' => 'Do you deliver?']];
    }

    public function showrooms(array $props): array
    {
        $this->calls[] = 'showrooms';

        return [];
    }

    public function countOf(string $method): int
    {
        return count(array_filter($this->calls, static fn (string $call): bool => $call === $method));
    }
}
