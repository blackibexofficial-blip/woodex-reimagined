<?php

declare(strict_types=1);

namespace Tests\Checkout;

use App\Domain\Commerce\Checkout\StockPlan;
use App\Domain\Commerce\Checkout\StockPlanner;
use App\Domain\Commerce\Checkout\StockRequest;
use App\Domain\Commerce\Checkout\StockRow;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The oversell guard, tested without a database.
 *
 * "10 parallel orders for 1 unit, exactly 1 succeeds" is a database test. What this suite
 * proves is the decision underneath it: given what is on hand and what is already promised,
 * the plan never allocates a unit twice. If that decision is right, the transaction around it
 * has one job — take the lock — and a bug there is loud rather than silent.
 */
final class StockPlannerTest extends TestCase
{
    private StockPlanner $planner;

    public function setUp(): void
    {
        $this->planner = new StockPlanner;
    }

    public function testASingleSourceWithEnoughStockIsAllocatedWhole(): void
    {
        $plan = $this->planner->plan(
            [new StockRequest('1', 'WX-1001', 2)],
            [new StockRow('1', '1', 'Lahore', onHand: 10)],
        );

        Assert::true($plan->isComplete(), 'the order can be filled');
        Assert::same(2, $plan->allocatedQty('1'), 'both units come from Lahore');
        Assert::same('Lahore', $plan->allocations[0]['sourceName'], 'and from the only source that has them');
    }

    public function testStockIsSplitAcrossSourcesInPriorityOrder(): void
    {
        $plan = $this->planner->plan(
            [new StockRequest('1', 'WX-1001', 7)],
            [
                new StockRow('1', '2', 'Karachi', onHand: 10, priority: 2),
                new StockRow('1', '1', 'Lahore', onHand: 3, priority: 1),
            ],
        );

        Assert::true($plan->isComplete(), 'fourteen units across two shops fill seven');
        Assert::same(['Lahore', 'Karachi'], array_column($plan->allocations, 'sourceName'), 'priority 1 ships first');
        Assert::same([3, 4], array_column($plan->allocations, 'qty'), 'three from Lahore, four from Karachi');
    }

    public function testReservedStockIsNotAvailableToTheNextCustomer(): void
    {
        $plan = $this->planner->plan(
            [new StockRequest('1', 'WX-1001', 3)],
            [new StockRow('1', '1', 'Lahore', onHand: 5, reserved: 4)],
        );

        Assert::same(false, $plan->isComplete(), 'one unit is not three');
        Assert::same(1, $plan->allocatedQty('1'), 'the single free unit is still offered');
        Assert::same(1, $plan->shortfalls[0]['available'], 'and the shortfall says how many there are');
        Assert::same(3, $plan->shortfalls[0]['requested'], 'against what was asked for');
    }

    public function testAnExactFitLeavesNothingBehind(): void
    {
        $plan = $this->planner->plan(
            [new StockRequest('1', 'WX-1001', 5)],
            [new StockRow('1', '1', 'Lahore', onHand: 5)],
        );

        Assert::true($plan->isComplete(), 'five for five');
        Assert::same([], $plan->shortfalls, 'no shortfall');
    }

    public function testNothingInStockIsReportedAsSuch(): void
    {
        $plan = $this->planner->plan(
            [new StockRequest('1', 'WX-1001', 1)],
            [new StockRow('1', '1', 'Lahore', onHand: 0)],
        );

        Assert::same(false, $plan->isComplete(), 'nothing to allocate');
        Assert::same('WX-1001: out of stock', $plan->summary(), 'the customer is told plainly');
    }

    public function testAPartialShortfallNamesTheQuantities(): void
    {
        $plan = $this->planner->plan(
            [new StockRequest('1', 'WX-1001', 9)],
            [new StockRow('1', '1', 'Lahore', onHand: 4)],
        );

        Assert::same('WX-1001: 4 available, 9 requested', $plan->summary(), 'not just "unavailable"');
    }

    public function testAVariantWithNoStockRowsAtAllIsOutOfStockNotAnError(): void
    {
        $plan = $this->planner->plan(
            [new StockRequest('99', 'WX-9999', 1)],
            [new StockRow('1', '1', 'Lahore', onHand: 10)],
        );

        Assert::same([], $plan->allocations, 'nothing allocated');
        Assert::same(0, $plan->shortfalls[0]['available'], 'reported as zero');
    }

    public function testTwoVariantsDoNotBorrowFromEachOther(): void
    {
        $plan = $this->planner->plan(
            [new StockRequest('1', 'WX-1001', 2), new StockRequest('2', 'WX-1002', 2)],
            [
                new StockRow('1', '1', 'Lahore', onHand: 2),
                new StockRow('2', '1', 'Lahore', onHand: 1),
            ],
        );

        Assert::same(2, $plan->allocatedQty('1'), 'the sofa is filled');
        Assert::same(1, $plan->allocatedQty('2'), 'the chair is short by one, from its own stock');
        Assert::same(false, $plan->isComplete(), 'one shortfall is enough to refuse the order');
    }

    public function testTheSameInputAlwaysProducesTheSamePlan(): void
    {
        $rows = [
            new StockRow('1', '3', 'Islamabad', onHand: 2, priority: 3),
            new StockRow('1', '1', 'Lahore', onHand: 2, priority: 1),
            new StockRow('1', '2', 'Karachi', onHand: 2, priority: 2),
        ];

        $first = $this->planner->plan([new StockRequest('1', 'WX-1001', 5)], $rows);
        $second = $this->planner->plan([new StockRequest('1', 'WX-1001', 5)], array_reverse($rows));

        Assert::same($first->allocations, $second->allocations, 'row order in the query must not change the answer');
        Assert::same(['Lahore', 'Karachi', 'Islamabad'], array_column($first->allocations, 'sourceName'), 'strict priority');
    }

    public function testAPlanNeverAllocatesMoreThanIsPhysicallyThere(): void
    {
        mt_srand(20261031);

        for ($round = 0; $round < 200; $round++) {
            $rows = [];
            $onHand = [];

            for ($source = 1; $source <= 3; $source++) {
                $qty = mt_rand(0, 6);
                $reserved = mt_rand(0, $qty);
                $rows[] = new StockRow('1', (string) $source, "Shop {$source}", onHand: $qty, reserved: $reserved, priority: $source);
                $onHand[$source] = $qty - $reserved;
            }

            $requested = mt_rand(1, 12);
            $plan = $this->planner->plan([new StockRequest('1', 'WX-1001', $requested)], $rows);

            $allocated = $plan->allocatedQty('1');
            $available = array_sum($onHand);

            Assert::same(min($requested, $available), $allocated, 'allocate exactly what is available, never more');

            foreach ($plan->allocations as $allocation) {
                Assert::true(
                    $allocation['qty'] <= $onHand[(int) $allocation['sourceId']],
                    'no single source is over-drawn',
                );
            }
        }
    }

    public function testAnEmptyPlanIsStillAPlan(): void
    {
        $plan = $this->planner->plan([], []);

        Assert::true($plan instanceof StockPlan, 'no requests, no rows, no exception');
        Assert::true($plan->isComplete(), 'nothing was asked for, so nothing is missing');
        Assert::same('', $plan->summary(), 'and there is nothing to tell the customer');
    }
}
