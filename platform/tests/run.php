<?php

declare(strict_types=1);

/**
 * Commerce test runner — no Composer, no Pest, no Laravel.
 *
 *   php platform/tests/run.php            run everything in tests/Commerce
 *   php platform/tests/run.php Money      run matching files only
 *
 * Exit code 0 means every assertion passed. This is the same suite Pest runs in the OS;
 * here it must work before the framework is installed, because the money pipeline is the
 * first thing built and the last thing allowed to be wrong.
 */

require __DIR__.'/bootstrap.php';

use Tests\Support\Assert;

$filter = $argv[1] ?? null;
$files = glob(__DIR__.'/Commerce/*Test.php') ?: [];

if ($filter !== null) {
    $files = array_values(array_filter(
        $files,
        static fn (string $file): bool => stripos(basename($file), $filter) !== false,
    ));
}

if ($files === []) {
    fwrite(STDERR, "No test files found.\n");
    exit(1);
}

sort($files);

$startedAt = microtime(true);
$tests = 0;
$failedTests = 0;
$output = [];

foreach ($files as $file) {
    require_once $file;

    $class = 'Tests\\Commerce\\'.basename($file, '.php');

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
        $tests++;
        Assert::reset();

        $before = Assert::$failures;

        try {
            $instance->{$method}();
        } catch (Throwable $e) {
            Assert::fail(sprintf('%s threw %s: %s', $method, $e::class, $e->getMessage()));
        }

        $failures = array_slice(Assert::$failures, count($before));
        $label = sprintf('%s::%s', basename($file, '.php'), $method);
        $assertions = Assert::$count;

        if ($failures === []) {
            $output[] = ['PASS', $label, $assertions, []];
        } else {
            $failedTests++;
            $output[] = ['FAIL', $label, $assertions, $failures];
        }
    }
}

$elapsed = (microtime(true) - $startedAt) * 1000;

foreach ($output as [$status, $label, $assertions, $failures]) {
    $colour = $status === 'PASS' ? "\033[32m" : "\033[31m";
    printf("%s%s\033[0m  %-58s %4d assertions\n", $colour, $status, $label, $assertions);

    foreach ($failures as $failure) {
        printf("      \033[31m·\033[0m %s\n", $failure);
    }
}

$passed = $tests - $failedTests;

printf(
    "\n%s%d/%d tests passed · %d assertions · %.0f ms\033[0m\n",
    $failedTests === 0 ? "\033[32m" : "\033[31m",
    $passed,
    $tests,
    array_sum(array_map(static fn (array $row): int => $row[2], $output)),
    $elapsed,
);

exit($failedTests === 0 ? 0 : 1);
