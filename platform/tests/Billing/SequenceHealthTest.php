<?php

declare(strict_types=1);

namespace Tests\Billing;

use App\Domain\Commerce\Billing\SequenceHealth;
use Tests\Support\Assert;

/**
 * The one number in the OS that can produce a duplicate that a customer sees.
 */
final class SequenceHealthTest
{
    /** @param array<string, mixed> $overrides */
    private function sequence(array $overrides = []): array
    {
        return [
            'key' => $overrides['key'] ?? 'order',
            'prefix' => $overrides['prefix'] ?? 'WDX-',
            'next' => $overrides['next'] ?? 43,
            'padding' => $overrides['padding'] ?? 6,
        ];
    }

    public function testASequenceOnePastTheHighestIsHealthy(): void
    {
        $health = new SequenceHealth(
            [$this->sequence(['next' => 43])],
            ['order' => range(1, 42)],
        );

        Assert::same('healthy', $health->rows()[0]['state']);
        Assert::same([], $health->warnings());
    }

    public function testASequencePointingAtAUsedNumberIsACollisionWaitingToHappen(): void
    {
        $health = new SequenceHealth(
            [$this->sequence(['next' => 40])],
            ['order' => range(1, 42)],
        );

        $row = $health->rows()[0];

        Assert::same('colliding', $row['state']);
        Assert::same(42, $row['highest']);
        Assert::same(-2, $row['gap']);
        Assert::true(str_contains($health->warnings()[0], 'already in use'));
    }

    public function testASequenceFarAheadIsHarmlessButSaysSo(): void
    {
        $health = new SequenceHealth(
            [$this->sequence(['next' => 100])],
            ['order' => range(1, 42)],
        );

        Assert::same('ahead', $health->rows()[0]['state']);
        Assert::same(58, $health->rows()[0]['gap']);
        Assert::same(1, $health->summary()['ahead']);
        Assert::true(str_contains($health->warnings()[0], 'ahead of the highest'));
    }

    public function testOneSkippedNumberIsNotWorthAWarning(): void
    {
        // A cancelled draft burns a number in some designs; one gap is normal.
        $health = new SequenceHealth([$this->sequence(['next' => 44])], ['order' => range(1, 42)]);

        Assert::same('ahead', $health->rows()[0]['state']);
        Assert::same([], $health->warnings(), 'a gap of two is not a finding');
    }

    public function testASeriesThatNeverIssuedAnythingIsEmptyNotColliding(): void
    {
        $health = new SequenceHealth([$this->sequence(['key' => 'rma', 'next' => 1])], []);

        Assert::same('empty', $health->rows()[0]['state']);
        Assert::same(0, $health->rows()[0]['highest']);
        Assert::same([], $health->warnings());
    }

    public function testNumbersAreComparedAsNumbersNotStrings(): void
    {
        // Lexicographically "9" > "10"; numerically it is not, and the padding hides it.
        $health = new SequenceHealth([$this->sequence(['next' => 11])], ['order' => [9, 10]]);

        Assert::same(10, $health->rows()[0]['highest']);
        Assert::same('healthy', $health->rows()[0]['state']);
    }

    public function testFormattingMatchesTheOrdersTheCustomerHas(): void
    {
        Assert::same('WDX-000042', SequenceHealth::format('WDX-', 42));
        Assert::same('INV-000001', SequenceHealth::format('INV-', 1, 6));
        Assert::same('WDX-1000000', SequenceHealth::format('WDX-', 1_000_000), 'padding is a minimum, not a truncation');
        Assert::same('RMA-007', SequenceHealth::format('RMA-', 7, 3), 'padding is a minimum width');
    }

    public function testANegativeNumberIsRefusedRatherThanFormatted(): void
    {
        Assert::throws(\InvalidArgumentException::class, static fn () => SequenceHealth::format('WDX-', -1));
    }

    public function testTheSummaryCountsEverySeriesOnce(): void
    {
        $health = new SequenceHealth(
            [
                $this->sequence(['key' => 'order', 'next' => 43]),
                $this->sequence(['key' => 'invoice', 'prefix' => 'INV-', 'next' => 40]),
                $this->sequence(['key' => 'rma', 'prefix' => 'RMA-', 'next' => 1]),
            ],
            ['order' => range(1, 42), 'invoice' => range(1, 42)],
        );

        $summary = $health->summary();

        Assert::same(3, $summary['series']);
        Assert::same(1, $summary['colliding'], 'the invoice series is behind');
        Assert::same(1, $summary['healthy']);
        Assert::same(84, $summary['issued']);
    }

    public function testEveryWarningIsReadable(): void
    {
        $health = new SequenceHealth(
            [
                $this->sequence(['key' => 'order', 'next' => 40]),
                $this->sequence(['key' => 'invoice', 'prefix' => 'INV-', 'next' => 100]),
            ],
            ['order' => range(1, 42), 'invoice' => range(1, 42)],
        );

        $warnings = $health->warnings();

        Assert::same(2, count($warnings));

        foreach ($warnings as $warning) {
            Assert::true(strlen($warning) > 30);
            Assert::true(str_ends_with($warning, '.'));
        }
    }
}
