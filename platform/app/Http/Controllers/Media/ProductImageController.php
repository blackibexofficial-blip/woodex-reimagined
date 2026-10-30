<?php

declare(strict_types=1);

namespace App\Http\Controllers\Media;

use App\Domain\Commerce\Media\MediaPath;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Serves product images from outside the web root.
 *
 * The images cannot live in `public_html`: the deploy replaces tracked files, and anything a
 * staff member uploads must survive a deploy. So they live in storage and are streamed through
 * this route — which means this route is public, hot, and the single place where a path a
 * stranger typed becomes a file handle. Hence the checks, in this order:
 *
 *   1. the path matches the exact shape we generate (checked in MediaPath, not here);
 *   2. the resolved file is still inside the media root, after symlinks;
 *   3. the file exists — otherwise a plain 404, no directory listing, no error detail.
 *
 * Cache headers are immutable for a year because the filename contains the content hash: the
 * bytes at a given URL can never change, so a browser that has it never asks again.
 */
final class ProductImageController
{
    public function __invoke(string $path, MediaPath $mediaPath): HttpResponse
    {
        if (! $mediaPath->isValidRequestPath($path)) {
            abort(404);
        }

        $root = storage_path('app/commerce/products');
        $file = $root.'/'.ltrim($path, '/');

        $realRoot = realpath($root);
        $realFile = realpath($file);

        if ($realRoot === false || $realFile === false) {
            abort(404);
        }

        // Containment is re-checked on the resolved path: a symlink inside storage would
        // otherwise be a way out of it.
        if (! str_starts_with($realFile, $realRoot.DIRECTORY_SEPARATOR)) {
            abort(404);
        }

        if (! is_file($realFile)) {
            abort(404);
        }

        /** @var BinaryFileResponse $response */
        $response = response()->file($realFile, [
            'Content-Type' => 'image/webp',
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ]);

        return $response;
    }
}
