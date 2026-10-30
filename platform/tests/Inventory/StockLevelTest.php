<?php

declare(strict_types=1);

namespace Tests\Inventory;

use App\Domain\Commerce\Inventory\StockLevel;
use Tests\Support\Assert;

/**
 * When is a shelf "low"?
 *
 * The admin badges, the dashboard tile and the storefront's "only 2 left" all ask this
 * question, and they must answer it the same way. The boundary cases are the whole test:
 * off-by-one here is a warehouse that stops reordering a day later than it should.
 */
final class StockLevelTest extends \Tests\TestCase
{
    public function testAvailabilityIsOnHandMinusHeld(): void
    {
        $level = new StockLevel(qty: 12, reserved: 5, threshold: 2);

        Assert::same(7, $level->available(), 'seven units can be sold');
        Assert::same(StockLevel::OK, $level->status(), 'seven is comfortable against a threshold of two');
        Assert::same('42', (string) $level->heldPercent(), 'five of twelve is 42%');
    }

    public function testAHoldLargerThanTheShelfNeverShowsNegativeStock(): void
    {
        $level = new StockLevel(qty: 2, reserved: 5, threshold: 0);

        Assert::same(0, $level->available(), 'availability is clamped, not negative');
        Assert::same(StockLevel::OUT, $level->status(), 'and the shelf reads as empty');
        Assert::same(true, $level->isCorrupted(), 'while the row is flagged for a human');
    }

    public function testTheThresholdIsInclusive(): void
    {
        Assert::same(StockLevel::LOW, (new StockLevel(5, 0, 5))->status(), 'exactly at the threshold is low');
        Assert::same(StockLevel::OK, (new StockLevel(6, 0, 5))->status(), 'one above it is not');
        Assert::same(StockLevel::OUT, (new StockLevel(5, 5, 5))->status(), 'all held is out, not low');
    }

    public function testAThresholdOfZeroMeansOnlyEmptyIsSpecial(): void
    {
        Assert::same(StockLevel::OUT, (new StockLevel(0, 0, 0))->status(), 'nothing on the shelf');
        Assert::same(StockLevel::OK, (new StockLevel(1, 0, 0))->status(), 'a single unit is fine when nothing is held');
    }

    public function testTheLabelsAndTonesMatchTheBadgeComponent(): void
    {
        Assert::same('Out of stock', (new StockLevel(0, 0, 0))->label(), 'out');
        Assert::same('error', (new StockLevel(0, 0, 0))->tone(), 'and reads as an error');

        Assert::same('Running low', (new StockLevel(2, 0, 2))->label(), 'low');
        Assert::same('warning', (new StockLevel(2, 0, 2))->tone(), 'and reads as a warning');

        Assert::same('In stock', (new StockLevel(50, 0, 2))->label(), 'healthy');
        Assert::same('success', (new StockLevel(50, 0, 2))->tone(), 'and reads as fine');
    }

    public function testAPercentageIsNeverMoreThanAHundredOrDividedByZero(): void
    {
        Assert::same(0, (new StockLevel(0, 0, 0))->heldPercent(), 'an empty shelf holds nothing, and does not divide by zero');
        Assert::same(100, (new StockLevel(4, 4, 0))->heldPercent(), 'a fully held shelf is 100%');
        Assert::same(50, (new StockLevel(4, 2, 0))->heldPercent(), 'half held is half');
    }

    public function testNegativeNumbersAreCorruptionAndSaySo(): void
    {
        Assert::same(true, (new StockLevel(-1, 0, 0))->isCorrupted(), 'a negative count is not a stock level');
        Assert::same(true, (new StockLevel(0, -1, 0))->isCorrupted(), 'nor is a negative hold');
        Assert::same(0, (new StockLevel(-3, 0, 0))->available(), 'and availability stays at zero');
        Assert::same(false, (new StockLevel(3, 1, 0))->isCorrupted(), 'a normal row is not flagged');
    }
}
