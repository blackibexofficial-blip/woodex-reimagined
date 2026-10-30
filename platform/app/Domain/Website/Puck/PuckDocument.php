<?php

declare(strict_types=1);

namespace App\Domain\Website\Puck;

/**
 * A stored page as Puck writes it, decoded and made safe to render.
 *
 * Puck's own shape is `{"root": {...}, "content": [ {type, props}, ... ]}` — a flat list of
 * top-level blocks. That flatness is the one real limitation of storing pages this way: a
 * three-column layout is a block that renders three slots, not a tree. For the pages this site
 * actually has, that is the right trade — every legacy layout fits, and the renderer stays
 * simple enough to reason about.
 *
 * This class does the untrusted-input work: anything that is not a known block is dropped,
 * props are normalised against the registry, and a malformed document yields an empty page
 * rather than an exception. A page that fails to parse should look unfinished, not take the
 * site down.
 */
final readonly class PuckDocument
{
    /** @param  list<array{type: string, props: array<string, mixed>, id: string}>  $blocks */
    public function __construct(
        public array $blocks,
        public string $title = '',
    ) {}

    public static function empty(): self
    {
        return new self([]);
    }

    /**
     * Decode stored JSON.
     *
     * @param  array<string, mixed>|string|null  $raw
     */
    public static function fromStored(array|string|null $raw, Registry $registry): self
    {
        if ($raw === null || $raw === '') {
            return self::empty();
        }

        if (is_string($raw)) {
            try {
                $raw = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                return self::empty();
            }
        }

        if (! is_array($raw)) {
            return self::empty();
        }

        $content = $raw['content'] ?? null;

        if (! is_array($content)) {
            return self::empty();
        }

        $blocks = [];
        $position = 0;

        foreach ($content as $item) {
            if (! is_array($item) || ! isset($item['type']) || ! is_string($item['type'])) {
                continue;
            }

            // An unknown block is not an error to surface to a visitor: it means a page was
            // saved with a component that has since been removed, and skipping it renders the
            // rest of the page correctly.
            if (! $registry->has($item['type'])) {
                continue;
            }

            $props = is_array($item['props'] ?? null) ? $item['props'] : [];

            $blocks[] = [
                'type' => $item['type'],
                'props' => $registry->normalizeProps($item['type'], $props),
                // 1-based so the generated anchor reads `cta-1`, not `cta-0`.
                'id' => is_string($item['props']['id'] ?? null)
                    ? $item['props']['id']
                    : $item['type'].'-'.($position + 1),
            ];

            $position++;
        }

        return new self($blocks, is_string($raw['title'] ?? null) ? $raw['title'] : '');
    }

    public function isEmpty(): bool
    {
        return $this->blocks === [];
    }

    public function count(): int
    {
        return count($this->blocks);
    }

    /** @return list<string> the block types used, in order — used by the cache key */
    public function signature(): string
    {
        return implode(',', array_map(static fn (array $block): string => $block['type'], $this->blocks));
    }
}
