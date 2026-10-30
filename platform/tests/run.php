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

    try {
        token_get_all((string) file_get_contents($file), TOKEN_PARSE);
    } catch (ParseError $e) {
        $lintFailures[] = sprintf(
            '%s:%d — %s',
            str_replace($root.'/', '', $file),
            $e->getLine(),
            $e->getMessage(),
        );
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
        get_class_methods($instance),
        static fn (string $method): bool => str_starts_with($method, 'test'),
    ));

    foreach ($methods as $method) {
        Assert::reset();

        try {
            $instance->{$method}();
        } catch (Throwable $e) {
            Assert::fail(sprintf('threw %s: %s', $e::class, $e->getMessage()));
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
