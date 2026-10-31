<?php

declare(strict_types=1);

namespace Tests;

/**
 * Base class for suite classes that want the shared setup without inheriting it into the
 * global namespace. Kept deliberately empty: the runner instantiates each test class and
 * calls its `test*` methods, so there is nothing to inherit except a place to put helpers.
 */
abstract class TestCase
{
    /**
     * A file from the frontend, addressed the way the repository lays it out.
     *
     * `platform/` is self-contained — the sandbox runner bundles only that directory into PHP's
     * virtual filesystem, which is why every other test here reads PHP, Blade and JSON. A test
     * that wants to prove something about `src/` would therefore pass vacuously there, and a
     * vacuous test is worse than none.
     *
     * So the runner also stages the frontend at `/repo/src`, and this resolves to the real
     * checkout first and the staged copy second. Returns null when neither exists, so a caller
     * can fail loudly rather than assert against an empty string.
     */
    protected static function sitePath(string $relative): ?string
    {
        // Two roots, in both worlds:
        //   repo-root-relative     ('src/...', 'platform/...')
        //   platform-relative      ('app/...', 'database/...', 'resources/...')
        //
        // On disk that is dirname(__DIR__, 2) and dirname(__DIR__). In the wasm runner the
        // frontend is staged at /repo and the platform at /app, so both forms are tried there
        // too — and /app is the platform root, which is why a platform-relative path repeats
        // 'app/' under it.
        $bases = [
            '/repo',                 // staged repo root
            dirname(__DIR__, 2),     // real repo root
            '/app',                  // staged platform root
            dirname(__DIR__),        // real platform root
        ];

        foreach ($bases as $base) {
            $candidate = rtrim($base, '/').'/'.ltrim($relative, '/');

            if (is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }
}
