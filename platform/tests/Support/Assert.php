<?php

declare(strict_types=1);

namespace Tests\Support;

use Throwable;

/**
 * The smallest assertion surface that still produces a readable failure.
 * Deliberately not PHPUnit: the money pipeline must be runnable before the test
 * framework is installed, and after it is, these classes stay as the executable spec.
 */
final class Assert
{
    public static int $count = 0;

    /** @var list<string> */
    public static array $failures = [];

    public static string $context = '';

    public static function same(mixed $expected, mixed $actual, string $message = ''): void
    {
        self::$count++;

        if ($expected === $actual) {
            return;
        }

        self::fail(sprintf(
            '%s — expected %s, got %s',
            $message !== '' ? $message : 'values differ',
            self::render($expected),
            self::render($actual),
        ));
    }

    public static function true(bool $condition, string $message = ''): void
    {
        self::same(true, $condition, $message !== '' ? $message : 'expected true');
    }

    public static function trueWith(bool $condition, callable $detail, string $message = ''): void
    {
        self::$count++;

        if ($condition) {
            return;
        }

        self::fail(($message !== '' ? $message.' — ' : '').$detail());
    }

    public static function throws(string $expectedClass, callable $callback, string $message = ''): void
    {
        self::$count++;

        try {
            $callback();
        } catch (Throwable $e) {
            if ($e instanceof $expectedClass) {
                return;
            }

            self::fail(sprintf('%s — expected %s, got %s: %s', $message, $expectedClass, $e::class, $e->getMessage()));

            return;
        }

        self::fail(sprintf('%s — expected %s, nothing was thrown', $message, $expectedClass));
    }

    public static function fail(string $message): void
    {
        self::$failures[] = self::$context !== '' ? self::$context.' → '.$message : $message;
    }

    public static function reset(): void
    {
        self::$count = 0;
        self::$failures = [];
        self::$context = '';
    }

    private static function render(mixed $value): string
    {
        return match (true) {
            is_string($value) => "'".$value."'",
            is_bool($value) => $value ? 'true' : 'false',
            is_null($value) => 'null',
            is_array($value) => json_encode($value, JSON_UNESCAPED_SLASHES) ?: 'array',
            default => (string) $value,
        };
    }
}
