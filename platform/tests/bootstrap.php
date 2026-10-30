<?php

declare(strict_types=1);

/**
 * Zero-dependency bootstrap for the commerce domain tests.
 *
 * The domain classes are framework-free on purpose, so they can be executed with nothing
 * but a PHP binary — which is exactly what CI does before Composer/Pest is involved, and
 * what makes the money pipeline testable anywhere.
 */

$root = dirname(__DIR__);

spl_autoload_register(static function (string $class) use ($root): void {
    $prefix = 'App\\Domain\\Commerce\\';

    if (! str_starts_with($class, $prefix)) {
        return;
    }

    $relative = str_replace('\\', '/', substr($class, strlen($prefix)));
    $path = $root.'/app/Domain/Commerce/'.$relative.'.php';

    if (is_file($path)) {
        require_once $path;
    }
});

require_once __DIR__.'/Support/Assert.php';
require_once __DIR__.'/Support/FixtureFactory.php';
