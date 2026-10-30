<?php

namespace Database\Factories;

use App\Domain\Commerce\Models\Category;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Models\ProductTranslation;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    protected $model = Product::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->randomElement([
            'Executive Desk', 'Manager Desk', 'High Back Chair', 'Workstation Cluster',
            'Meeting Table', 'Reception Counter', 'Storage Unit', 'Dining Set',
        ]);

        $series = fake()->randomElement(['EK', 'INFINITY', 'LINK', 'CUBICLE', 'ROYAL']);
        $slug = Str::slug($series.' '.$name.' '.fake()->unique()->numberBetween(100, 9999));
        $rupees = fake()->randomElement([18_500, 34_000, 52_000, 96_000, 155_000, 235_000]);

        return [
            'sku' => 'WX-'.strtoupper(Str::random(6)),
            'type' => Product::TYPE_SIMPLE,
            'status' => Product::STATUS_PUBLISHED,
            'slug' => $slug,
            'primary_category_id' => Category::factory(),
            'series' => $series,
            'brand' => 'Woodex',
            'material' => fake()->randomElement(['38mm MDF Melamine', 'Mesh + MoltyFoam', 'Aluminium + Glass']),
            'frame' => 'Powder-coated steel',
            'price_minor' => $rupees * 100,
            'compare_at_minor' => null,
            'warranty_months' => fake()->randomElement([3, 5, 12]),
            'lead_time_days' => fake()->randomElement([7, 10, 14]),
            'is_featured' => fake()->boolean(30),
            'is_customisable' => true,
            'taxable' => true,
            'rating_x10' => fake()->numberBetween(30, 50),
            'review_count' => fake()->numberBetween(0, 120),
        ];
    }

    public function configure(): static
    {
        return $this->afterCreating(function (Product $product): void {
            ProductTranslation::query()->create([
                'product_id' => $product->id,
                'locale' => 'en',
                'name' => Str::headline($product->slug),
                'summary' => 'Factory-made product for tests.',
                'description' => 'Factory-made product for tests.',
                'features' => [],
                'specifications' => [],
            ]);
        });
    }

    public function draft(): static
    {
        return $this->state(fn (): array => ['status' => Product::STATUS_DRAFT]);
    }

    public function pricedAt(int $rupees): static
    {
        return $this->state(fn (): array => ['price_minor' => $rupees * 100]);
    }
}
