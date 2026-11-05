<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Api;

use Illuminate\Support\Facades\Cache;

/**
 * A generation counter for everything the storefront caches about the catalogue.
 *
 * The catalogue caches are keyed by a hash of the query (`commerce:catalog:v1:<md5>`),
 * which means there is no key to forget when a product changes — a new colour creates a
 * key that has never existed, and an edited product leaves a stale copy under a key
 * nobody can enumerate. The comment on that scheme assumed a cache that expires quickly
 * and an owner who waits; in practice an owner saves a product, reloads the shop, sees
 * the old value, and concludes the admin does not work.
 *
 * Tagged caching would solve it, but the configured store is `database`, which has no
 * tags. So: one cache entry holds a generation integer, every catalogue key includes it,
 * and bumping it makes every one of those keys unreachable in a single write. Old entries
 * expire on their own TTL.
 *
 * Reads are one extra cache hit per catalogue request. That is a fair price for an edit
 * being visible on the next page load.
 */
final class CatalogCache
{
    private const string KEY = 'commerce:catalog:generation';

    /** The current generation. Missing or unreadable means generation 1. */
    public static function generation(): int
    {
        $value = Cache::get(self::KEY);

        return is_numeric($value) ? (int) $value : 1;
    }

    /**
     * Invalidate every cached catalogue response.
     *
     * Called after anything that changes what the shop should show: an import, a
     * product save, a category move, a price change, a publish.
     */
    public static function bump(): int
    {
        // `increment` on a missing key seeds it with the increment rather than 1,
        // so the first bump lands on 2 — which is still a value no older key used.
        $next = (int) Cache::increment(self::KEY);
        if ($next <= 1) {
            $next = 2;
            Cache::forever(self::KEY, $next);
        }

        return $next;
    }

    /** Namespace a catalogue cache key with the current generation. */
    public static function key(string $suffix): string
    {
        return 'commerce:g'.self::generation().':'.$suffix;
    }
}
