<?php

declare(strict_types=1);

/**
 * Commerce configuration. Copy to `<os>/config/commerce.php`.
 *
 * Everything here has a safe default, so a fresh install works without this file. The two
 * exceptions are the probe token — which must be empty in production — and nothing else.
 */
return [
    /*
     * The T12 load probe touches real endpoints, and the public catalog is rate limited to
     * 120 requests a minute per IP precisely so that a probe cannot hammer it. A token lets
     * the probe identify itself and be exempt.
     *
     * Leave this null in production. The bypass only exists when a token is configured, and
     * the checkout-race endpoint does not exist at all without one.
     */
    'probe' => [
        'token' => env('COMMERCE_PROBE_TOKEN'),

        'p95_ms' => (float) env('COMMERCE_PROBE_P95_MS', 1500),
        'max_server_errors' => (int) env('COMMERCE_PROBE_MAX_SERVER_ERRORS', 0),
        'max_error_rate' => (float) env('COMMERCE_PROBE_MAX_ERROR_RATE', 0.01),
        'max_oversell' => (int) env('COMMERCE_PROBE_MAX_OVERSELL', 0),
    ],
];
