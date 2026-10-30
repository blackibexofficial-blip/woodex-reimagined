<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Commerce\Checkout\Models\InventoryReservation;
use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Checkout\OrderStatus;
use App\Domain\Commerce\Probe\LoadReport;
use App\Domain\Commerce\Probe\LoadSample;
use App\Domain\Commerce\Probe\OversellAudit;
use App\Domain\Commerce\Probe\ProbeTarget;
use App\Domain\Commerce\Models\ProductVariant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * T12's gate: is this site fast enough, and does it ever sell the same chair twice?
 *
 * Two probes, run separately because they answer different questions and one of them writes
 * data:
 *
 *  - **catalog** (default, safe anywhere) fires N concurrent reads at the public API and
 *    reports p50/p95/p99 against the 1.5 s budget.
 *  - **checkout** (`--checkouts=5 --sku=…`, opt-in) fires simultaneous checkouts at a variant
 *    that has one unit and then *audits the database*: one order must exist, four attempts must
 *    be refused, and no variant may have gone negative.
 *
 * curl_multi rather than a Guzzle pool: thirty concurrent requests on a shared host is exactly
 * the case where the difference matters. curl_multi streams responses as they arrive and holds
 * one buffer per request; a promise pool in Guzzle keeps more state than the account's memory
 * headroom allows.
 *
 * The probe is measured from *outside* — over HTTPS, through the same PHP-FPM workers and the
 * same opcache a customer hits. A probe that calls the controller in-process measures the code
 * and not the hosting, which is the thing the plan is actually asking about.
 */
final class LoadProbeCommand extends Command
{
    protected $signature = 'commerce:load-probe
        {--base= : Base URL to probe (default: APP_URL)}
        {--catalog=30 : Concurrent catalog requests per wave — 30 matches the entry-process ceiling of the account}
        {--waves=10 : Number of waves — 300 requests total, because 20 samples cannot tell p95 from p100}
        {--checkouts=0 : Simultaneous checkout attempts (needs --sku and --confirm-oversell-test)}
        {--sku= : The variant with exactly one unit of stock to race for}
        {--token= : Probe bypass token, when the rate limiter is configured to trust it}
        {--confirm-oversell-test : Required for --checkouts; it places real orders}
        {--json= : Write the full report here (default storage/app/load-probes/<time>.json)}';

    protected $description = 'Measure the storefront against the T12 budget and audit the checkout race.';

    public function handle(): int
    {
        $base = rtrim((string) ($this->option('base') ?: config('app.url')), '/');

        if ($base === '') {
            $this->error('No base URL. Pass --base=https://staging.example.com');

            return self::FAILURE;
        }

        $target = ProbeTarget::fromConfig();
        $reports = [];
        $audit = null;

        $this->line("Probing {$base}");
        $this->line(sprintf('Budget: p95 ≤ %.0f ms, %d server errors, %.0f%% failures.', $target->p95Ms, $target->maxServerErrors, $target->maxErrorRate * 100));

        $reports['catalog'] = $this->catalogProbe($base, $target);
        $this->renderReport('Catalog', $reports['catalog']);

        if ((int) $this->option('checkouts') > 0) {
            $audit = $this->checkoutProbe($base);

            if ($audit === null) {
                return self::FAILURE;
            }
        }

        $violations = $target->violations($reports, $audit);
        $path = $this->writeReport($base, $reports, $audit, $violations, $target);

        $this->newLine();
        $this->line("Report written to {$path}");

        if ($violations !== []) {
            $this->newLine();
            $this->error('FAILED against the T12 budget:');

            foreach ($violations as $violation) {
                $this->line('  · '.$violation);
            }

            return self::FAILURE;
        }

        $this->info('Passed: within budget, no server errors'.($audit !== null ? ', no oversell.' : '.'));

        return self::SUCCESS;
    }

    /**
     * WAVES × CONCURRENCY requests at the catalog list endpoint.
     *
     * Waves, not one burst, because a single burst measures a cold cache and a quiet worker
     * pool; ten waves of six show what a browsing session actually gets once the cache is warm
     * and the workers are reused.
     */
    private function catalogProbe(string $base, ProbeTarget $target): LoadReport
    {
        $concurrency = max(1, (int) $this->option('catalog'));
        $waves = max(1, (int) $this->option('waves'));

        $url = $base.'/api/storefront/v1/products?per_page=24';
        $samples = [];

        $bar = $this->output->createProgressBar($waves);
        $bar->start();

        for ($wave = 0; $wave < $waves; $wave++) {
            $samples = array_merge($samples, $this->burst($url, $concurrency, 'catalog', $base));
            $bar->advance();
        }

        $bar->finish();
        $this->newLine();

        return LoadReport::fromSamples($samples);
    }

    /**
     * Five simultaneous checkouts for one unit of stock.
     *
     * The expectation is exact and is asserted, not eyeballed: one order, four refusals, stock
     * never below zero. `OversellAudit` reads the result back from the database after the
     * transactions have finished — which is the only place the truth about what was sold lives.
     */
    private function checkoutProbe(string $base): ?OversellAudit
    {
        if (! $this->option('confirm-oversell-test')) {
            $this->error('Refusing to place real orders without --confirm-oversell-test.');

            return null;
        }

        $sku = (string) $this->option('sku');
        $variant = $sku !== '' ? ProductVariant::query()->where('sku', $sku)->first() : null;

        if ($variant === null) {
            $this->error("Variant [{$sku}] not found. The race needs a SKU with exactly one unit.");

            return null;
        }

        $before = (int) $variant->inventory()->sum('qty');
        $attempts = max(2, (int) $this->option('checkouts'));

        // Snapshot the id boundary rather than filtering by time: the probe must not count an
        // order placed a minute earlier by someone else, and a clock shared with the database
        // is one assumption fewer.
        $maxOrderIdBefore = (int) Order::query()->max('id');

        $url = $base.'/api/storefront/v1/checkout/race';
        $samples = $this->burst($url, $attempts, 'checkout', $base, $this->racePayload((int) $variant->id));

        $report = LoadReport::fromSamples($samples);
        $this->renderReport('Checkout race', $report);

        // Re-read the world after the dust settles — from the database, not from the responses.
        $claimed = (int) DB::table('commerce_order_items')
            ->join('commerce_orders', 'commerce_orders.id', '=', 'commerce_order_items.order_id')
            ->where('commerce_order_items.order_id', '>', $maxOrderIdBefore)
            ->where('commerce_order_items.variant_id', $variant->id)
            ->whereIn('commerce_orders.status', [
                OrderStatus::PLACED,
                OrderStatus::CONFIRMED,
                OrderStatus::PACKED,
                OrderStatus::SHIPPED,
                OrderStatus::DELIVERED,
            ])
            ->sum('commerce_order_items.qty');

        $held = (int) InventoryReservation::query()
            ->held()
            ->where('variant_id', $variant->id)
            ->sum('qty');

        $audit = new OversellAudit(
            expected: [(string) $variant->sku => $before],
            granted: [(string) $variant->sku => $claimed + $held],
        );

        $created = (int) Order::query()->where('id', '>', $maxOrderIdBefore)->count();

        $this->table(['', 'Value'], [
            ['Units before', $before],
            ['Units claimed', $claimed],
            ['Units held', $held],
            ['Orders created', $created],
            ['Expected orders', min($attempts, $before)],
            ['2xx responses', $report->successes],
            ['4xx refusals', $report->clientErrors],
            ['5xx responses', $report->serverErrors],
        ]);

        if ($created > min($attempts, $before)) {
            $this->error("OVERSELL: {$created} orders were created for {$before} unit(s).");
        }

        return $audit;
    }

    /**
     * Fire `$count` requests at once and time each one individually.
     *
     * @param  array<string, mixed>|null  $payload
     * @return list<LoadSample>
     */
    private function burst(string $url, int $count, string $label, string $base, ?array $payload = null): array
    {
        $multi = curl_multi_init();
        $handles = [];
        $started = [];

        for ($i = 0; $i < $count; $i++) {
            $handle = curl_init($url);

            curl_setopt_array($handle, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT_MS => 10_000,
                CURLOPT_CONNECTTIMEOUT_MS => 3_000,
                CURLOPT_HTTPHEADER => array_filter([
                    'Accept: application/json',
                    $this->option('token') ? 'X-Load-Probe: '.$this->option('token') : null,
                    $payload !== null ? 'Content-Type: application/json' : null,
                    'Referer: '.$base,
                ]),
                CURLOPT_FOLLOWLOCATION => false,
            ]);

            if ($payload !== null) {
                curl_setopt($handle, CURLOPT_POST, true);
                curl_setopt($handle, CURLOPT_POSTFIELDS, json_encode($payload, JSON_THROW_ON_ERROR));
            }

            curl_multi_add_handle($multi, $handle);
            $handles[$i] = $handle;
            $started[$i] = microtime(true);
        }

        $samples = [];

        do {
            $status = curl_multi_exec($multi, $running);

            if ($running) {
                // 50 ms is short enough not to distort a sub-100 ms response and long enough
                // not to spin a core the account is charged for.
                curl_multi_select($multi, 0.05);
            }

            while ($info = curl_multi_info_read($multi)) {
                $handle = $info['handle'];
                $index = array_search($handle, $handles, true);
                $elapsed = (microtime(true) - ($started[$index] ?? microtime(true))) * 1000;

                if ($info['result'] !== CURLE_OK) {
                    $samples[] = LoadSample::failed($label, $elapsed, (string) curl_error($handle));
                } else {
                    $samples[] = new LoadSample($label, (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE), $elapsed);
                }

                curl_multi_remove_handle($multi, $handle);
                curl_close($handle);
            }
        } while ($running && $status === CURLM_OK);

        curl_multi_close($multi);

        return $samples;
    }

    /** @return array<string, mixed> */
    private function racePayload(int $variantId): array
    {
        return [
            'variant_id' => $variantId,
            'qty' => 1,
            'gateway' => 'cod',
            'address' => [
                'name' => 'Load probe',
                'phone' => '0300-0000000',
                'line1' => 'Probe',
                'city' => 'Lahore',
            ],
        ];
    }

    private function renderReport(string $title, LoadReport $report): void
    {
        $this->table([$title, 'Value'], [
            ['Requests', $report->total],
            ['p50', number_format($report->p50, 0).' ms'],
            ['p95', number_format($report->p95, 0).' ms'],
            ['p99', number_format($report->p99, 0).' ms'],
            ['Mean', number_format($report->mean, 0).' ms'],
            ['Slowest', number_format($report->max, 0).' ms'],
            ['2xx / 3xx', $report->successes],
            ['4xx', $report->clientErrors],
            ['5xx', $report->serverErrors],
            ['Network errors', $report->networkErrors],
        ]);
    }

    /**
     * @param  array<string, LoadReport>  $reports
     * @param  list<string>  $violations
     */
    private function writeReport(string $base, array $reports, ?OversellAudit $audit, array $violations, ProbeTarget $target): string
    {
        $payload = [
            'probed_at' => now()->toIso8601String(),
            'base' => $base,
            'target' => [
                'p95_ms' => $target->p95Ms,
                'max_server_errors' => $target->maxServerErrors,
                'max_error_rate' => $target->maxErrorRate,
            ],
            'reports' => array_map(static fn (LoadReport $report): array => $report->toArray(), $reports),
            'oversell' => $audit?->toArray(),
            'violations' => $violations,
            'passed' => $violations === [],
        ];

        $path = (string) ($this->option('json') ?: 'load-probes/'.now()->format('Y-m-d-His').'.json');

        Storage::disk('local')->put($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

        return $path;
    }
}
