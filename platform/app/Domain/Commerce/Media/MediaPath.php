<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Media;

use InvalidArgumentException;

/**
 * Where a product image lives on disk and how its URL is built.
 *
 * The path is deliberately boring and completely predictable:
 *
 *     storage/app/commerce/products/{sku-slug}/{hash}-{variant}.webp
 *
 * Predictable because the host has no image service and no CDN: the file either exists at a
 * known path or it does not. Boring because a path is the one thing that cannot be fixed
 * later without breaking every cached URL in every browser.
 *
 * Uploads never carry the user's filename into the path — that is how a "photo.jpg" becomes
 * "../../.env". The hash of the content is the name, so re-uploading the same file is free
 * and two products can share an image without duplicating bytes.
 */
final readonly class MediaPath
{
    /** Characters allowed in the directory segment derived from a SKU. */
    private const string SAFE = '/[^a-z0-9]+/';

    public function __construct(
        private string $baseDirectory = 'commerce/products',
        private string $urlPrefix = '/media/products',
    ) {}

    /**
     * The directory for one product, derived from its SKU.
     *
     * SKUs are authored by staff, so this is the boundary where they stop being trusted:
     * anything that is not a-z0-9 becomes a dash, and the result can never traverse upward.
     */
    public function directoryFor(string $sku): string
    {
        $slug = trim((string) preg_replace(self::SAFE, '-', strtolower($sku)), '-');

        if ($slug === '') {
            throw new InvalidArgumentException("Cannot derive a storage directory from SKU [{$sku}].");
        }

        // Two SKUs that slug to the same thing would share a folder; the hash in the filename
        // keeps their files distinct, so this is safe — but the length is capped so a pasted
        // sentence in the SKU field cannot blow a path length.
        $slug = substr($slug, 0, 64);

        return $this->baseDirectory.'/'.$slug;
    }

    /** Absolute path on disk for one size of one image. Never inside public_html. */
    public function filePath(string $sku, string $hash, ImageVariant $variant): string
    {
        return $this->directoryFor($sku).'/'.$hash.'-'.$variant->value.'.webp';
    }

    /** Public URL for one size. Served by an allow-listed route, not by the web server. */
    public function url(string $sku, string $hash, ImageVariant $variant): string
    {
        return sprintf(
            '%s/%s/%s-%s.webp',
            rtrim($this->urlPrefix, '/'),
            $this->slugFor($sku),
            $hash,
            $variant->value,
        );
    }

    public function srcset(string $sku, string $hash): string
    {
        return ImageVariant::srcset($hash, rtrim($this->urlPrefix, '/').'/'.$this->slugFor($sku));
    }

    /**
     * Validate a request path before it is resolved to a file.
     *
     * The route that serves images is public, so this is the check that stops
     * `/media/products/../../.env`. Everything is rejected unless it matches the exact shape
     * this class produces: {slug}/{hash}-{variant}.webp, lowercase hex hash, known variant.
     */
    public function isValidRequestPath(string $path): bool
    {
        $path = ltrim($path, '/');

        if (preg_match('#^[a-z0-9-]{1,64}/([a-f0-9]{8,64})-(thumb|card|hero)\.webp$#', $path) !== 1) {
            return false;
        }

        // Belt and braces: no traversal sequence can survive the pattern above, but a future
        // edit to the pattern should not reintroduce one silently.
        return ! str_contains($path, '..') && ! str_contains($path, '//');
    }

    /** Only the content hash is ever exposed; the original upload name is not stored in the URL. */
    public static function hashFor(string $contents): string
    {
        return substr(hash('sha256', $contents), 0, 32);
    }

    private function slugFor(string $sku): string
    {
        return basename($this->directoryFor($sku));
    }
}
