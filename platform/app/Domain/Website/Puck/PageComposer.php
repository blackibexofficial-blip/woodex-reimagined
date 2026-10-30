<?php

declare(strict_types=1);

namespace App\Domain\Website\Puck;

/**
 * Decides which data a document needs, and fetches it once.
 *
 * The important behaviour is what it does *not* do: it never calls a resolver for a block that
 * is not on the page, and it calls each resolver at most once per render. A page with three
 * product grids issues one query, not three — which matters on a host where the budget is
 * eight queries and four hundred milliseconds per request.
 *
 * Framework-free: the resolvers are injected, so this class can be tested with fakes and the
 * binding rules verified without a database.
 */
final readonly class PageComposer
{
    public function __construct(
        private Registry $registry,
        private BlockData $data,
    ) {}

    /**
     * Resolve every data-bound block in the document.
     *
     * @return array<string, array<string, list<array<string, mixed>>>>  block id => view variables
     */
    public function dataFor(PuckDocument $document): array
    {
        $resolved = [];
        $memo = [];

        foreach ($document->blocks as $block) {
            if (! $this->registry->isBound($block['type'])) {
                continue;
            }

            $resolver = $this->resolverName($block['type']);

            if ($resolver === null) {
                continue;
            }

            // Props are normalised already, so the cache key is honest: two blocks asking for
            // the same category and limit share one fetch.
            $cacheKey = $resolver.':'.md5((string) json_encode($block['props']));

            if (! array_key_exists($cacheKey, $memo)) {
                $memo[$cacheKey] = $this->data->{$resolver}($block['props']);
            }

            $resolved[$block['id']] = [$this->variableName($block['type']) => $memo[$cacheKey]];
        }

        return $resolved;
    }

    /** Block type → method on BlockData. Keeping the map in one place makes a new block explicit. */
    public function resolverName(string $blockType): ?string
    {
        return match ($blockType) {
            'productGrid' => 'products',
            'categoryTiles' => 'categories',
            'materialsShowcase' => 'swatches',
            'faq' => 'faqs',
            'showroomMap' => 'showrooms',
            default => null,
        };
    }

    /** Block type → the variable name its Blade view expects. */
    public function variableName(string $blockType): string
    {
        return match ($blockType) {
            'productGrid' => 'products',
            'categoryTiles' => 'categories',
            'materialsShowcase' => 'swatches',
            'faq' => 'faqs',
            'showroomMap' => 'showrooms',
            default => 'data',
        };
    }
}
