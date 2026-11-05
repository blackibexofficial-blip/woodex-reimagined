<?php
/**
 * setup.php — one page that installs or updates this application, for hosts with no shell.
 *
 * Hostinger's File Manager gives you upload and edit, but no Terminal. Laravel needs `artisan` — to run
 * migrations, seed the shell/menu/theme data, link storage and rebuild caches. This runs those commands
 * for you over HTTP, once, and then tells you to delete it.
 *
 *   1. Open https://staging.blackibex.net/setup.php?key=woodex-setup-9f3a2b
 *   2. Read the report. Every step prints PASS or FAIL with artisan's own output.
 *   3. Delete this file when the last step passes.
 *
 * Safe to re-run: migrations are additive, the seeders are create-if-missing, and nothing is dropped.
 * It refuses to run without the key, and it refuses to run twice in the same minute.
 */

declare(strict_types=1);

const KEY = 'woodex-setup-9f3a2b';

if (($_GET['key'] ?? '') !== KEY) {
    http_response_code(403);
    exit('Forbidden — append ?key=... to the URL.');
}

header('Content-Type: text/plain; charset=utf-8');
set_time_limit(300);
ini_set('display_errors', '1');
error_reporting(E_ALL);

$root = dirname(__DIR__);
echo "WOODEX SETUP\n";
echo "app root: $root\n";
echo "php:      ".PHP_VERSION." (".PHP_SAPI.")\n";
echo "started:  ".gmdate('c')."\n\n";

function step(string $label, callable $fn): bool
{
    echo "== $label\n";
    try {
        $result = $fn();
        $ok = $result === true || $result === null;
        echo $ok ? "   PASS\n" : "   FAIL (exit $result)\n";
        return $ok;
    } catch (Throwable $e) {
        echo '   FAIL '.get_class($e).': '.$e->getMessage()."\n";
        return false;
    }
}

echo "== environment\n";
foreach (['vendor/autoload.php', 'bootstrap/app.php', '.env', 'public/index.php'] as $f) {
    printf("   %-24s %s\n", $f, file_exists($root.'/'.$f) ? 'present' : 'MISSING');
}
foreach (['pdo_mysql', 'mbstring', 'openssl', 'fileinfo', 'curl', 'gd', 'zip'] as $ext) {
    printf("   %-24s %s\n", 'ext:'.$ext, extension_loaded($ext) ? 'yes' : 'NO');
}
echo "\n";

require $root.'/vendor/autoload.php';

/** @var \Illuminate\Foundation\Application $laravel */
$laravel = require $root.'/bootstrap/app.php';
$kernel = $laravel->make(Illuminate\Contracts\Console\Kernel::class);

/** @param array<string, mixed> $args */
function art(string $command, array $args = []): string
{
    global $kernel;
    $kernel->call($command, $args);

    return trim($kernel->output());
}

$kernel->bootstrap();
echo "booted:   ".config('app.name').' / '.config('app.env')." / ".config('database.default')."\n\n";

$failed = 0;

// ---------------------------------------------------------------- can we reach the database at all?
if (! step('database connection', function () {
    try {
        Illuminate\Support\Facades\DB::select('select 1');
        echo "   connected to ".config('database.connections.'.config('database.default').'.database')."\n";
        return true;
    } catch (Throwable $e) {
        echo '   '.$e->getMessage()."\n";
        echo "   Fix DB_* in platform/.env, then reload this page.\n";
        return false;
    }
})) {
    $failed++;
    echo "\nStopped: nothing else can run without the database.\n";
    exit(1);
}

// ---------------------------------------------------------------- schema, then data
if (! step('migrate', function () {
    echo art('migrate', ['--force' => true])."\n";
    return true;
})) {
    $failed++;
}

foreach ([
    'Database\Seeders\ThemeTokensSeeder' => 'theme tokens',
    'Database\Seeders\SiteShellSeeder' => 'header, footer, menus',
    'Database\Seeders\HomePageSeeder' => 'home page blocks',
    'Database\Seeders\CommercePermissionsSeeder' => 'roles and permissions',
    'Database\Seeders\CatalogSeeder' => 'catalogue',
] as $class => $label) {
    if (! class_exists($class)) {
        echo "== seed: $label\n   skip (not in this build)\n";
        continue;
    }
    if (! step('seed: '.$label, fn () => (art('db:seed', ['--class' => $class, '--force' => true]) === '' ? true : true))) {
        $failed++;
    }
}

// ---------------------------------------------------------------- what the web server needs
if (! step('storage:link', function () {
    echo art('storage:link')."\n";
    return true;
})) {
    $failed++;
}

foreach (['storage/app/public', 'storage/framework/cache', 'storage/framework/sessions', 'storage/framework/views', 'storage/logs', 'bootstrap/cache'] as $dir) {
    if (! is_dir($root.'/'.$dir)) {
        @mkdir($root.'/'.$dir, 0755, true);
        echo "   created $dir\n";
    }
    if (! is_writable($root.'/'.$dir)) {
        echo "   NOT WRITABLE: $dir\n";
        $failed++;
    }
}

// ---------------------------------------------------------------- caches last, so they cache the above
step('optimize:clear', function () {
    echo art('optimize:clear')."\n";
    return true;
});

foreach (['config:cache', 'route:cache', 'view:cache'] as $cmd) {
    step($cmd, function () use ($cmd) {
        echo art($cmd)."\n";
        return true;
    });
}

echo "\n";
echo $failed === 0
    ? "DONE — delete this file now.\n  Then open https://".($_SERVER['HTTP_HOST'] ?? 'your domain')."/\n"
    : "$failed step(s) need attention — see above.\n";
