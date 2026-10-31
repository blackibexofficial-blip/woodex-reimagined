<?php

declare(strict_types=1);

/**
 * Platform test runner — no Composer, no Pest, no Laravel.
 *
 *   php platform/tests/run.php              run every suite
 *   php platform/tests/run.php Money        only files matching "Money"
 *   php platform/tests/run.php --lint       syntax-check every PHP file under platform/
 *
 * Exit 0 means everything passed. The same classes run unchanged under Pest once the
 * framework is installed; this runner exists so the money pipeline, the migrations and the
 * seed data can be verified before any of that is set up — and in CI before composer runs.
 */

require __DIR__.'/bootstrap.php';

use Tests\Support\Assert;

$arguments = array_slice($argv ?? [], 1);
$arguments = array_values(array_filter($arguments, static fn ($a): bool => is_string($a)));
$lintOnly = in_array('--lint', $arguments, true);
$filter = null;

foreach ($arguments as $argument) {
    if (! str_starts_with($argument, '--')) {
        $filter = $argument;
    }
}

$root = dirname(__DIR__);
$startedAt = microtime(true);
$results = [];

// ---------------------------------------------------------------- lint ----
$lintFiles = [];
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
);

foreach ($iterator as $file) {
    if (! $file->isFile() || $file->getExtension() !== 'php') {
        continue;
    }

    if (str_contains($file->getPathname(), '/vendor/') || str_contains($file->getPathname(), '/node_modules/')) {
        continue;
    }

    $lintFiles[] = $file->getPathname();
}

sort($lintFiles);
$lintFailures = [];
$tokensChecked = 0;

foreach ($lintFiles as $file) {
    $tokensChecked++;

    $source = (string) file_get_contents($file);

    try {
        token_get_all($source, TOKEN_PARSE);
    } catch (ParseError $e) {
        $lintFailures[] = sprintf(
            '%s:%d — %s',
            str_replace($root.'/', '', $file),
            $e->getLine(),
            $e->getMessage(),
        );

        continue;
    }

    // `TOKEN_PARSE` stops at the parser; importing the same short name twice is a compiler
    // error, so it parsed cleanly and the app died on boot. It shipped past a fully green suite
    // once, which is exactly the kind of failure this lint exists to prevent — a fatal on a
    // page nobody opened during the run.
    $imported = [];

    foreach (preg_split('/\R/', $source) ?: [] as $lineNumber => $line) {
        // Only top-level `use Some\Thing;` / `use Some\Thing as Alias;` lines are imports.
        if (preg_match('/^use\s+([A-Za-z_\x80-\xff][\w\x80-\xff\\\\]*)(?:\s+as\s+(\w+))?\s*;/u', $line, $m) !== 1) {
            continue;
        }

        $short = ($m[2] ?? '') !== '' ? $m[2] : substr((string) strrchr('\\'.$m[1], '\\'), 1);

        if (isset($imported[$short])) {
            $lintFailures[] = sprintf(
                '%s:%d — %s is imported twice (first on line %d)',
                str_replace($root.'/', '', $file),
                $lineNumber + 1,
                $short,
                $imported[$short],
            );

            continue;
        }

        $imported[$short] = $lineNumber + 1;
    }
}

$results[] = [
    'label' => sprintf('Lint::allPhpFiles (%d files)', $tokensChecked),
    'assertions' => $tokensChecked,
    'failures' => $lintFailures,
];

if ($lintOnly) {
    report($results, microtime(true) - $startedAt);

    exit($lintFailures === [] ? 0 : 1);
}

// --------------------------------------------------------------- tests ----
$files = glob(__DIR__.'/*/*Test.php') ?: [];

if ($filter !== null) {
    $files = array_values(array_filter(
        $files,
        static fn (string $file): bool => stripos(basename($file), $filter) !== false,
    ));
}

sort($files);

foreach ($files as $file) {
    require_once $file;

    $suite = basename(dirname($file));
    $class = 'Tests\\'.$suite.'\\'.basename($file, '.php');

    if (! class_exists($class)) {
        fwrite(STDERR, "Class {$class} not found in {$file}\n");
        exit(1);
    }

    $instance = new $class();
    $methods = array_values(array_filter(
        get_class_methods($class),
        static fn (string $method): bool => str_starts_with($method, 'test'),
    ));

    foreach ($methods as $method) {
        Assert::reset();

        // A fresh instance per test so nothing leaks between them, then the conventional
        // setUp/tearDown hooks — which is what makes this runner behave like the framework
        // it stands in for.
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

        $results[] = [
            'label' => basename($file, '.php').'::'.$method,
            'assertions' => Assert::$count,
            'failures' => Assert::$failures,
        ];
    }
}

report($results, microtime(true) - $startedAt);

$failed = array_filter($results, static fn (array $row): bool => $row['failures'] !== []);
exit($failed === [] ? 0 : 1);

/**
 * @param  list<array{label: string, assertions: int, failures: list<string>}>  $results
 */
function report(array $results, float $seconds): void
{
    $failures = 0;

    foreach ($results as $row) {
        $ok = $row['failures'] === [];
        $colour = $ok ? "\033[32m" : "\033[31m";

        printf("%s%s\033[0m  %-62s %5d assertions\n", $colour, $ok ? 'PASS' : 'FAIL', $row['label'], $row['assertions']);

        foreach ($row['failures'] as $failure) {
            printf("      \033[31m·\033[0m %s\n", $failure);
        }

        if (! $ok) {
            $failures++;
        }
    }

    $total = count($results);
    $assertions = array_sum(array_map(static fn (array $row): int => $row['assertions'], $results));

    printf(
        "\n%s%d/%d checks passed · %d assertions · %.0f ms\033[0m\n",
        $failures === 0 ? "\033[32m" : "\033[31m",
        $total - $failures,
        $total,
        $assertions,
        $seconds * 1000,
    );
}
