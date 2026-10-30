<?php

namespace Database\Factories;

use App\Domain\Commerce\Models\Category;
use App\Domain\Commerce\Models\CategoryTranslation;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Category>
 */
class CategoryFactory extends Factory
{
    protected $model = Category::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->randomElement(['Office Tables', 'Chairs', 'Workstations', 'Home Furniture']);

        return [
            'slug' => Str::slug($name.' '.fake()->unique()->numberBetween(1, 99999)),
            'code' => null,
            'parent_id' => null,
            'position' => 0,
            'is_active' => true,
            'show_in_menu' => true,
        ];
    }

    public function configure(): static
    {
        return $this->afterCreating(function (Category $category): void {
            CategoryTranslation::query()->create([
                'category_id' => $category->id,
                'locale' => 'en',
                'name' => Str::headline($category->slug),
            ]);
        });
    }
}
