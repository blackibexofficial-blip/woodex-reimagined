<?php

declare(strict_types=1);

namespace Tests\Catalog;

use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The storefront's offline palette and the catalogue's vocabulary are the same list.
 *
 * The Materials page spent a year advertising six wood finishes while the finished catalog had
 * one, and the only reason nobody noticed is that the page never read the catalog at all. The
 * page now reads `GET /materials`; this test covers the other half, the bundled snapshot it
 * falls back to when the API is unreachable, because an offline page that promises "Sheesham"
 * is the same lie with a different cause.
 *
 * It also pins the page's own source. A test that only checked data would pass while the page
 * went back to typing "Choose from 6 premium wood finishes" into a heading.
 */
final class MaterialVocabularyTest extends TestCase
{
    /** @var list<array{code: string, label: string, hex: ?string}> */
    private array $catalog = [];

    /** @var list<array{code: string, label: string, hex: ?string}> */
    private array $snapshot = [];

    public function setUp(): void
    {
        $seed = json_decode(
            (string) file_get_contents(dirname(__DIR__, 2).'/database/seeders/data/catalog.json'),
            true,
        );

        $this->catalog = $this->flattenSeed($seed['attributes'] ?? []);
        $this->snapshot = $this->flattenSnapshot($this->source('src/data/materialSnapshot.ts'));
    }

    /** The frontend file, or a failure that names it — never a silent empty string. */
    private function source(string $relative): string
    {
        $path = self::sitePath($relative);

        Assert::same(true, $path !== null, "cannot read {$relative}");

        return (string) file_get_contents((string) $path);
    }

    /** @param list<array<string, mixed>> $attributes */
    private function flattenSeed(array $attributes): array
    {
        $flat = [];

        foreach ($attributes as $attribute) {
            foreach ($attribute['options'] ?? [] as $option) {
                $flat[] = [
                    'code' => (string) $option['code'],
                    'label' => (string) $option['label'],
                    'hex' => isset($option['hex']) ? strtoupper((string) $option['hex']) : null,
                ];
            }
        }

        return $flat;
    }

    /** @return list<array{code: string, label: string, hex: ?string}> */
    private function flattenSnapshot(string $source): array
    {
        preg_match_all(
            '/\{ code: "([a-z0-9-]+)", label: "([^"]+)", hex: (null|"#[0-9A-Fa-f]{6}")/',
            $source,
            $matches,
            PREG_SET_ORDER,
        );

        return array_map(static fn (array $match): array => [
            'code' => $match[1],
            'label' => $match[2],
            'hex' => $match[3] === 'null' ? null : strtoupper(trim($match[3], '"')),
        ], $matches);
    }

    public function testTheSnapshotHasEveryCatalogOption(): void
    {
        $snapshotCodes = array_column($this->snapshot, 'code');
        $catalogCodes = array_column($this->catalog, 'code');

        sort($snapshotCodes);
        sort($catalogCodes);

        Assert::same($catalogCodes, $snapshotCodes, 'the offline palette is missing or invents an option');
    }

    public function testLabelsAndColoursMatchTheSeed(): void
    {
        $byCode = [];

        foreach ($this->snapshot as $option) {
            $byCode[$option['code']] = $option;
        }

        foreach ($this->catalog as $option) {
            Assert::same(true, isset($byCode[$option['code']]), "no snapshot row for {$option['code']}");
            Assert::same($option['label'], $byCode[$option['code']]['label'], "label drift on {$option['code']}");
            Assert::same($option['hex'], $byCode[$option['code']]['hex'], "colour drift on {$option['code']}");
        }
    }

    public function testTheSnapshotParsedAtAll(): void
    {
        // A regex that silently matches nothing would make every assertion above vacuously true.
        Assert::same(17, count($this->snapshot), 'three finishes and fourteen materials');
    }

    public function testTheOfflineSnapshotClaimsNoCounts(): void
    {
        $source = $this->source('src/data/materialSnapshot.ts');

        Assert::same(true, substr_count($source, 'products: null') === substr_count($source, '{ code: "'),
            'every offline row must say the count is unknown, not zero');
    }

    public function testThePageReadsTheApiAndCarriesNoInventedVocabulary(): void
    {
        $source = $this->source('src/pages/Materials.tsx');

        foreach (['Espresso', 'Sheesham', 'Beech', 'Antique Brass', 'Powder White', 'Chrome Silver', 'Brushed Nickel'] as $invented) {
            Assert::same(false, str_contains($source, $invented), "the page still advertises {$invented}");
        }

        Assert::same(true, str_contains($source, 'useMaterials'), 'the page must read the catalogue');
        Assert::same(false, str_contains($source, 'const woodFinishes'), 'no page-local palette');
        Assert::same(false, str_contains($source, 'const fabricColors'), 'no page-local palette');
        Assert::same(false, str_contains($source, 'const metalFinishes'), 'no page-local palette');
    }

    public function testNoCountIsTypedIntoThePageCopy(): void
    {
        $source = $this->source('src/pages/Materials.tsx');

        Assert::same(
            0,
            preg_match('/\b\d+\s+(premium\s+)?(wood|fabric|metal|finish|colour|color|material)/i', $source),
            'a count in the copy is a count that will be wrong next month',
        );
    }
}
