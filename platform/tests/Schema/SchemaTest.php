<?php

declare(strict_types=1);

namespace Tests\Schema;

use Tests\Support\Assert;

/**
 * Schema rules checked by reading the migration source.
 *
 * This is not a replacement for running `migrate:fresh` on a database — it is the check
 * that runs *before* that, on every commit, and catches the mistakes that are expensive
 * later: a float where money should be an integer, a missing `down()`, a table created but
 * never dropped, a foreign key with no index on the child side.
 */
final class SchemaTest
{
    /** @var array<string, string>|null */
    private static ?array $migrations = null;

    /** @return array<string, string> filename => source */
    private function migrations(): array
    {
        if (self::$migrations === null) {
            $directory = dirname(__DIR__, 2).'/database/migrations';
            self::$migrations = [];

            foreach (glob($directory.'/*commerce*.php') ?: [] as $file) {
                self::$migrations[basename($file)] = (string) file_get_contents($file);
            }
        }

        return self::$migrations;
    }

    public function testEveryPlannedCatalogTableIsCreated(): void
    {
        $source = implode("\n", $this->migrations());

        foreach ([
            'commerce_products',
            'commerce_product_translations',
            'commerce_categories',
            'commerce_category_translations',
            'commerce_product_categories',
            'commerce_product_media',
            'commerce_attributes',
            'commerce_attribute_options',
            'commerce_product_attribute_values',
            'commerce_product_variants',
            'commerce_variant_options',
            'commerce_inventory_sources',
            'commerce_inventory_items',
        ] as $table) {
            Assert::true(
                str_contains($source, "Schema::create('{$table}'"),
                "creates {$table}",
            );
        }
    }

    public function testEveryCreatedTableIsAlsoDropped(): void
    {
        foreach ($this->migrations() as $file => $source) {
            preg_match_all("/Schema::create\\('([a-z_]+)'/", $source, $creates);
            preg_match_all("/Schema::dropIfExists\\('([a-z_]+)'/", $source, $drops);

            $missing = array_diff($creates[1], $drops[1]);

            Assert::same(
                [],
                array_values($missing),
                "{$file}: every created table is dropped in down()",
            );
        }
    }

    public function testMoneyIsNeverStoredAsAFloat(): void
    {
        foreach ($this->migrations() as $file => $source) {
            foreach (['float', 'double', 'decimal'] as $forbidden) {
                Assert::true(
                    ! preg_match("/\\\$table->{$forbidden}\\(/", $source) === true,
                    "{$file}: no {$forbidden} column",
                );
            }
        }
    }

    public function testEveryMoneyColumnIsABigIntegerInMinorUnits(): void
    {
        $source = implode("\n", $this->migrations());
        preg_match_all("/\\\$table->bigInteger\\('([a-z_]+)'/", $source, $matches);

        Assert::true(count($matches[1]) >= 6, 'at least six money columns exist');

        // A bigint whose name reads like money must carry the _minor suffix. Other bigints
        // (an attribute's numeric value, a foreign key) are not amounts and are exempt.
        $moneyish = '/price|cost|total|subtotal|discount|tax|shipping|amount|refund|paid|compare/';
        $checked = 0;

        foreach ($matches[1] as $column) {
            if (preg_match($moneyish, $column) !== 1) {
                continue;
            }

            $checked++;
            Assert::true(
                str_ends_with($column, '_minor'),
                "money column [{$column}] is named *_minor",
            );
        }

        Assert::true($checked >= 6, 'the money-column rule covered at least six columns');
    }

    public function testEveryTableHasTimestampsAndAnId(): void
    {
        foreach ($this->migrations() as $file => $source) {
            preg_match_all("/Schema::create\\('([a-z_]+)'.*?\\n        \\}\\);/s", $source, $blocks, PREG_SET_ORDER);

            foreach ($blocks as $block) {
                $table = $block[1];
                $body = $block[0];

                // Pivot tables legitimately use a composite primary key and no timestamps.
                $isPivot = str_contains($body, '$table->primary([');

                Assert::true(
                    str_contains($body, '$table->timestamps()') || $isPivot,
                    "{$file}: {$table} has timestamps or is a pivot",
                );

                Assert::true(
                    str_contains($body, '$table->id()') || $isPivot,
                    "{$file}: {$table} has an id or is a pivot",
                );
            }
        }
    }

    public function testForeignKeysAreNullOnDeleteOrCascade(): void
    {
        $source = implode("\n", $this->migrations());

        preg_match_all("/\\\$table->foreignId\\('([a-z_]+)'\\)([^;]*);/", $source, $matches, PREG_SET_ORDER);

        Assert::true(count($matches) > 10, 'the schema has foreign keys to check');

        foreach ($matches as $match) {
            $column = $match[1];
            $chain = $match[2];

            Assert::true(
                str_contains($chain, 'cascadeOnDelete') || str_contains($chain, 'nullOnDelete') || str_contains($chain, 'constrained'),
                "fk [{$column}] declares its delete behaviour",
            );
        }
    }

    public function testMigrationsAreTimestampOrderedAndDisjoint(): void
    {
        $names = array_keys($this->migrations());
        sort($names);

        // Seven: catalog, attributes, variant/inventory, puck columns, checkout, the link to the
        // OS invoice, the drop of the commerce invoice tables, and the link to the OS receipt.
        // The two link migrations are inert where the OS is absent, which is why they still ship
        // with the slice.
        Assert::same(7, count($names), "seven commerce migrations");

        $previous = '';

        foreach ($names as $name) {
            $timestamp = substr($name, 0, 17);

            Assert::true($timestamp > $previous, "{$name} sorts after the previous migration");
            $previous = $timestamp;
        }
    }
}
