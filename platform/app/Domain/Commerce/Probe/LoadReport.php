<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Probe;

use InvalidArgumentException;

/**
 * What a probe measured, reduced to the numbers that decide whether the site is fast enough.
 *
 * Percentiles use the nearest-rank method — the p95 is the value at or below which 95% of
 * requests fall, taken from the actual samples rather than interpolated. Interpolation would
 * make a probe report a latency no request ever experienced, which is a strange thing to put in
 * a report that exists to describe real requests.
 *
 * Framework-free and pure: the transport can be curl, a queue or a test, and the arithmetic is
 * the same.
 */
final readonly class LoadReport
{
    /**
     * @param  list<LoadSample>  $samples
     */
    private function __construct(
        public array $samples,
        public int $total,
        public int $successes,
        public int $serverErrors,
        public int $clientErrors,
        public int $networkErrors,
        public float $p50,
        public float $p95,
        public float $p99,
        public float $min,
        public float $max,
        public float $mean,
    ) {}

    /**
     * @param  list<LoadSample>  $samples
     */
    public static function fromSamples(array $samples): self
    {
        foreach ($samples as $sample) {
            if (! $sample instanceof LoadSample) {
                throw new InvalidArgumentException('Every sample must be a LoadSample.');
            }
        }

        $durations = array_map(static fn (LoadSample $s): float => $s->milliseconds, $samples);
        sort($durations);

        $total = count($samples);

        return new self(
            samples: $samples,
            total: $total,
            successes: count(array_filter($samples, static fn (LoadSample $s): bool => $s->isSuccess())),
            serverErrors: count(array_filter($samples, static fn (LoadSample $s): bool => $s->isServerError())),
            clientErrors: count(array_filter($samples, static fn (LoadSample $s): bool => $s->isClientError())),
            networkErrors: count(array_filter($samples, static fn (LoadSample $s): bool => $s->isNetworkError())),
            p50: self::percentile($durations, 50),
            p95: self::percentile($durations, 95),
            p99: self::percentile($durations, 99),
            min: $total > 0 ? $durations[0] : 0.0,
            max: $total > 0 ? $durations[$total - 1] : 0.0,
            mean: $total > 0 ? array_sum($durations) / $total : 0.0,
        );
    }

    /**
     * Nearest-rank percentile over an already-sorted list.
     *
     * @param  list<float>  $sorted
     */
    public static function percentile(array $sorted, int $percent): float
    {
        $count = count($sorted);

        if ($count === 0) {
            return 0.0;
        }

        if ($percent <= 0) {
            return $sorted[0];
        }

        if ($percent >= 100) {
            return $sorted[$count - 1];
        }

        // ceil(p/100 × n) is the rank, 1-based; clamp because a percentile can never point
        // before the first sample or past the last.
        $rank = (int) ceil($percent / 100 * $count);
        $rank = max(1, min($count, $rank));

        return $sorted[$rank - 1];
    }

    /**
     * The share of requests that failed *for reasons the server is responsible for*.
     *
     * A 4xx is deliberately not in here. The checkout probe expects four of five attempts to be
     * refused — that is the whole point — so counting 409s as errors would report a correct
     * race as a broken site. Client errors are still counted and printed, separately, so a
     * catalog endpoint returning 404s cannot hide.
     */
    public function errorRate(): float
    {
        if ($this->total === 0) {
            return 0.0;
        }

        return ($this->serverErrors + $this->networkErrors) / $this->total;
    }

    /** @return array<string, int> status code => count, sorted by code */
    public function statusCodes(): array
    {
        $counts = [];

        foreach ($this->samples as $sample) {
            $key = $sample->isNetworkError() ? 'network' : (string) $sample->status;
            $counts[$key] = ($counts[$key] ?? 0) + 1;
        }

        ksort($counts);

        return $counts;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'total' => $this->total,
            'successes' => $this->successes,
            'server_errors' => $this->serverErrors,
            'client_errors' => $this->clientErrors,
            'network_errors' => $this->networkErrors,
            'p50_ms' => round($this->p50, 1),
            'p95_ms' => round($this->p95, 1),
            'p99_ms' => round($this->p99, 1),
            'min_ms' => round($this->min, 1),
            'max_ms' => round($this->max, 1),
            'mean_ms' => round($this->mean, 1),
            'status_codes' => $this->statusCodes(),
        ];
    }
}
