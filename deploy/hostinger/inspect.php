<?php
/**
 * inspect.php — a read-only report of the server, for hosts with no shell.
 *
 * Hostinger shared hosting usually has no Terminal in hPanel, and the hPanel Git deploy only clones and
 * publishes — it cannot build Vite, and it only runs `composer install` when it finds a composer.json.
 * That leaves no way to answer the one question that decides every deployment: what is actually in the
 * document root, and is there an application there?
 *
 * Upload this file to the document root that serves the domain, open it in a browser with the key below,
 * and it prints the answer. It writes nothing, executes nothing, and reads no secret values — only which
 * keys exist.
 *
 *   1. Change KEY to your own long random string.
 *   2. Upload to e.g. public_html/ (or the subdomain's document root).
 *   3. Open https://staging.blackibex.net/inspect.php?key=YOUR_KEY
 *   4. Copy the whole output back.
 *   5. Delete the file.
 *
 * Reads only: scandir, file_get_contents on index.php/.htaccess (already public behaviour), phpversion.
 * Never prints the value of a .env entry — only its name.
 */

declare(strict_types=1);

const KEY = 'CHANGE_THIS_TO_YOUR_OWN_LONG_CODE';

if (($_GET['key'] ?? '') !== KEY || KEY === 'CHANGE_THIS_TO_YOUR_OWN_LONG_CODE') {
    http_response_code(403);
    exit('Forbidden — set KEY in this file, then pass it as ?key=');
}

header('Content-Type: text/plain; charset=utf-8');

$root = __DIR__;
echo "WOODEX INSPECT\n";
echo "generated: ".gmdate('c')."\n\n";

echo "== this script\n";
echo "  __DIR__        : $root\n";
echo "  document root  : ".($_SERVER['DOCUMENT_ROOT'] ?? 'unknown')."\n";
echo "  request host   : ".($_SERVER['HTTP_HOST'] ?? 'unknown')."\n";
echo "  php            : ".PHP_VERSION." (".PHP_SAPI.")\n";
echo "  user           : ".(function_exists('posix_getpwuid') && function_exists('posix_geteuid')
    ? (posix_getpwuid(posix_geteuid())['name'] ?? '?') : (get_current_user() ?: '?'))."\n\n";

echo "== document root listing\n";
foreach (@scandir($root) ?: [] as $entry) {
    if ($entry === '.' || $entry === '..') {
        continue;
    }
    $path = $root.'/'.$entry;
    $type = is_link($path) ? 'link -> '.@readlink($path) : (is_dir($path) ? 'dir' : 'file');
    $size = is_file($path) ? ' ('.number_format((float) @filesize($path)).' B)' : '';
    printf("  %-40s %s%s\n", $entry.($type === 'dir' ? '/' : ''), $type, $size);
}

echo "\n== is there an application here?\n";
$candidates = [
    'this dir'          => $root,
    'this dir/platform' => $root.'/platform',
    'parent'            => dirname($root),
    'parent/platform'   => dirname($root).'/platform',
];
$appFound = false;
foreach ($candidates as $label => $dir) {
    $marks = [];
    foreach (['artisan', 'composer.json', 'vendor/autoload.php', 'bootstrap/app.php', 'public/index.php', '.env'] as $mark) {
        if (file_exists($dir.'/'.$mark)) {
            $marks[] = $mark;
        }
    }
    if (in_array('artisan', $marks, true) || in_array('composer.json', $marks, true)) {
        $appFound = true;
        printf("  %-18s %s\n    has: %s\n", $label, $dir, implode(', ', $marks));
    }
}
if (! $appFound) {
    echo "  NONE — no artisan and no composer.json in any of: ".implode(', ', array_keys($candidates))."\n";
    echo "  A clone of the slice repository looks exactly like this. It cannot serve a site.\n";
}

echo "\n== what serves a request here\n";
foreach (['.htaccess', 'index.php', 'index.html'] as $f) {
    if (is_file($root.'/'.$f)) {
        echo "--- $f (first 40 lines)\n";
        $lines = array_slice(preg_split('/\R/', (string) @file_get_contents($root.'/'.$f)) ?: [], 0, 40);
        foreach ($lines as $line) {
            echo '    '.$line."\n";
        }
    }
}

echo "\n== .env, if one exists (names only, never values)\n";
foreach ([$root.'/.env', $root.'/platform/.env'] as $env) {
    if (! is_file($env)) {
        continue;
    }
    echo "--- ".str_replace($root, '.', $env)." (".number_format((float) filesize($env))." B, mode ".substr(sprintf('%o', fileperms($env)), -4).")\n";
    foreach (preg_split('/\R/', (string) @file_get_contents($env)) ?: [] as $line) {
        if ($line === '' || str_starts_with(ltrim($line), '#') || ! str_contains($line, '=')) {
            continue;
        }
        [$k, $v] = explode('=', $line, 2);
        $k = trim($k);
        $empty = trim($v) === '' || trim($v) === '""';
        $safe = in_array($k, ['APP_ENV', 'APP_DEBUG', 'APP_URL', 'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'LOG_CHANNEL', 'CACHE_STORE', 'SESSION_DRIVER', 'QUEUE_CONNECTION'], true);
        printf("    %-32s %s\n", $k, $empty ? '(empty)' : ($safe ? trim($v) : '(set, hidden)'));
    }
}

echo "\n== writable?\n";
foreach ([$root, $root.'/platform', $root.'/platform/storage', $root.'/platform/bootstrap/cache', $root.'/platform/public'] as $d) {
    if (is_dir($d)) {
        printf("  %-32s %s\n", str_replace($root, '.', $d), is_writable($d) ? 'writable' : 'NOT writable');
    }
}

echo "\n== done — nothing was written or executed. Delete this file when finished.\n";
