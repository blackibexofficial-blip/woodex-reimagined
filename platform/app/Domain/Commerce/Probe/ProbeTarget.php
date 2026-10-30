<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Probe;

/**
 * The pass mark, in one place.
 *
 * Written down as a class rather than as numbers inside a command so the target can be argued
 * with, changed once, and quoted in the same units the report prints. The plan's target is
 * p95 < 1.5 s with no 5xx — those two numbers decide whether the site is ready, and a probe
 * that only prints a table leaves the decision to whoever is reading it at 11pm.
 */
final readonly class ProbeTarget
{
    public function __construct(
        public float $p95Ms = 1500.0,
        public int $maxServerErrors = 0,
        public float $maxErrorRate = 0.01,
        public int $maxOversell = 0,
    ) {}

    public static function fromConfig(): self
    {
        return new self(
            p95Ms: (float) config('commerce.probe.p95_ms', 1500.0),
            maxServerErrors: (int) config('commerce.probe.max_server_errors', 0),
            maxErrorRate: (float) config('commerce.probe.max_error_rate', 0.01),
            maxOversell: (int) config('commerce.probe.max_oversell', 0),
        );
    }

    /**
     * Every reason the probe failed, in the order a person would want to read them.
     *
     * Pages are measured by the p95, not the mean: an average hides the request that took four
     * seconds, and that request is the one a customer abandoned.
     *
     * @param  array<string, LoadReport>  $reports  endpoint label => report
     */
    public function violations(array $reports, ?OversellAudit $audit = null): array
    {
        $reasons = [];

        foreach ($reports as $label => $report) {
            if ($report->total === 0) {
                continue;
            }

            if ($report->p95 > $this->p95Ms) {
                $reasons[] = sprintf(
                    '%s: p95 %.0f ms is above the %.0f ms budget',
                    $label,
                    $report->p95,
                    $this->p95Ms,
                );
            }

            if ($report->serverErrors > $this->maxServerErrors) {
                $reasons[] = sprintf(
                    '%s: %d server errors (5xx), budget %d',
                    $label,
                    $report->serverErrors,
                    $this->maxServerErrors,
                );
            }

            if ($report->errorRate() > $this->maxErrorRate) {
                $reasons[] = sprintf(
                    '%s: %.1f%% of requests failed, budget %.1f%%',
                    $label,
                    $report->errorRate() * 100,
                    $this->maxErrorRate * 100,
                );
            }
        }

        if ($audit !== null) {
            foreach ($audit->violations() as $violation) {
                $reasons[] = $violation;
            }
        }

        return $reasons;
    }

    /**
     * @param  array<string, LoadReport>  $reports
     */
    public function passes(array $reports, ?OversellAudit $audit = null): bool
    {
        return $this->violations($reports, $audit) === [];
    }
}
