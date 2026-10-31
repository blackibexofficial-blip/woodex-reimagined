<?php

declare(strict_types=1);

namespace Tests\Api;

use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The seams the storefront actually crosses.
 *
 * Every bug pinned here was found by running the app, not by reading it, and each one had the
 * same shape: the code was plausible, the suite was green, and the shop was broken. That is the
 * failure mode a source-text test cannot catch on its own — so these checks are written against
 * the *contract*, the thing the TypeScript client reads, rather than against the implementation.
 */
final class StorefrontContractTest extends TestCase
{
    private static function read(string $relative): string
    {
        $path = self::sitePath($relative);

        Assert::trueWith(is_file((string) $path), static fn (): string => "missing file {$relative}", 'file exists');

        return is_file((string) $path) ? (string) file_get_contents((string) $path) : '';
    }

    /**
     * The wire keys are snake_case, and they are decided in one place.
     *
     * `ProductCard::toArray()` emits `price_minor`, `in_stock`, `available_qty`. The controller
     * handed `json_encode` the object instead, so the browser received `priceMinor`, `inStock` —
     * keys its types do not declare. Twenty products rendered at no price, all "Out of Stock",
     * and the only symptom was a shop that looked empty.
     */
    public function testTheCatalogCrossesTheWireInTheShapeTheClientReads(): void
    {
        $service = self::read('app/Domain/Commerce/Api/CatalogService.php');
        $card = self::read('app/Domain/Commerce/Api/ProductCard.php');

        Assert::true(str_contains($service, '->toArray()'), 'the service serialises at the boundary');
        // The shape, not the formatting: a card crossing as an object looks like
        // `ProductCard::fromModel(...)` with no `->toArray()` after it. Asserting that directly
        // is brittle about whitespace, so the check is that every construction is serialised.
        Assert::same(
            count(preg_split('/ProductCard::fromModel\(/', $service) ?: []) - 1,
            count(preg_split('/ProductCard::fromModel\([^;]*->toArray\(\)/', $service) ?: []) - 1,
            'every card built is serialised before it leaves',
        );

        // Arrays, not objects: an object in `Cache::remember` is an object in the response, and
        // on the next deploy it unserialises as an incomplete class with an extra magic key.
        Assert::true(str_contains($service, 'fn (Product $product): array'), 'the map returns arrays');
        Assert::same(false, str_contains($service, 'fn (Product $product): ProductCard'), 'not objects');

        foreach (['price_minor', 'in_stock', 'available_qty', 'category_path'] as $key) {
            Assert::true(str_contains($card, "'{$key}'"), "the card emits {$key}");
        }
    }

    /**
     * The product card has to declare every property it is given.
     *
     * `fromModel()` passed `categoryPath:` while the constructor did not accept it. Nothing
     * constructed a card from a real model in any test, so the fatal waited for the first
     * request to a real database.
     */
    public function testEveryNamedArgumentInTheCardHasAProperty(): void
    {
        $card = self::read('app/Domain/Commerce/Api/ProductCard.php');

        preg_match_all('/^\s{8}(?:public\s+[\w?\\\\]+|public\s+readonly\s+[\w?\\\\]+)\s+\$(\w+),/m', $card, $properties);
        preg_match_all('/^\s{12}(\w+):\s/m', $card, $arguments);

        $declared = $properties[1] ?? [];
        $passed = $arguments[1] ?? [];

        Assert::true(count($declared) > 10, 'the properties were found');
        Assert::true(count($passed) > 10, 'the named arguments were found');

        $missing = array_values(array_diff($passed, $declared));

        Assert::same([], $missing, 'these are passed by name but never declared');
    }

    /**
     * A product with no variant can hold no stock and cannot be bought.
     *
     * `commerce_inventory_items` has `variant_id` and no `product_id`, so stock is a fact about a
     * variant. Sixteen of twenty products had none: the catalogue said `in_stock: true`, the shop
     * said "Out of Stock", and checkout had nothing to add to a cart. The seed now gives every
     * product at least one variant — a plain one for a simple product — so the rule holds for
     * real data and not only for the demo.
     */
    public function testEverySeededProductCanHoldStockAndBeBought(): void
    {
        $seeder = self::read('database/seeders/CatalogSeeder.php');

        Assert::true(str_contains($seeder, 'seedDefaultVariants'), 'the seed closes the gap');
        Assert::true(str_contains($seeder, 'if ($product->variants()->exists())'), 'without duplicating real variants');
        Assert::true(str_contains($seeder, "['variant_id' => \$variant->id, 'source_id' => \$sources[\$code]->id]"), 'and stocks them at real sources');

        // The admin stopped gating the stock column on the product type, which is a statement
        // about what the customer chooses, not about how the count is stored.
        $view = self::read('resources/views/livewire/admin/commerce/products-index.blade.php');

        Assert::true(str_contains($view, '$product->variants->isNotEmpty()'), 'the stock column reads variants');
    }

    /**
     * The checkout's variant filter must name a column that exists.
     *
     * It filtered on `is_active`; the table has `status` and the model has `scopeActive()`. The
     * query returned nothing, so every quote and every order answered "That product cannot be
     * ordered right now" — a stock-sounding message for a schema bug.
     */
    public function testCheckoutFiltersVariantsByTheColumnThatExists(): void
    {
        $controller = self::read('app/Http/Controllers/Api/Storefront/CheckoutController.php');
        $model = self::read('app/Domain/Commerce/Models/ProductVariant.php');

        Assert::same(false, str_contains($controller, "where('is_active', true)"), 'no filter on a column the table lacks');
        Assert::true(str_contains($controller, '->active()'), 'the model scope is used instead');
        Assert::true(str_contains($model, "where('status', 'active')"), 'and that scope filters status');
    }
}
