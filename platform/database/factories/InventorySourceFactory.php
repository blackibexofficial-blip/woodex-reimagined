<?php

namespace Database\Factories;

use App\Domain\Commerce\Models\InventorySource;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InventorySource>
 */
class InventorySourceFactory extends Factory
{
    protected $model = InventorySource::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => 'src-'.fake()->unique()->numberBetween(1, 99999),
            'name' => fake()->city().' Warehouse',
            'city' => fake()->city(),
            'priority' => 1,
            'is_active' => true,
            'is_pickup' => false,
        ];
    }
}
