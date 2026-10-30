<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Media;

use RuntimeException;

/**
 * Writes the three WebP sizes for one uploaded image.
 *
 * The class does the planning — validation, naming, paths, which sizes, in what order — and
 * delegates the pixels to a `Transformer`. That split exists because this logic is the part
 * that can silently corrupt a catalog and is therefore worth testing, while the pixel work is
 * a library call that either works or throws.
 *
 * Nothing here is allowed to write outside `$root`, and nothing is written until every check
 * has passed: a half-written image set is worse than a rejected upload, because the storefront
 * will render the one size that made it.
 */
final readonly class ImageStore
{
    public function __construct(
        private string $root,
        private MediaPath $paths,
        private Transformer $transformer,
    ) {}

    /**
     * @return array{ok: bool, reason: string|null, hash: string|null, files: list<string>}
     */
    public function store(string $sku, string $originalName, string $mime, string $contents): array
    {
        $check = ImageRules::check($originalName, $mime, strlen($contents));

        if (! $check['ok']) {
            return ['ok' => false, 'reason' => $check['reason'], 'hash' => null, 'files' => []];
        }

        $hash = MediaPath::hashFor($contents);
        $directory = $this->root.'/'.$this->paths->directoryFor($sku);

        if (! is_dir($directory) && ! @mkdir($directory, 0755, true) && ! is_dir($directory)) {
            throw new RuntimeException("Cannot create the image directory for [{$sku}].");
        }

        // Verify containment after the path is composed: a future change to directoryFor()
        // must not be able to write above the storage root.
        $realRoot = realpath($this->root);

        if ($realRoot === false || ! str_starts_with((string) realpath($directory), $realRoot)) {
            throw new RuntimeException('Refusing to write outside the media root.');
        }

        $written = [];
        $preexisting = [];

        try {
            foreach (ImageVariant::all() as $variant) {
                $path = $this->root.'/'.$this->paths->filePath($sku, $hash, $variant);

                // Idempotent: the same bytes already stored under the same hash are not re-encoded.
                if (is_file($path)) {
                    $preexisting[] = $path;
                    $written[] = $path;

                    continue;
                }

                $this->transformer->toWebp($contents, $variant->width(), $variant->quality(), $path);
                $written[] = $path;
            }
        } catch (\Throwable $e) {
            // Roll back every size written in this call, so a failed upload never leaves a
            // product with a thumb and a broken hero. Idempotent reuse is not affected: files
            // that already existed before this call are tracked separately and left alone.
            foreach ($written as $path) {
                if (in_array($path, $preexisting, true)) {
                    continue;
                }

                if (is_file($path)) {
                    @unlink($path);
                }
            }

            throw $e;
        }

        return ['ok' => true, 'reason' => null, 'hash' => $hash, 'files' => $written];
    }

    /**
     * Delete every size of one image. Used when a product image is replaced or removed.
     * Missing files are not an error — deletion has to be safe to retry.
     */
    public function delete(string $sku, string $hash): int
    {
        $removed = 0;

        foreach (ImageVariant::all() as $variant) {
            $path = $this->root.'/'.$this->paths->filePath($sku, $hash, $variant);

            if (is_file($path) && @unlink($path)) {
                $removed++;
            }
        }

        return $removed;
    }
}
