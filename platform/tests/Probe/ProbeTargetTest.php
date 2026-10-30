<?php

declare(strict_types=1);

namespace Tests\Probe;

use App\Domain\Commerce\Probe\LoadReport;
use App\Domain\Commerce\Probe\LoadSample;
use App\Domain\Commerce\Probe\OversellAudit;
use App\Domain\Commerce\Probe\ProbeTarget;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The pass mark. A probe reports; this decides.
 *
 * The boundaries are tested exactly because they will be argued about at 11pm on launch
 * night: is 1500 ms a pass or a fail? (It is a pass — the budget is "≤ 1.5 s", and a run that
 * lands on the number is not a reason to delay a launch.)
 */
final class ProbeTargetTest extends TestCase
{
    private function report(float $p95, int $samples = 100, int $serverErrors = 0, int $networkErrors = 0): LoadReport
    {
        $list = [];

        for ($i = 0; $i < $samples; $i++) {
            $list[] = new LoadSample('catalog', $i < $serverErrors ? 500 : 200, $p95);
        }

        for ($i = 0; $i < $networkErrors; $i++) {
            $list[] = LoadSample::failed('catalog', $p95, 'timeout');
        }

        return LoadReport::fromSamples($list);
    }

    public function testAFastCleanRunPasses(): void
    {
        $target = new ProbeTarget;

        Assert::same([], $target->violations(['catalog' => $this->report(820.0)]), '420 ms under budget');
        Assert::true($target->passes(['catalog' => $this->report(820.0)]), 'and the verdict agrees');
    }

    public function testALandingOnTheBudgetIsAPass(): void
    {
        $target = new ProbeTarget(p95Ms: 1500.0);

        Assert::same([], $target->violations(['catalog' => $this->report(1500.0)]), 'exactly 1500 ms is within "≤ 1.5 s"');
        Assert::same(1, count($target->violations(['catalog' => $this->report(1500.1)])), 'a tenth of a millisecond over is not');
    }

    public function testASlowP95FailsAndSaysByHowMuch(): void
    {
        $violations = (new ProbeTarget)->violations(['catalog' => $this->report(2400.0)]);

        Assert::same(1, count($violations), 'one reason');
        Assert::true(str_contains($violations[0], '2400'), 'the actual number is in the message');
        Assert::true(str_contains($violations[0], '1500'), 'and so is the budget');
        Assert::true(str_contains($violations[0], 'catalog'), 'and which probe it was');
    }

    public function testASingleServerErrorFailsTheRun(): void
    {
        $violations = (new ProbeTarget)->violations(['catalog' => $this->report(300.0, 100, 1)]);

        Assert::same(1, count($violations), 'one 5xx is not a rounding error');
        Assert::true(str_contains($violations[0], 'server errors'), 'and it is named');
    }

    public function testAFourHundredIsNotAServerError(): void
    {
        $samples = [new LoadSample('catalog', 404, 20.0), new LoadSample('catalog', 200, 20.0)];

        Assert::same(
            [],
            (new ProbeTarget)->violations(['catalog' => LoadReport::fromSamples($samples)]),
            'a 404 is a data problem, not a capacity one — the probe reports it, the target does not fail on it',
        );
    }

    public function testAFlakyNetworkFailsOnTheErrorRate(): void
    {
        $violations = (new ProbeTarget(maxErrorRate: 0.01))->violations([
            'catalog' => $this->report(400.0, 50, 0, 3),
        ]);

        Assert::same(1, count($violations), '3 failures in 53 requests is 5.7%, over the 1% budget');
        Assert::true(str_contains($violations[0], '%'), 'reported as a percentage');
    }

    public function testAnEmptyReportIsNotASilentPass(): void
    {
        $target = new ProbeTarget;

        Assert::same([], $target->violations(['catalog' => LoadReport::fromSamples([])]), 'zero requests cannot violate a latency budget');

        // Which is exactly why the command fails earlier when it could not reach the host at
        // all — an empty report must never be mistaken for a good one.
        Assert::same(false, (new ProbeTarget)->passes(['catalog' => LoadReport::fromSamples([LoadSample::failed('catalog', 5000.0, 'DNS')])]), 'but a DNS failure does fail');
    }

    public function testAnOversellFailsTheRunWhateverTheLatency(): void
    {
        $audit = new OversellAudit(
            expected: ['WX-1019' => 1],
            granted: ['WX-1019' => 2],
        );

        $violations = (new ProbeTarget)->violations(['catalog' => $this->report(120.0)], $audit);

        Assert::same(1, count($violations), 'a fast site that sells the same chair twice is not passing');
        Assert::true(str_contains($violations[0], 'OVERSELL'), 'and the verdict says so in one word');
    }

    public function testACleanRacePasses(): void
    {
        $audit = new OversellAudit(expected: ['WX-1019' => 1], granted: ['WX-1019' => 1]);

        Assert::true((new ProbeTarget)->passes(['checkout' => $this->report(900.0)], $audit), 'one unit, one order');
    }

    public function testTheTargetCanBeOverriddenFromConfiguration(): void
    {
        $target = new ProbeTarget(p95Ms: 800.0, maxServerErrors: 2);

        Assert::same([], (new ProbeTarget(p95Ms: 1500.0))->violations(['x' => $this->report(1000.0)]), 'the default allows it');
        Assert::same(1, count($target->violations(['x' => $this->report(1000.0)])), 'a stricter target does not');
    }
}
