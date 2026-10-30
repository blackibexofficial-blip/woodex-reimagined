<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Media;

use RuntimeException;

/**
 * WebP resizing with GD, which the Hostinger plan provides.
 *
 * Two rules enforced here rather than assumed by the caller:
 *
 *  - **Never upscale.** A 600 px photo asked for a 1600 px hero is written at 600 px. Blowing
 *    it up produces a bigger file that looks worse, and it is the kind of thing nobody
 *    notices until the same image appears in three sizes on one page.
 *  - **Always upconvert to WebP.** Even the hero is stored as WebP; the JPEG source is
 *    discarded. One format means one cache header, one CDN rule, one thing to explain.
 */
final readonly class GdTransformer implements Transformer
{
    public function toWebp(string $contents, int $maxWidth, int $quality, string $destination): void
    {
        if (! function_exists('imagecreatefromstring')) {
            throw new RuntimeException('GD is not available on this host.');
        }

        $source = @imagecreatefromstring($contents);

        if ($source === false) {
            throw new RuntimeException('The uploaded image could not be decoded.');
        }

        try {
            $width = imagesx($source);
            $height = imagesy($source);

            if ($width < 1 || $height < 1) {
                throw new RuntimeException('The uploaded image has no dimensions.');
            }

            $longest = max($width, $height);
            $target = $maxWidth > 0 ? min($maxWidth, $longest) : $longest;

            // Only resample when the image is actually larger than the requested size.
            if ($target < $longest) {
                $ratio = $target / $longest;
                $newWidth = max(1, (int) round($width * $ratio));
                $newHeight = max(1, (int) round($height * $ratio));

                $resized = imagecreatetruecolor($newWidth, $newHeight);

                // Preserve transparency for PNG sources; without this a logo on a transparent
                // background turns into a black rectangle.
                imagealphablending($resized, false);
                imagesavealpha($resized, true);
                imagecopyresampled($resized, $source, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);

                imagedestroy($source);
                $source = $resized;
            }

            if (! imagewebp($source, $destination, max(1, min(100, $quality)))) {
                throw new RuntimeException('Could not write the WebP file.');
            }
        } finally {
            if ($source instanceof \GdImage) {
                imagedestroy($source);
            }
        }
    }
}
