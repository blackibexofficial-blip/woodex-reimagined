<?php

declare(strict_types=1);

namespace Tests\Probe;

use Tests\Support\Assert;

/**
 * Wiring for the T12 gate, read as source text.
 *
 * The probe is an operational tool, which makes it the easiest thing in the codebase to get
 * dangerously wrong: an endpoint that places real orders, a rate-limit bypass, a measurement
 * that quietly measures nothing. None of that shows up in a type check, so it is pinned here.
 */
final class ProbeWiringTest
{
    private function root(): string
    {
        return dirname(__DIR__, 2);
    }

    private function source(string $relative): string
    {
        $path = $this->root().$relative;

        Assert::trueWith(is_file($path), static fn (): string => "missing file {$relative}", 'file exists');

        return is_file($path) ? (string) file_get_contents($path) : '';
    }

    public function testTheCommandMeasuresOverHttpAndNotInProcess(): void
    {
        $command = $this->source('/app/Console/Commands/LoadProbeCommand.php');

        Assert::true(str_contains($command, 'curl_multi_init'), 'concurrent requests use curl_multi');
        Assert::true(str_contains($command, 'curl_multi_exec'), 'and actually pump the multi handle');
        Assert::same(false, str_contains($command, 'curl_exec('), 'no blocking single-request loop: that measures nothing concurrent');
        Assert::true(str_contains($command, 'CURLOPT_TIMEOUT_MS'), 'a hung request cannot hang the probe');
    }

    public function testTheRaceEndpointDoesNotExistWithoutAToken(): void
    {
        $controller = $this->source('/app/Http/Controllers/Api/Storefront/CheckoutRaceController.php');
        $config = $this->source('/config/commerce.php');

        Assert::true(str_contains($controller, 'abort_unless($this->authorised($request), 404)'), 'the endpoint hides itself as a 404');
        Assert::true(str_contains($controller, 'hash_equals'), 'the token is compared in constant time');
        Assert::true(str_contains($controller, "'exists:commerce_product_variants,id'"), 'a real variant is required');
        Assert::true(str_contains($controller, 'InsufficientStock'), 'a lost race answers 409, not 500');
        Assert::true(str_contains($config, "env('COMMERCE_PROBE_TOKEN')"), 'the token has no default: unset means off');
    }

    public function testTheRateLimiterOnlyTrustsAConfiguredToken(): void
    {
        $provider = $this->source('/app/Providers/CommerceServiceProvider.php');

        Assert::true(str_contains($provider, 'public static function isProbe'), 'the check lives in one place');
        Assert::true(str_contains($provider, "config('commerce.probe.token')"), 'and reads the same config');
        Assert::true(str_contains($provider, 'is_string($expected) && $expected !== \'\''), 'an empty token exempts nobody');
        Assert::true(str_contains($provider, 'hash_equals'), 'constant-time comparison, even for a rate limiter');
    }

    public function testTheProbeRefusesToPlaceOrdersWithoutAnExplicitFlag(): void
    {
        $command = $this->source('/app/Console/Commands/LoadProbeCommand.php');

        Assert::true(str_contains($command, "--confirm-oversell-test"), 'the opt-in flag is declared');
        Assert::true(str_contains($command, 'Refusing to place real orders'), 'and the command refuses without it');
    }

    public function testTheVerdictComesFromTheTestedClassesNotFromTheOutput(): void
    {
        $command = $this->source('/app/Console/Commands/LoadProbeCommand.php');

        Assert::true(str_contains($command, 'ProbeTarget::fromConfig()'), 'thresholds come from configuration');
        Assert::true(str_contains($command, '$target->violations('), 'the verdict is the target\'s, not the table\'s');
        Assert::true(str_contains($command, 'new OversellAudit('), 'and oversell is audited from the database');
        Assert::true(str_contains($command, 'Storage::disk'), 'the full report is kept, not just printed');
    }

    public function testTheAuditReadsOrdersAndReservationsRatherThanTheProbesOwnCount(): void
    {
        $command = $this->source('/app/Console/Commands/LoadProbeCommand.php');

        Assert::true(str_contains($command, "DB::table('commerce_order_items')"), 'claimed units are counted from the order lines');
        Assert::true(str_contains($command, 'InventoryReservation::query()'), 'plus units still held by a live reservation');
        Assert::true(str_contains($command, "->held()"), 'only unreleased holds count');
    }
}
