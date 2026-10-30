<?php

declare(strict_types=1);

namespace Tests\Catalog;

use Tests\Support\Assert;

/**
 * The attributes screen, read as source text.
 *
 * The state machine is tested in AttributeVocabularyTest. What is pinned here is the part a
 * screenshot cannot show: that the counts are real (grouped, filtered to what a customer can
 * reach, and not an N+1 loop), that the screen leads with the defect rather than burying it in
 * a table, and that nothing on the page writes.
 */
final class AttributesScreenTest
{
    private function root(): string
    {
        return dirname(__DIR__, 2);
    }

    private function source(string $relative): string
    {
        $path = $this->root().$relative;

        Assert::trueWith(is_file($path), static fn (): string => "missing file {$relative}", 'file exists');

        return is_file($path) ? (string) file_get_contents($path) : '';
    }

    public function testTheScreenIsNoLongerAPlaceholder(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/AttributesIndex.php');

        Assert::same(false, str_contains($source, 'extends CommerceScreen'), 'it reads real rows');
        Assert::true(str_contains($source, 'AttributeVocabulary'), 'through the vocabulary value object');
        Assert::true(
            is_file($this->root().'/resources/views/livewire/admin/commerce/attributes-index.blade.php'),
            'with a view of its own',
        );
    }

    public function testUsageIsCountedInTwoQueriesRatherThanPerOption(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/AttributesIndex.php');

        Assert::true(str_contains($source, 'commerce_product_attribute_values'), 'products are counted from the values table');
        Assert::true(str_contains($source, 'commerce_variant_options'), 'variants from the variant options');
        Assert::same(2, substr_count($source, '->groupBy('), 'both counts are grouped, not looped');
        Assert::true(str_contains($source, 'COUNT(DISTINCT'), 'and products are counted once each');

        // A count per option inside the render loop would be one query per row.
        Assert::same(false, str_contains($source, 'foreach ($attribute->options as $option) {
            $rows[] = ['), 'no query inside the option loop');
    }

    public function testOnlyThingsACustomerCanReachAreCounted(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/AttributesIndex.php');

        Assert::true(str_contains($source, "'p.status', 'published'"), 'a draft product is not in the shop');
        Assert::true(str_contains($source, "whereNull('v.deleted_at')"), 'a deleted variant cannot be bought');
        Assert::true(str_contains($source, "'v.status', 'active'"), 'and neither can an inactive one');
    }

    public function testTheDefectIsStatedBeforeTheTableIsDrawn(): void
    {
        $view = $this->source('/resources/views/livewire/admin/commerce/attributes-index.blade.php');

        $warningsAt = strpos($view, '@if ($warnings !== [])');
        $tableAt = strpos($view, '<table');

        Assert::true($warningsAt !== false, 'the screen has a warning block');
        Assert::true($tableAt !== false, 'and a table');
        Assert::true($warningsAt < $tableAt, 'the warning comes first');

        Assert::true(str_contains($view, 'no variant behind it') || str_contains($view, '$warning'), 'the sentences come from the vocabulary, not the view');

        // The count in the view is the derived one, never a raw option total.
        Assert::true(str_contains($view, "\$summary['dead_filter']"), 'empty filters are counted as a defect');
        Assert::true(str_contains($view, "\$summary['orphan_variant']"), 'so are orphaned finishes');
    }

    public function testAnOptionShowsItsOwnStateRatherThanTheAssumptionThatItWorks(): void
    {
        $view = $this->source('/resources/views/livewire/admin/commerce/attributes-index.blade.php');

        Assert::true(str_contains($view, '@switch($option->state())'), 'each row is labelled from its state');
        Assert::true(str_contains($view, '$option->reason()'), 'and says what that means for a customer');
        Assert::true(str_contains($view, '$option->swatch()'), 'swatches render from the option, not a hardcoded palette');
    }

    public function testNothingOnTheScreenWrites(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/AttributesIndex.php');
        $view = $this->source('/resources/views/livewire/admin/commerce/attributes-index.blade.php');

        Assert::same(false, str_contains($source, '->save()'), 'no saves in the component');
        Assert::same(false, str_contains($source, '->update('), 'and no updates');
        Assert::same(false, str_contains($source, '->delete('), 'and nothing is deleted');
        Assert::same(false, str_contains($source, '->create('), 'nothing is created either');
        Assert::same(false, str_contains($view, 'wire:click'), 'the view offers no buttons that would need a write');
    }

    public function testTheScreenAsksForTheWeakestPermissionThatWillDo(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/AttributesIndex.php');

        Assert::true(str_contains($source, "can('commerce.products.view')"), 'looking at the vocabulary is a view permission');
        Assert::same(false, str_contains($source, "can('commerce.products.manage')"), 'not the manage permission, which this page does not use');
    }
}
