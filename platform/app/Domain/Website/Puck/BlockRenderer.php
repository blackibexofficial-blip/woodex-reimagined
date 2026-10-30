<?php

declare(strict_types=1);

namespace App\Domain\Website\Puck;

use Illuminate\Contracts\View\Factory as ViewFactory;

/**
 * Turns validated block props into HTML.
 *
 * One Blade view per block, named after the block: `puck.blocks.product-grid`. The parity test
 * proves every registry entry has one, because a missing view is a page that renders an
 * exception — and it is the single most likely thing to break when a block is added in a hurry.
 *
 * Rendering is intentionally server-side. The marketing pages have to be indexable and fast
 * without JavaScript, and this host has no Node process to hydrate with.
 */
final readonly class BlockRenderer
{
    public function __construct(private ViewFactory $views) {}

    /**
     * @param  array{type: string, props: array<string, mixed>, id: string}  $block
     * @param  array<string, mixed>  $data  view variables supplied by the page composer
     */
    public function render(array $block, array $data = []): string
    {
        return (string) $this->views->make(self::viewPath($block['type']), [
            'props' => $block['props'],
            'blockId' => $block['id'],
        ] + $data)->render();
    }

    /**
     * @param  array<string, array<string, mixed>>  $data  block id => view variables
     */
    public function renderDocument(PuckDocument $document, array $data = []): string
    {
        $html = '';

        foreach ($document->blocks as $block) {
            $html .= $this->render($block, $data[$block['id']] ?? []);
        }

        return $html;
    }

    /**
     * `productGrid` → `product-grid`, so view file names stay kebab-case like the rest of
     * the codebase while the registry stays camelCase like the Puck config.
     */
    public static function viewName(string $blockType): string
    {
        return strtolower((string) preg_replace('/(?<!^)[A-Z]/', '-$0', $blockType));
    }

    /** Blade view name for a block type — used by the parity test. */
    public static function viewPath(string $blockType): string
    {
        return 'puck.blocks.'.self::viewName($blockType);
    }
}
