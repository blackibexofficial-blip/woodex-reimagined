<?php

declare(strict_types=1);

namespace App\Http\Controllers\Site;

use App\Domain\Commerce\Media\MediaPath;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * Serves a product photograph, at the URL the catalogue already advertises.
 *
 * `ProductCard` has been emitting `/media/products/{sku}/{hash}-{variant}.webp` since the catalogue was
 * built — and nothing answered that address, because the file store and the route that publishes it were
 * never both finished. Every card in the shop therefore carried `"image": null`.
 *
 * The files live outside the web root (`storage/app/public/commerce/products/...`), so they are streamed
 * here rather than linked directly: a stored filename is never trusted as a path, and the three sizes are
 * already made at upload time — this host cannot resize on demand.
 */
final class ProductImageController
{
    /** The file name the catalogue composes: `{32 hex}-{variant}.webp`. */
    private const string SHAPE = '/^[a-f0-9]{8,64}-(thumb|card|hero)\.webp$/';

    public function __invoke(string $sku, string $file): Response
    {
        // The name is composed by MediaPath, so anything else is not ours to serve.
        abort_unless(preg_match(self::SHAPE, $file) === 1, 404);

        $paths = new MediaPath;
        // directoryFor() slugifies the SKU itself, so a traversal attempt cannot escape the folder.
        $path = $paths->directoryFor($sku).'/'.$file;

        $disk = Storage::disk('public');

        abort_unless($disk->exists($path), 404);

        return $disk->response($path, null, [
            'Content-Type' => 'image/webp',
            // The hash in the name is the content hash: the bytes behind a URL never change.
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ])->setEtag(md5($path));
    }
}
