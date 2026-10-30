<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Media;

/**
 * Turns image bytes into one resized WebP file.
 *
 * An interface for two reasons: the imaging extension differs between hosts (GD is the
 * baseline, Imagick is better when present), and the planning logic in ImageStore can then be
 * tested on a machine with neither — which is exactly the machine this code was written on.
 */
interface Transformer
{
    /**
     * @param  string  $contents  raw bytes of the source image
     * @param  int  $maxWidth  longest edge, 0 means "do not upscale, keep as is"
     * @param  int  $quality  0–100
     * @param  string  $destination  absolute path to write
     *
     * @throws \RuntimeException when the source cannot be decoded or the write fails
     */
    public function toWebp(string $contents, int $maxWidth, int $quality, string $destination): void;
}
