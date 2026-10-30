<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domain\Website\Puck\BlockData;
use App\Domain\Website\Puck\CatalogBlockData;
use App\Domain\Website\Puck\PageComposer;
use App\Domain\Website\Puck\PageWriter;
use App\Domain\Website\Puck\Registry;
use Illuminate\Support\ServiceProvider;

/**
 * Binds the website module.
 *
 * Registered once in `bootstrap/providers.php`, next to CommerceServiceProvider.
 *
 * The registry is a singleton because it parses one JSON file and the file cannot change while
 * a request is running — reading it per block would mean eight parses for an eight-block page.
 *
 * `BlockData` is an interface so the composer can be proven with a fake, and so the day the
 * catalog moves behind an HTTP call or the showrooms module arrives, the pages do not change.
 */
final class WebsiteServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(Registry::class);
        $this->app->singleton(PageWriter::class);

        $this->app->bind(BlockData::class, CatalogBlockData::class);
        $this->app->bind(PageComposer::class);
    }
}
