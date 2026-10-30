<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Media;

use InvalidArgumentException;

/**
 * The three sizes every product image gets, and nothing else.
 *
 * On-demand resizing is not an option on this host: 2 MB/s of sustained I/O and no image
 * service means every variant has to exist as a file before the first visitor asks for it.
 * Fixing the set at three also keeps the storage budget honest — five thousand SKUs at four
 * images each is 60 000 files, not an unbounded number that grows with every new context.
 */
enum ImageVariant: string
{
    /** Lists, cart lines, admin tables. 400 px on the long edge. */
    case Thumb = 'thumb';

    /** Grid tiles and product cards. 800 px. */
    case Card = 'card';

    /** Product hero, zoom, open-graph. 1600 px. */
    case Hero = 'hero';

    public function width(): int
    {
        return match ($this) {
            self::Thumb => 400,
            self::Card => 800,
            self::Hero => 1600,
        };
    }

    public function quality(): int
    {
        // Smaller images carry more quality because they are often shown at 1:1 on retina.
        return match ($this) {
            self::Thumb => 82,
            self::Card => 80,
            self::Hero => 76,
        };
    }

    /** @return list<self> */
    public static function all(): array
    {
        return [self::Thumb, self::Card, self::Hero];
    }

    /** @return list<string> */
    public static function filenames(string $base): array
    {
        return array_map(
            static fn (self $variant): string => $base.'-'.$variant->value.'.webp',
            self::all(),
        );
    }

    public static function fromFilename(string $filename): ?self
    {
        foreach (self::all() as $variant) {
            if (str_ends_with($filename, '-'.$variant->value.'.webp')) {
                return $variant;
            }
        }

        return null;
    }

    /**
     * Parse the srcset attribute a browser needs, in ascending width order.
     *
     * @return string e.g. "a-thumb.webp 400w, a-card.webp 800w, a-hero.webp 1600w"
     */
    public static function srcset(string $base, string $urlPrefix): string
    {
        return implode(', ', array_map(
            static fn (self $variant): string => sprintf(
                '%s/%s %dw',
                rtrim($urlPrefix, '/'),
                $base.'-'.$variant->value.'.webp',
                $variant->width(),
            ),
            self::all(),
        ));
    }
}
