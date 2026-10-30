<?php

declare(strict_types=1);

namespace Tests\Probe;

use App\Domain\Commerce\Probe\OversellAudit;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The one question the checkout race exists to answer.
 *
 * The status codes are evidence; this is the verdict. Five simultaneous checkouts at one unit
 * either produce one unit claimed, or they produce a support ticket.
 */
final class OversellAuditTest extends TestCase
{
    public function testOneUnitOneOrderIsClean(): void
    {
        $audit = new OversellAudit(expected: ['WX-1019' => 1], granted: ['WX-1019' => 1]);

        Assert::true($audit->isClean(), 'exactly what should happen');
        Assert::same([], $audit->violations(), 'no reasons');
        Assert::same(1, $audit->claimedTotal(), 'one unit claimed');
        Assert::same(1, $audit->expectedSuccesses(), 'and exactly one success was expected');
    }

    public function testTwoOrdersForOneUnitIsAnOversell(): void
    {
        $audit = new OversellAudit(expected: ['WX-1019' => 1], granted: ['WX-1019' => 2]);

        Assert::same(false, $audit->isClean(), 'the race was lost');
        Assert::same(1, count($audit->violations()), 'one reason');
        Assert::true(str_contains($audit->violations()[0], 'had 1 unit(s) but 2 were claimed'), 'and it is arithmetic, not opinion');
    }

    public function testNothingClaimedWhenNothingWasThereIsClean(): void
    {
        $audit = new OversellAudit(expected: ['WX-1019' => 0], granted: []);

        Assert::true($audit->isClean(), 'five attempts at zero stock, five refusals');
        Assert::same(0, $audit->expectedSuccesses(), 'and zero successes were expected');
    }

    public function testAUnitClaimedFromNothingIsAnOversell(): void
    {
        $audit = new OversellAudit(expected: [], granted: ['WX-1019' => 1]);

        Assert::same(false, $audit->isClean(), 'a variant with no stock row cannot produce an order');
        Assert::true(str_contains($audit->violations()[0], 'had 0 unit(s)'), 'the message says what was there');
    }

    public function testNegativeStockIsCorruptionAndIsNamedAsSuch(): void
    {
        $audit = new OversellAudit(expected: ['WX-1019' => -2], granted: ['WX-1019' => 0]);

        Assert::same(false, $audit->isClean(), 'a negative count is never a rounding error');
        Assert::true(str_contains($audit->violations()[0], 'STOCK CORRUPTED'), 'and it is not reported as an oversell, because the cause is different');
    }

    public function testSeveralVariantsAreAuditedIndependently(): void
    {
        $audit = new OversellAudit(
            expected: ['WX-1019' => 1, 'WX-1020' => 3],
            granted: ['WX-1019' => 1, 'WX-1020' => 4],
        );

        Assert::same(false, $audit->isClean(), 'one bad variant fails the run');
        Assert::same(1, count($audit->violations()), 'and only the bad one is reported');
        Assert::same(5, $audit->claimedTotal(), 'the totals still add up');
        Assert::same(4, $audit->expectedSuccesses(), 'expected successes across both');
    }

    public function testExactSaleOfEverythingIsClean(): void
    {
        $audit = new OversellAudit(expected: ['WX-1019' => 3], granted: ['WX-1019' => 3]);

        Assert::true($audit->isClean(), 'selling out is the goal, not a failure');
        Assert::same(3, $audit->expectedSuccesses(), 'three units, three orders');
    }

    public function testTheAuditSerialisesIntoTheReportFile(): void
    {
        $array = (new OversellAudit(expected: ['WX-1019' => 1], granted: ['WX-1019' => 2]))->toArray();

        Assert::same(false, $array['clean'], 'the flag');
        Assert::same(2, $array['claimed_total'], 'the number');
        Assert::same(['WX-1019' => 1], $array['expected'], 'the baseline, so the file can be read months later');
    }
}
