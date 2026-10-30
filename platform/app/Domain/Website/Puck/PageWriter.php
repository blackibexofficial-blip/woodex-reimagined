<?php

declare(strict_types=1);

namespace App\Domain\Website\Puck;

use JsonException;

/**
 * Validates a document on its way *into* storage.
 *
 * This is the mirror image of PuckDocument, and the asymmetry is deliberate: reading is
 * lenient (an unknown block is skipped, so an old page still renders) while writing is strict
 * (an unknown block is refused). If saving were lenient too, the next save of a page would
 * quietly delete the blocks the server did not recognise — an editor who opened a page in an
 * older browser tab would silently destroy work. Refusing costs one error message; accepting
 * costs the page.
 */
final class PageWriter
{
    public function __construct(private readonly Registry $registry) {}

    /**
     * @param  mixed  $raw  the JSON the editor posted — untyped on purpose: this method is the
     *                      boundary, so it refuses bad input rather than trusting the caller's
     *                      type declaration to have done it
     * @return array{root: array<string, mixed>, content: list<array<string, mixed>>}
     *
     * @throws InvalidPuckDocument
     */
    public function sanitize(mixed $raw): array
    {
        if (is_string($raw)) {
            try {
                $raw = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException $e) {
                throw InvalidPuckDocument::because(['The document is not valid JSON: '.$e->getMessage()]);
            }
        }

        if (! is_array($raw)) {
            throw InvalidPuckDocument::because(['The document is empty.']);
        }

        $content = $raw['content'] ?? null;

        if (! is_array($content) || ! array_is_list($content)) {
            throw InvalidPuckDocument::because(['The document has no list of blocks.']);
        }

        /** @var list<string> $errors */
        $errors = [];
        /** @var list<array<string, mixed>> $blocks */
        $blocks = [];
        $position = 0;

        foreach ($content as $index => $item) {
            $where = 'Block '.($index + 1);

            if (! is_array($item) || ! isset($item['type']) || ! is_string($item['type'])) {
                $errors[] = $where.' has no type.';

                continue;
            }

            if (! $this->registry->has($item['type'])) {
                $errors[] = $where.' uses "'.$item['type'].'", which this build does not know.';

                continue;
            }

            $props = $item['props'] ?? [];

            if (! is_array($props)) {
                $errors[] = $where.' ('.$item['type'].') has props that are not an object.';

                continue;
            }

            $normalized = $this->registry->normalizeProps($item['type'], $props);

            // The id is the anchor the composer uses to attach fetched data, so it is kept
            // outside the props normalisation — it is not an editable field.
            $normalized['id'] = is_string($props['id'] ?? null) && $props['id'] !== ''
                ? $props['id']
                : $item['type'].'-'.(++$position);

            $blocks[] = ['type' => $item['type'], 'props' => $normalized];
        }

        if ($blockIndexes = $this->duplicateIds($blocks)) {
            $errors[] = 'Blocks share the id '.implode(', ', $blockIndexes).', which would attach the same data twice.';
        }

        if ($errors !== []) {
            throw InvalidPuckDocument::because($errors);
        }

        // The root is stored as written by Puck (it carries the page-level props) minus
        // anything the server does not recognise, so a future Puck upgrade cannot smuggle
        // arbitrary keys into the database.
        $root = is_array($raw['root'] ?? null) ? $raw['root'] : [];
        $rootProps = is_array($root['props'] ?? null) ? array_filter($root['props'], is_scalar(...)) : [];

        return ['root' => ['props' => $rootProps], 'content' => $blocks];
    }

    /**
     * @param  list<array<string, mixed>>  $blocks
     * @return list<string> the ids that appear more than once
     */
    private function duplicateIds(array $blocks): array
    {
        $seen = [];
        $duplicates = [];

        foreach ($blocks as $block) {
            $id = (string) $block['props']['id'];

            if (isset($seen[$id])) {
                $duplicates[$id] = true;
            }

            $seen[$id] = true;
        }

        return array_keys($duplicates);
    }
}
