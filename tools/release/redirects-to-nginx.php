<?php
/**
 * Generate public/nginx-redirects.conf from public/redirects.json.
 *
 * `.htaccess` is written by `php artisan website:publish` (RedirectPublisher),
 * but Nginx ignores .htaccess entirely. This script translates the same map for
 * Nginx so both web servers keep the same 137 promises.
 *
 *   php tools/redirects-to-nginx.php
 *
 * Re-run it after changing a redirect in the admin and pressing Publish site.
 */
declare(strict_types=1);

$root = dirname(__DIR__);
$json = $root.'/public/redirects.json';
$out  = $root.'/public/nginx-redirects.conf';

if (! is_file($json)) {
    fwrite(STDERR, "No redirects map at {$json}. Publish the site first: php artisan website:publish\n");
    exit(1);
}

/** @var array<string, array{to?: string, code?: int}> $map */
$map = json_decode((string) file_get_contents($json), true, 512, JSON_THROW_ON_ERROR) ?: [];

$lines = [
    '# Generated from public/redirects.json by tools/redirects-to-nginx.php',
    '# Include inside the server{} block, before the main location / block.',
    '# Regenerate after `php artisan website:publish` changes the map.',
];

$count = 0;
foreach ($map as $from => $rule) {
    $to   = (string) ($rule['to'] ?? '');
    $code = (int) ($rule['code'] ?? 301);

    if ($to === '' || $to === $from) {
        continue;
    }

    // Most paths are plain slugs, which need no escaping at all. Anything with
    // a PCRE metacharacter in it is escaped, but '/' is left readable.
    $path = rtrim($from, '/');
    if (preg_match('#^[A-Za-z0-9/_.~%+-]+$#', $path)) {
        $pattern = '^'.$path.'/?$';
    } else {
        $pattern = '^'.str_replace('/', '\/', preg_quote($path, '#')).'/?$';
    }
    $status  = $code === 302 ? 'redirect' : 'permanent';

    $lines[] = sprintf('rewrite %s %s %s;', $pattern, $to, $status);
    $count++;
}

$lines[] = '';
file_put_contents($out, implode("\n", $lines));

printf("Wrote %s with %d rules.\n", $out, $count);
