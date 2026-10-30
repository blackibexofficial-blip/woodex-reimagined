<?php

declare(strict_types=1);

namespace App\Domain\Website\Puck;

use InvalidArgumentException;
use RuntimeException;

/**
 * The block registry — the contract between the editor and the renderer.
 *
 * `resources/js/studio/registry.json` is the single source of truth. It is **not** a build
 * artefact: generating it from TypeScript would mean a stale copy can ship whenever the build
 * step is skipped, and the editor and the server would silently disagree about what a block
 * accepts. One committed file, read by both sides, cannot drift.
 *
 * Framework-free on purpose, so the whole contract can be verified without booting Laravel.
 */
final class Registry
{
    public const string FILE = '/resources/js/studio/registry.json';

    private const string BLOCK_NAME = '/^[a-z][a-zA-Z0-9]*$/';

    /** @var array<string, array<string, mixed>>|null */
    private static ?array $blocks = null;

    private readonly string $root;

    public function __construct(?string $root = null)
    {
        $this->root = $root ?? dirname(__DIR__, 4);
    }

    /**
     * @return array<string, array<string, mixed>> keyed by block name
     */
    public function blocks(): array
    {
        if (self::$blocks !== null) {
            return self::$blocks;
        }

        $path = $this->root.self::FILE;

        if (! is_file($path)) {
            throw new RuntimeException('The Puck block registry is missing at '.$path.'.');
        }

        $decoded = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $blocks = $decoded['blocks'] ?? null;

        if (! is_array($blocks) || $blocks === []) {
            throw new RuntimeException('The Puck block registry declares no blocks.');
        }

        foreach ($blocks as $name => $block) {
            $this->assertBlockShape((string) $name, $block);
        }

        /** @var array<string, array<string, mixed>> $blocks */
        self::$blocks = $blocks;

        return $blocks;
    }

    /** @return list<string> every declared block name, in file order */
    public function names(): array
    {
        return array_keys($this->blocks());
    }

    public function has(string $name): bool
    {
        return array_key_exists($name, $this->blocks());
    }

    /** @return array<string, mixed> */
    public function block(string $name): array
    {
        $blocks = $this->blocks();

        if (! array_key_exists($name, $blocks)) {
            throw new InvalidArgumentException("Unknown Puck block [{$name}].");
        }

        return $blocks[$name];
    }

    /** @return array<string, mixed> name => default value */
    public function defaults(string $name): array
    {
        $defaults = [];

        foreach ($this->block($name)['fields'] as $field => $definition) {
            $defaults[$field] = $definition['default'] ?? null;
        }

        return $defaults;
    }

    public function isBound(string $name): bool
    {
        return ($this->block($name)['bind'] ?? false) === true;
    }

    /**
     * Coerce arbitrary props against the registry: unknown keys are dropped, missing keys
     * receive their default, and values are cast to their declared type.
     *
     * Dropping unknown keys matters more than it looks. Without it, a renamed field in the
     * editor leaves the old key in every stored page forever, and the renderer keeps reading
     * a value nobody edits any more — the page looks right and cannot be changed.
     *
     * @param  array<string, mixed>  $props
     * @return array<string, mixed>
     */
    public function normalizeProps(string $name, array $props): array
    {
        $block = $this->block($name);
        $normalized = [];

        foreach ($block['fields'] as $field => $definition) {
            $type = $definition['type'] ?? 'text';
            $has = array_key_exists($field, $props);
            $value = $has ? $props[$field] : ($definition['default'] ?? null);

            $normalized[$field] = match ($type) {
                'number' => $this->clampNumber($value, $definition),
                'boolean' => $this->toBool($value),
                'select' => $this->oneOf($value, $definition['options'] ?? [], $definition['default'] ?? ''),
                default => is_scalar($value) ? (string) $value : '',
            };
        }

        return $normalized;
    }

    private function clampNumber(mixed $value, array $definition): int
    {
        $number = is_numeric($value) ? (int) $value : (int) ($definition['default'] ?? 0);
        $min = isset($definition['min']) ? (int) $definition['min'] : null;
        $max = isset($definition['max']) ? (int) $definition['max'] : null;

        if ($min !== null && $number < $min) {
            $number = $min;
        }

        if ($max !== null && $number > $max) {
            $number = $max;
        }

        return $number;
    }

    /** @param  list<string>  $options */
    private function oneOf(mixed $value, array $options, mixed $default): string
    {
        $candidate = is_scalar($value) ? (string) $value : '';

        if ($options !== [] && ! in_array($candidate, $options, true)) {
            return is_scalar($default) ? (string) $default : (string) ($options[0] ?? '');
        }

        return $candidate;
    }

    private function toBool(mixed $value): bool
    {
        return in_array($value, [true, 1, '1', 'true', 'on'], true);
    }

    /** @param  array<string, mixed>  $block */
    private function assertBlockShape(string $name, mixed $block): void
    {
        if (preg_match(self::BLOCK_NAME, $name) !== 1) {
            throw new RuntimeException("Block name [{$name}] must be camelCase.");
        }

        if (! is_array($block)) {
            throw new RuntimeException("Block [{$name}] must be an object.");
        }

        foreach (['label', 'group', 'fields'] as $required) {
            if (! array_key_exists($required, $block)) {
                throw new RuntimeException("Block [{$name}] is missing [{$required}].");
            }
        }

        if (! is_array($block['fields']) || $block['fields'] === []) {
            throw new RuntimeException("Block [{$name}] declares no fields.");
        }

        foreach ($block['fields'] as $field => $definition) {
            if (preg_match(self::BLOCK_NAME, (string) $field) !== 1) {
                throw new RuntimeException("Field [{$name}.{$field}] must be camelCase.");
            }

            if (! is_array($definition) || ! isset($definition['type'])) {
                throw new RuntimeException("Field [{$name}.{$field}] declares no type.");
            }
        }
    }

    /** Test helper: forget the memoised registry so a changed file is re-read. */
    public static function flush(): void
    {
        self::$blocks = null;
    }
}
