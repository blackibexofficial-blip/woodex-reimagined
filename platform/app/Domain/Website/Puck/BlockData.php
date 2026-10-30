<?php

declare(strict_types=1);

namespace App\Domain\Website\Puck;

/**
 * Supplies the live data a bound block needs at render time.
 *
 * Every method returns an empty array rather than throwing when the underlying module is not
 * installed yet. That is deliberate: products exist today, showrooms and the FAQ library do
 * not. A page that uses a showroom block must still render its hero and its product grid while
 * those modules are being built, instead of 500-ing because one resolver is missing.
 *
 * Implementations are responsible for their own caching — this interface is called on every
 * render and knows nothing about TTLs.
 */
interface BlockData
{
    /**
     * @param  array<string, mixed>  $props  already normalised against the registry
     * @return list<array<string, mixed>>
     */
    public function products(array $props): array;

    /**
     * @param  array<string, mixed>  $props
     * @return list<array<string, mixed>>
     */
    public function categories(array $props): array;

    /**
     * @param  array<string, mixed>  $props
     * @return list<array<string, mixed>>
     */
    public function swatches(array $props): array;

    /**
     * @param  array<string, mixed>  $props
     * @return list<array<string, mixed>>
     */
    public function faqs(array $props): array;

    /**
     * @param  array<string, mixed>  $props
     * @return list<array<string, mixed>>
     */
    public function showrooms(array $props): array;
}
