<?php

declare(strict_types=1);

namespace Tests\Probe;

use App\Domain\Commerce\Probe\LoadReport;
use App\Domain\Commerce\Probe\LoadSample;
use InvalidArgumentException;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The statistics behind the T12 gate.
 *
 * A percentile is easy to get subtly wrong — off by one on the rank, interpolated when it
 * should not be, or computed over the wrong list — and the failure is silent: a probe that
 * reports p95 = 900 ms when the real 95th percentile is 4 s looks exactly like a passing run.
 * So the arithmetic is pinned against hand-checkable cases.
 */
final class LoadReportTest extends TestCase
{
    public function testOneHundredSamplesGiveTheTextbookPercentiles(): void
    {
        // 1..100 ms, so p50 = 50, p95 = 95, p99 = 99 by nearest rank, with no interpolation.
        $samples = [];

        for ($ms = 1; $ms <= 100; $ms++) {
            $samples[] = new LoadSample('catalog', 200, (float) $ms);
        }

        $report = LoadReport::fromSamples($samples);

        Assert::same(100, $report->total, 'every sample is counted');
        Assert::same(50.0, $report->p50, 'median');
        Assert::same(95.0, $report->p95, 'p95 is a value a request actually had');
        Assert::same(99.0, $report->p99, 'p99');
        Assert::same(1.0, $report->min, 'fastest');
        Assert::same(100.0, $report->max, 'slowest');
        Assert::same(50.5, $report->mean, 'and the mean, which is not the number that matters');
    }

    public function testTwentySamplesPutTheNinetyFifthOnTheNineteenth(): void
    {
        $samples = [];

        for ($ms = 1; $ms <= 20; $ms++) {
            $samples[] = new LoadSample('catalog', 200, (float) $ms);
        }

        $report = LoadReport::fromSamples($samples);

        Assert::same(19.0, $report->p95, 'ceil(0.95 × 20) = 19, so the 19th value');
        Assert::same(10.0, $report->p50, 'and the median is the 10th');
    }

    public function testASingleOutlierInATinySampleIsNotAP95(): void
    {
        // One slow request in twenty is 5% — exactly the boundary — so nearest rank puts it at
        // the very top: p95 is still 50 ms. This is arithmetic, not a bug, and it is the reason
        // the probe runs ten waves instead of five requests, and why the report prints `max`.
        $one = array_fill(0, 19, new LoadSample('catalog', 200, 50.0));
        $one[] = new LoadSample('catalog', 200, 4000.0);

        $report = LoadReport::fromSamples($one);

        Assert::same(247.5, $report->mean, 'the mean absorbs the outlier');
        Assert::same(50.0, $report->p95, 'and with 20 samples the p95 does too');
        Assert::same(4000.0, $report->max, 'which is why the slowest request is always printed');

        // Two slow requests in twenty is 10%, and the p95 catches that.
        $two = array_fill(0, 18, new LoadSample('catalog', 200, 50.0));
        $two[] = new LoadSample('catalog', 200, 4000.0);
        $two[] = new LoadSample('catalog', 200, 4000.0);

        Assert::same(4000.0, LoadReport::fromSamples($two)->p95, 'a real 10% tail is not hidden');
    }

    public function testErrorsAreCountedByWhoseFaultItIs(): void
    {
        $report = LoadReport::fromSamples([
            new LoadSample('catalog', 200, 40.0),
            new LoadSample('catalog', 304, 20.0),
            new LoadSample('catalog', 404, 30.0),
            new LoadSample('catalog', 422, 30.0),
            new LoadSample('catalog', 500, 900.0),
            new LoadSample('catalog', 503, 1200.0),
            LoadSample::failed('catalog', 5000.0, 'Operation timed out'),
        ]);

        Assert::same(7, $report->total, 'seven requests');
        Assert::same(2, $report->successes, '200 and 304');
        Assert::same(2, $report->clientErrors, '404 and 422 — reported, but a checkout probe expects them');
        Assert::same(2, $report->serverErrors, '500 and 503 — never acceptable');
        Assert::same(1, $report->networkErrors, 'a timeout is an error, not a status');
        Assert::same(3 / 7, $report->errorRate(), 'the failure rate counts the server\'s fault, not the caller\'s');
    }

    public function testStatusCodesAreGroupedForTheReport(): void
    {
        $report = LoadReport::fromSamples([
            new LoadSample('catalog', 200, 10.0),
            new LoadSample('catalog', 200, 12.0),
            new LoadSample('catalog', 409, 30.0),
            LoadSample::failed('catalog', 100.0, 'Connection refused'),
        ]);

        Assert::same(['200' => 2, '409' => 1, 'network' => 1], $report->statusCodes(), 'grouped and sorted');
    }

    public function testAnEmptyRunIsAZeroReportRatherThanADivisionByZero(): void
    {
        $report = LoadReport::fromSamples([]);

        Assert::same(0, $report->total, 'nothing ran');
        Assert::same(0.0, $report->p95, 'no percentile');
        Assert::same(0.0, $report->errorRate(), 'no rate');
        Assert::same([], $report->statusCodes(), 'no codes');
    }

    public function testPercentilesNeverPointOutsideTheList(): void
    {
        Assert::same(0.0, LoadReport::percentile([], 95), 'empty list');
        Assert::same(1.0, LoadReport::percentile([1.0, 2.0, 3.0], 0), 'p0 is the fastest');
        Assert::same(3.0, LoadReport::percentile([1.0, 2.0, 3.0], 100), 'p100 is the slowest');
        Assert::same(3.0, LoadReport::percentile([1.0, 2.0, 3.0], 99), 'p99 of three samples is the last one');
        Assert::same(1.0, LoadReport::percentile([1.0, 2.0, 3.0], 30), 'and a low percentile is the first');
    }

    public function testTheReportSerialisesToTheShapeTheJsonFileUses(): void
    {
        $array = LoadReport::fromSamples([new LoadSample('catalog', 200, 123.45)])->toArray();

        foreach (['total', 'successes', 'server_errors', 'p95_ms', 'status_codes'] as $key) {
            Assert::true(array_key_exists($key, $array), "the report carries {$key}");
        }

        Assert::same(123.5, $array['p95_ms'], 'milliseconds are rounded for reading, not for deciding');
    }

    public function testASampleThatIsNotASampleIsRefused(): void
    {
        Assert::throws(
            InvalidArgumentException::class,
            static fn () => LoadReport::fromSamples([['status' => 200]]),
            'a probe that passes the wrong type should fail loudly, not report zeros',
        );
    }
}
