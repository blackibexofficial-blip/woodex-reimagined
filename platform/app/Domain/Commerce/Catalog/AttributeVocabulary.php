<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Catalog;

/**
 * The whole vocabulary, read at once.
 *
 * The attributes screen is not a list of attribute rows — those are configuration and they
 * rarely change. What changes is whether the vocabulary still describes the catalog, and that
 * is a question you can only answer by counting: how many products carry each option, how many
 * variants point at it, and therefore which pieces of the shop are showing something empty.
 *
 * Everything here is a pure function of counts, so it is tested without a database.
 */
final readonly class AttributeVocabulary
{
    /** @param list<OptionUsage> $options */
    public function __construct(public array $options = []) {}

    /**
     * @param  list<array<string, mixed>>  $rows  one row per option
     */
    public static function fromRows(array $rows): self
    {
        $options = [];

        foreach ($rows as $row) {
            $options[] = new OptionUsage(
                attributeCode: (string) ($row['attribute_code'] ?? ''),
                attributeName: (string) ($row['attribute_name'] ?? ''),
                code: (string) ($row['code'] ?? ''),
                label: (string) ($row['label'] ?? ''),
                products: (int) ($row['products'] ?? 0),
                variants: (int) ($row['variants'] ?? 0),
                onVariantAxis: (bool) ($row['is_variant'] ?? false),
                filterable: (bool) ($row['is_filterable'] ?? false),
                hex: isset($row['hex']) ? (string) $row['hex'] : null,
            );
        }

        return new self($options);
    }

    /** @return list<OptionUsage> */
    public function of(string $attributeCode): array
    {
        return array_values(array_filter(
            $this->options,
            static fn (OptionUsage $option): bool => $option->attributeCode === $attributeCode,
        ));
    }

    /**
     * Filter options the storefront will draw.
     *
     * Only live options count: dead ones are still rendered today, which is exactly the bug,
     * but the number the screen shows is what the rail *should* contain.
     *
     * @return list<OptionUsage>
     */
    public function filterRail(): array
    {
        return array_values(array_filter(
            $this->options,
            static fn (OptionUsage $option): bool => $option->filterable && $option->isLive(),
        ));
    }

    /** @return list<OptionUsage> */
    public function deadFilters(): array
    {
        return array_values(array_filter(
            $this->options,
            static fn (OptionUsage $option): bool => $option->state() === OptionUsage::DEAD_FILTER,
        ));
    }

    /** @return list<OptionUsage> */
    public function orphanVariants(): array
    {
        return array_values(array_filter(
            $this->options,
            static fn (OptionUsage $option): bool => $option->state() === OptionUsage::ORPHAN_VARIANT,
        ));
    }

    /** @return list<OptionUsage> */
    public function unused(): array
    {
        return array_values(array_filter(
            $this->options,
            static fn (OptionUsage $option): bool => $option->state() === OptionUsage::UNUSED,
        ));
    }

    /** @return list<OptionUsage> */
    public function needingAttention(): array
    {
        return array_values(array_filter(
            $this->options,
            static fn (OptionUsage $option): bool => $option->needsAttention(),
        ));
    }

    /**
     * @return array{options: int, used: int, dead_filter: int, orphan_variant: int, unused: int, attributes: int}
     */
    public function summary(): array
    {
        $counts = [
            OptionUsage::USED => 0,
            OptionUsage::DEAD_FILTER => 0,
            OptionUsage::ORPHAN_VARIANT => 0,
            OptionUsage::UNUSED => 0,
        ];

        $attributes = [];

        foreach ($this->options as $option) {
            $counts[$option->state()]++;
            $attributes[$option->attributeCode] = true;
        }

        return [
            'options' => count($this->options),
            'used' => $counts[OptionUsage::USED],
            'dead_filter' => $counts[OptionUsage::DEAD_FILTER],
            'orphan_variant' => $counts[OptionUsage::ORPHAN_VARIANT],
            'unused' => $counts[OptionUsage::UNUSED],
            'attributes' => count($attributes),
        ];
    }

    /**
     * What to say at the top of the screen.
     *
     * Two sentences at most, and only when there is something to act on: a screen that always
     * shows a warning is a screen nobody reads. Orphans come first because they cost sales.
     *
     * @return list<string>
     */
    public function warnings(): array
    {
        $warnings = [];
        $orphans = count($this->orphanVariants());
        $dead = count($this->deadFilters());

        if ($orphans > 0) {
            $warnings[] = $orphans === 1
                ? '1 option is offered as a finish with no variant behind it. A customer can pick it and find nothing to buy.'
                : $orphans.' options are offered as finishes with no variant behind them. Customers can pick them and find nothing to buy.';
        }

        if ($dead > 0) {
            $warnings[] = $dead === 1
                ? '1 filter option returns an empty page, because no product carries it.'
                : $dead.' filter options return an empty page, because no product carries them.';
        }

        return $warnings;
    }
}
