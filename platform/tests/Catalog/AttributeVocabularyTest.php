<?php

declare(strict_types=1);

namespace Tests\Catalog;

use App\Domain\Commerce\Catalog\AttributeVocabulary;
use App\Domain\Commerce\Catalog\OptionUsage;
use Tests\Support\Assert;

/**
 * Whether the vocabulary still describes the catalog.
 *
 * Every case here is a counting question, which is the point: no amount of reading the
 * attribute table tells you that "Matte Black" is offered as a finish nobody can buy. Only
 * the two counts do, and they disagree often enough to matter.
 */
final class AttributeVocabularyTest
{
    /** @param array<string, mixed> $overrides */
    private function option(array $overrides = []): OptionUsage
    {
        return new OptionUsage(
            attributeCode: (string) ($overrides['attributeCode'] ?? 'finish'),
            attributeName: (string) ($overrides['attributeName'] ?? 'Finish'),
            code: (string) ($overrides['code'] ?? 'natural-oak'),
            label: (string) ($overrides['label'] ?? 'Natural Oak'),
            products: (int) ($overrides['products'] ?? 5),
            variants: (int) ($overrides['variants'] ?? 5),
            onVariantAxis: (bool) ($overrides['onVariantAxis'] ?? true),
            filterable: (bool) ($overrides['filterable'] ?? true),
            // `array_key_exists`, not `??`: an explicit null is a case under test.
            hex: array_key_exists('hex', $overrides) ? $overrides['hex'] : '#C8A97E',
        );
    }

    public function testAnOptionBothSellsAndFiltersIsSimplyUsed(): void
    {
        $option = $this->option();

        Assert::same(OptionUsage::USED, $option->state());
        Assert::same(true, $option->isLive());
        Assert::same(false, $option->needsAttention());
    }

    public function testAFinishWithNoVariantIsTheDefectThatCostsASale(): void
    {
        $option = $this->option(['variants' => 0, 'products' => 4]);

        Assert::same(OptionUsage::ORPHAN_VARIANT, $option->state());
        Assert::same(true, $option->needsAttention());

        // The product-level count does not rescue it. A customer does not buy an attribute
        // value; they buy the variant behind it.
        Assert::same(true, $option->isLive());
    }

    public function testAFilterNobodyCarriesIsAnEmptyPageWaitingToHappen(): void
    {
        $option = $this->option(['onVariantAxis' => false, 'variants' => 0, 'products' => 0]);

        Assert::same(OptionUsage::DEAD_FILTER, $option->state());
        Assert::same(false, $option->isLive());
    }

    public function testTheMoreExpensiveDefectWinsWhenAnOptionCouldBeEither(): void
    {
        // Filterable, on a variant axis, and carried by nothing: both readings are true.
        $option = $this->option(['filterable' => true, 'onVariantAxis' => true, 'variants' => 0, 'products' => 0]);

        Assert::same(OptionUsage::ORPHAN_VARIANT, $option->state());
    }

    public function testAnOptionThatIsNeitherShownNorUsedIsOnlyUntidy(): void
    {
        $option = $this->option(['onVariantAxis' => false, 'filterable' => false, 'products' => 0, 'variants' => 0]);

        Assert::same(OptionUsage::UNUSED, $option->state());
        Assert::same(false, $option->needsAttention());
    }

    public function testAHiddenOptionThatProductsCarryIsUsedNotUnused(): void
    {
        // Back-of-house attributes are real: a warranty length is not in the filter rail and
        // does not generate variants, but every product has one.
        $option = $this->option(['onVariantAxis' => false, 'filterable' => false, 'products' => 20, 'variants' => 0]);

        Assert::same(OptionUsage::USED, $option->state());
    }

    public function testVariantsAloneAreEnoughToCountAsLive(): void
    {
        // A variant can exist without a product-level attribute row; the variant is still bought.
        $option = $this->option(['products' => 0, 'variants' => 3]);

        Assert::same(true, $option->isLive());
        Assert::same(OptionUsage::USED, $option->state());
    }

    public function testTheReasonsAreConsequencesNotDiagnostics(): void
    {
        Assert::true(
            str_contains($this->option(['variants' => 0])->reason(), 'nothing to buy'),
            'the orphan explains what the customer experiences',
        );
        Assert::true(
            str_contains($this->option(['onVariantAxis' => false, 'products' => 0, 'variants' => 0])->reason(), 'empty page'),
            'the dead filter says what the shopper sees',
        );
        Assert::same('3 variants', $this->option(['products' => 0, 'variants' => 3])->reason());
        Assert::same('1 product', $this->option(['products' => 1, 'variants' => 0, 'onVariantAxis' => false])->reason());
    }

    public function testTheRailCountsOnlyWhatWillActuallyReturnSomething(): void
    {
        $vocabulary = new AttributeVocabulary([
            $this->option(['code' => 'natural-oak']),
            $this->option(['code' => 'dark-walnut']),
            // Shown in the rail, carried by nothing — drawn, ticked, empty.
            $this->option(['code' => 'matte-black', 'onVariantAxis' => false, 'variants' => 0, 'products' => 0]),
            // Neither shown nor carried: not a defect, so it is not counted as one.
            $this->option(['code' => 'warranty-12', 'attributeCode' => 'warranty', 'onVariantAxis' => false, 'filterable' => false, 'products' => 0, 'variants' => 0]),
        ]);

        Assert::same(2, count($vocabulary->filterRail()));
        Assert::same(1, count($vocabulary->deadFilters()));
        Assert::same(1, count($vocabulary->unused()));
        Assert::same(1, count($vocabulary->needingAttention()));
    }

    public function testOrphansAndDeadFiltersAreReportedSeparately(): void
    {
        $vocabulary = new AttributeVocabulary([
            $this->option(['code' => 'orphan', 'variants' => 0]),
            $this->option(['code' => 'dead', 'onVariantAxis' => false, 'variants' => 0, 'products' => 0]),
            $this->option(['code' => 'fine']),
        ]);

        Assert::same(1, count($vocabulary->orphanVariants()));
        Assert::same(1, count($vocabulary->deadFilters()));
        Assert::same(3, $vocabulary->summary()['options']);
        Assert::same(1, $vocabulary->summary()['used']);
        Assert::same(1, $vocabulary->summary()['orphan_variant']);
        Assert::same(1, $vocabulary->summary()['dead_filter']);
    }

    public function testTheSummaryAttributesAreCountedOnceEach(): void
    {
        $vocabulary = new AttributeVocabulary([
            $this->option(['attributeCode' => 'finish', 'code' => 'a']),
            $this->option(['attributeCode' => 'finish', 'code' => 'b']),
            $this->option(['attributeCode' => 'material', 'code' => 'c', 'onVariantAxis' => false, 'filterable' => true]),
        ]);

        Assert::same(2, $vocabulary->summary()['attributes']);
    }

    public function testACleanCatalogSaysNothing(): void
    {
        $vocabulary = new AttributeVocabulary([
            $this->option(['code' => 'natural-oak']),
            $this->option(['code' => 'dark-walnut']),
        ]);

        Assert::same([], $vocabulary->warnings());
    }

    public function testTheWarningSaysHowManyAndWhyItMatters(): void
    {
        $vocabulary = new AttributeVocabulary([
            $this->option(['code' => 'orphan-a', 'variants' => 0]),
            $this->option(['code' => 'orphan-b', 'variants' => 0]),
            $this->option(['code' => 'dead', 'onVariantAxis' => false, 'variants' => 0, 'products' => 0]),
        ]);

        $warnings = $vocabulary->warnings();

        Assert::same(2, count($warnings));
        Assert::true(str_starts_with($warnings[0], '2 options'), 'orphans are counted first, because they cost sales');
        Assert::true(str_contains($warnings[1], 'empty page'), 'and the dead filter follows');
    }

    public function testOneProblemIsWordedInTheSingular(): void
    {
        $vocabulary = new AttributeVocabulary([$this->option(['variants' => 0])]);
        $warnings = $vocabulary->warnings();

        Assert::same(1, count($warnings));
        Assert::true(str_starts_with($warnings[0], '1 option is'), 'a count of one reads like English');
    }

    public function testRowsAreBuiltFromWhatTheQueryReturns(): void
    {
        $vocabulary = AttributeVocabulary::fromRows([
            ['attribute_code' => 'finish', 'attribute_name' => 'Finish', 'code' => 'natural-oak', 'label' => 'Natural Oak', 'products' => 8, 'variants' => 6, 'is_variant' => 1, 'is_filterable' => 1, 'hex' => '#C8A97E'],
            ['attribute_code' => 'finish', 'attribute_name' => 'Finish', 'code' => 'matte-black', 'label' => 'Matte Black', 'products' => 0, 'variants' => 0, 'is_variant' => 1, 'is_filterable' => 1, 'hex' => '#1C1C1C'],
        ]);

        Assert::same(2, count($vocabulary->of('finish')));
        Assert::same(1, count($vocabulary->orphanVariants()));
        Assert::same('#1C1C1C', $vocabulary->orphanVariants()[0]->swatch());
    }

    public function testAMissingHexIsNotASwatch(): void
    {
        Assert::same(null, $this->option(['hex' => null])->swatch());
        Assert::same(null, $this->option(['hex' => ''])->swatch());
        Assert::same('#C8A97E', $this->option()->swatch());
    }
}
