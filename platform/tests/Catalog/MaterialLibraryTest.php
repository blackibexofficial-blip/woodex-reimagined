<?php

declare(strict_types=1);

namespace Tests\Catalog;

use App\Domain\Commerce\Catalog\MaterialLibrary;
use Tests\Support\Assert;

/**
 * The finishes the storefront draws, and whether they are real.
 *
 * The page used to carry its own palette — six wood finishes, twelve fabric colours, five metals
 * — none of which existed in the catalog. Everything here exists to stop that happening again:
 * an option is only a swatch if it has a colour, and only a colour worth showing if the counts
 * say a product offers it.
 */
final class MaterialLibraryTest
{
    /** @param array<string, mixed> $overrides */
    private function row(array $overrides = []): array
    {
        return [
            'attribute_code' => $overrides['attribute_code'] ?? 'finish',
            'attribute_name' => $overrides['attribute_name'] ?? 'Finish',
            'attribute_type' => $overrides['attribute_type'] ?? 'swatch',
            'swatch_type' => $overrides['swatch_type'] ?? 'colour',
            'code' => $overrides['code'] ?? 'natural-oak',
            'label' => $overrides['label'] ?? 'Natural Oak',
            'hex' => array_key_exists('hex', $overrides) ? $overrides['hex'] : '#c8a97e',
            'swatch_path' => $overrides['swatch_path'] ?? null,
            'products' => $overrides['products'] ?? 4,
            'variants' => $overrides['variants'] ?? 4,
        ];
    }

    public function testOptionsAreGroupedUnderTheirAttributeInTheOrderTheyArrived(): void
    {
        $library = MaterialLibrary::fromRows([
            $this->row(['attribute_code' => 'material', 'attribute_name' => 'Material', 'code' => 'mdf', 'label' => 'MDF', 'hex' => null]),
            $this->row(['attribute_code' => 'finish', 'code' => 'natural-oak', 'label' => 'Natural Oak']),
            $this->row(['attribute_code' => 'finish', 'code' => 'dark-walnut', 'label' => 'Dark Walnut', 'hex' => '#5b3a29']),
        ]);

        $groups = $library->groups();

        Assert::same(2, count($groups));
        Assert::same('material', $groups[0]['code']);
        Assert::same('finish', $groups[1]['code']);
        Assert::same(2, count($groups[1]['options']), 'the finishes stayed together');
        Assert::same(['natural-oak', 'dark-walnut'], array_column($groups[1]['options'], 'code'));
    }

    public function testHexIsNormalisedAndAMalformedOneIsRefused(): void
    {
        $library = MaterialLibrary::fromRows([
            $this->row(['code' => 'a', 'hex' => '#c8a97e']),
            $this->row(['code' => 'b', 'hex' => 'c8a97e']),
            $this->row(['code' => 'c', 'hex' => '#fff']),
            $this->row(['code' => 'd', 'hex' => '']),
            $this->row(['code' => 'e', 'hex' => null]),
        ]);

        $options = $library->groups()[0]['options'];

        Assert::same('#C8A97E', $options[0]['hex'], 'uppercased, because a swatch is compared to a style');
        Assert::same(null, $options[1]['hex'], 'a missing # is not a colour');
        Assert::same(null, $options[2]['hex'], 'and neither is shorthand');
        Assert::same(null, $options[3]['hex']);
        Assert::same(null, $options[4]['hex']);
    }

    public function testOnlyGroupsWithARealColourArePalettes(): void
    {
        $library = MaterialLibrary::fromRows([
            $this->row(['attribute_code' => 'material', 'code' => 'mdf', 'hex' => null]),
            $this->row(['attribute_code' => 'finish', 'code' => 'natural-oak']),
        ]);

        $palettes = $library->paletteGroups();

        Assert::same(1, count($palettes));
        Assert::same('finish', $palettes[0]['code'], 'a list of fourteen names and no colours is a filter, not a palette');
    }

    public function testSwatchesAreFlattenedAcrossGroups(): void
    {
        $library = MaterialLibrary::fromRows([
            $this->row(['attribute_code' => 'finish', 'code' => 'natural-oak']),
            $this->row(['attribute_code' => 'finish', 'code' => 'dark-walnut', 'hex' => '#5b3a29']),
            $this->row(['attribute_code' => 'material', 'code' => 'mdf', 'hex' => null]),
        ]);

        $swatches = $library->swatches();

        Assert::same(2, count($swatches));
        Assert::same('finish', $swatches[0]['attribute']);
        Assert::same('Finish', $swatches[0]['attribute_name']);
        Assert::same('natural-oak', $swatches[0]['code']);
    }

    public function testAnOptionNothingCarriesIsCountedAsDead(): void
    {
        $library = MaterialLibrary::fromRows([
            $this->row(['code' => 'natural-oak', 'products' => 4, 'variants' => 4]),
            $this->row(['code' => 'matte-black', 'products' => 0, 'variants' => 0]),
        ]);

        $summary = $library->summary();

        Assert::same(2, $summary['options']);
        Assert::same(2, $summary['swatches']);
        Assert::same(1, $summary['live_options']);
        Assert::same(1, $summary['dead_options'], 'a finish nobody sells is a colour the shop cannot deliver');
    }

    public function testAVariantAloneMakesAnOptionLive(): void
    {
        $library = MaterialLibrary::fromRows([$this->row(['products' => 0, 'variants' => 3])]);

        Assert::same(1, $library->summary()['live_options']);
        Assert::same(0, $library->summary()['dead_options']);
    }

    public function testASwatchImageIsKeptBecauseATextureIsNotAColour(): void
    {
        $library = MaterialLibrary::fromRows([
            $this->row(['hex' => null, 'swatch_path' => '/media/materials/oak.jpg']),
        ]);

        $option = $library->groups()[0]['options'][0];

        Assert::same(null, $option['hex']);
        Assert::same('/media/materials/oak.jpg', $option['image']);
    }

    public function testRowsWithoutAnAttributeAreDroppedRatherThanGroupedUnderNothing(): void
    {
        $library = MaterialLibrary::fromRows([
            $this->row(['attribute_code' => '']),
            $this->row(['code' => 'natural-oak']),
        ]);

        Assert::same(1, count($library->groups()));
        Assert::same(1, count($library->groups()[0]['options']));
    }

    public function testAnEmptyCatalogIsAnEmptyLibraryNotAnError(): void
    {
        $library = MaterialLibrary::fromRows([]);

        Assert::same(true, $library->isEmpty());
        Assert::same([], $library->groups());
        Assert::same(0, $library->summary()['options']);
    }

    public function testTheApiBodyCarriesTheCountsThePageNeeds(): void
    {
        $payload = MaterialLibrary::fromRows([
            $this->row(['attribute_code' => 'finish', 'code' => 'natural-oak']),
            $this->row(['attribute_code' => 'material', 'code' => 'mdf', 'hex' => null]),
        ])->toArray();

        Assert::same(['groups', 'meta'], array_keys($payload));
        Assert::same(2, $payload['meta']['groups']);
        Assert::same(2, $payload['meta']['options']);
        Assert::same(1, $payload['meta']['swatches']);
    }
}
