<?php

declare(strict_types=1);

/**
 * The storefront suite on its own: `platform/tests/Site/*Test.php`.
 *
 * `run.php` filters by file *name*, and the OS ships `tests/Feature/InstalledSiteFixtureTest.php` — so
 * `run.php Site` inside a real checkout picks up a Laravel feature test that this runner cannot execute.
 * This runs exactly one directory, which is what the storefront work is measured by.
 *
 *   php platform/tests/run-site.php          every Site test
 *   php platform/tests/run-site.php NotFound only files matching "NotFound"
 *
 * No Composer, no Pest, no framework: the same classes run unchanged under Pest once it is installed.
 */

require __DIR__.'/bootstrap.php';

/*
 * The Laravel autoloader, when there is one.
 *
 * Some of these tests touch a real class — Eloquent's model, the publish command — because that is the thing
 * being tested: a publisher that composes an offer from the database. In a checkout with `vendor/` installed
 * the classes resolve; in a bare slice (or the php-wasm harness before setup.sh has filled vendor/) they do not,
 * and those tests fail loudly rather than passing vacuously.
 */
$autoload = dirname(__DIR__).'/vendor/autoload.php';

if (is_file($autoload)) {
    require_once $autoload;
}

use Tests\Support\Assert;

$filter = null;

foreach (array_slice($argv ?? [], 1) as $argument) {
    if (is_string($argument) && ! str_starts_with($argument, '--')) {
        $filter = $argument;
    }
}

$startedAt = microtime(true);
$files = glob(__DIR__.'/Site/*Test.php') ?: [];

if ($filter !== null) {
    $files = array_values(array_filter($files, static fn (string $file): bool => stripos(basename($file), $filter) !== false));
}

sort($files);

$results = [];
$failures = 0;

foreach ($files as $file) {
    require_once $file;

    $class = 'Tests\\Site\\'.basename($file, '.php');

    if (! class_exists($class)) {
        fwrite(STDERR, "Class {$class} not found in {$file}\n");
        exit(1);
    }

    $methods = array_values(array_filter(
        get_class_methods($class),
        static fn (string $method): bool => str_starts_with($method, 'test'),
    ));

    foreach ($methods as $method) {
        Assert::reset();

        // A fresh instance per test, so nothing leaks between them — then the conventional
        // setUp/tearDown hooks, which is what makes this behave like the framework it stands in for.
        $case = new $class();

        try {
            if (method_exists($case, 'setUp')) {
                $case->setUp();
            }

            $case->{$method}();
        } catch (Throwable $e) {
            Assert::fail(sprintf('threw %s: %s', $e::class, $e->getMessage()));
        } finally {
            try {
                if (method_exists($case, 'tearDown')) {
                    $case->tearDown();
                }
            } catch (Throwable) {
                // A failing teardown must not mask a passing test.
            }
        }

        $label = basename($file, '.php').'::'.$method;
        $ok = Assert::$failures === [];

        printf("%s%s\033[0m  %-58s %5d assertions\n", $ok ? "\033[32m" : "\033[31m", $ok ? 'PASS' : 'FAIL', $label, Assert::$count);

        foreach (Assert::$failures as $failure) {
            printf("      \033[31m·\033[0m %s\n", $failure);
        }

        if (! $ok) {
            $failures++;
        }

        $results[] = ['assertions' => Assert::$count];
    }
}

$total = count($results);
$assertions = array_sum(array_map(static fn (array $row): int => $row['assertions'], $results));

printf(
    "\n%s%d passed · %d failed · %d assertions · %.0f ms\033[0m\n",
    $failures === 0 ? "\033[32m" : "\033[31m",
    $total - $failures,
    $failures,
    $assertions,
    (microtime(true) - $startedAt) * 1000,
);

exit($failures === 0 ? 0 : 1);
