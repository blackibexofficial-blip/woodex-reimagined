<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domain\Commerce\Media\GdTransformer;
use App\Domain\Commerce\Media\MediaPath;
use App\Domain\Commerce\Media\Transformer;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

/**
 * Binds the commerce domain and declares its rate limiters.
 *
 * Registered once in `bootstrap/providers.php`. Nothing here touches the database or the
 * frontend; it only tells the container which implementation of `Transformer` to use and how
 * hard a stranger may hit the public catalog.
 *
 * The limits are set against the hosting reality rather than against politeness: thirty entry
 * processes on the whole account means one stuck scraper is enough to make checkout slow.
 * A real visitor loads a category page and two product pages — under sixty requests a minute
 * comfortably — so a hundred and twenty leaves room while still cutting off a crawl loop.
 */
final class CommerceServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(MediaPath::class, static fn (): MediaPath => new MediaPath);
        $this->app->singleton(Transformer::class, static fn (): Transformer => new GdTransformer);
    }

    /** Whether this request carries the staging-only probe token. */
    public static function isProbe(Request $request): bool
    {
        $expected = config('commerce.probe.token');
        $given = $request->header('X-Load-Probe');

        return is_string($expected) && $expected !== ''
            && is_string($given) && $given !== ''
            && hash_equals($expected, $given);
    }

    public function boot(): void
    {
        RateLimiter::for('storefront-catalog', static function (Request $request): Limit {
            // The load probe identifies itself with a token that only exists on a staging
            // install. Without the token it is not exempt, so a leaked command cannot be used
            // to hammer production — the limiter is the reason the probe needs this at all.
            if (self::isProbe($request)) {
                return Limit::perMinute(5000)->by('probe:'.$request->ip());
            }

            // A signed-in customer browsing their own order history is not a scraper; give
            // them more room. Everyone else shares a per-IP budget.
            $perMinute = $request->user() !== null ? 240 : 120;

            return Limit::perMinute($perMinute)->by($request->user()?->id ?: $request->ip());
        });
    }
}
