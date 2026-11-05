<?php
/**
 * Pull the legacy catalogue's images onto the host that will serve them.
 *
 * The images are not in the SQL dump and they are not in this repository: the
 * dump stores paths like `assets/images/products/1772723876_Silvio Executive
 * Chair.jpg`, and those files live on the live server. The build sandbox cannot
 * reach woodexfurniture.pk (egress is restricted to GitHub and npm), so this has
 * to run somewhere with normal internet — a workstation, or the Hostinger box
 * itself, which is the easiest place because PHP, GD and the app are already there.
 *
 * What it does:
 *   1. reads the manifest and collects every distinct image path (145 today)
 *   2. downloads each one, following the live site's absolute-URL convention
 *   3. skips anything already downloaded, so a re-run resumes rather than restarts
 *   4. verifies each file is really an image (not an HTML error page)
 *   5. writes `photos/<SKU>__<n>.jpg` plus a manifest.json, which is the exact
 *      input `php artisan commerce:import-images --path=...` expects
 *
 *   php tools/migration/fetch-legacy-media.php \
 *       --manifest=legacy-manifest.json \
 *       --out=database/data/legacy-photos \
 *       --base=https://woodexfurniture.pk/
 *
 * Then, in the app:
 *   php artisan commerce:import-images --path=database/data/legacy-photos
 *
 * Progress is printed and the exit code is non-zero if any file failed, so a
 * partial run cannot be mistaken for a complete one.
 */
declare(strict_types=1);

$opts = ['manifest' => 'legacy-manifest.json', 'out' => 'database/data/legacy-photos', 'base' => 'https://woodexfurniture.pk/', 'limit' => '0'];
foreach (array_slice($argv, 1) as $arg) {
    if (preg_match('/^--([a-z]+)=(.*)$/', $arg, $m) && array_key_exists($m[1], $opts)) {
        $opts[$m[1]] = $m[2];
    }
}

if (! is_file($opts['manifest'])) {
    fwrite(STDERR, "No manifest at {$opts['manifest']}.\n");
    fwrite(STDERR, "Run first: php artisan commerce:import-legacy --commit\n");
    fwrite(STDERR, "That writes storage/app/migration/media-manifest.json, which carries the\n");
    fwrite(STDERR, "SKUs the database actually uses — not the legacy ones.\n");
    exit(2);
}

$data = json_decode((string) file_get_contents($opts['manifest']), true, 512, JSON_THROW_ON_ERROR);

/**
 * Two accepted shapes:
 *   - storage/app/migration/media-manifest.json (from the importer) — authoritative,
 *     because it carries the resolved SKU: 24 legacy products have no SKU and 13 SKUs
 *     are shared, so the importer derived new ones. Keying on the legacy SKU would
 *     silently skip those 24 products.
 *   - the parser's legacy-manifest.json — used only when the importer has not run yet,
 *     and it will warn, because SKUs there are the raw legacy values.
 */
$products = $data['products'] ?? null;
if (! is_array($products)) {
    fwrite(STDERR, "WARNING: this looks like a legacy manifest, whose SKUs are raw.\n");
    fwrite(STDERR, "         24 products have no SKU and 13 SKUs are shared, so some photos\n");
    fwrite(STDERR, "         will not match. Prefer storage/app/migration/media-manifest.json.\n\n");
    $products = $data['manifest']['products'] ?? [];
}

$out = rtrim($opts['out'], '/');
$base = rtrim($opts['base'], '/').'/';

if (! is_dir($out) && ! mkdir($out, 0o775, true) && ! is_dir($out)) {
    fwrite(STDERR, "Cannot create {$out}\n");
    exit(2);
}

/**
 * The manifest maps SKU => file. A product's first image is its primary; the rest
 * become gallery shots in order. Keys are SKUs because that is what
 * `commerce:import-images` looks products up by.
 *
 * @return array<string,list<string>> sku => list of remote paths
 */
$wanted = [];
foreach ($products as $p) {
    $sku = (string) ($p['sku'] ?? '');
    $images = $p['images'] ?? [];
    if ($sku === '' || ! is_array($images) || $images === []) {
        continue;
    }
    foreach ($images as $path) {
        $path = trim((string) $path);
        if ($path !== '') {
            $wanted[$sku][] = $path;
        }
    }
}

$total = array_sum(array_map('count', $wanted));
echo "Products with images: ".count($wanted)."\n";
echo "Images to fetch: {$total}\n";
echo "Output: {$out}\n\n";

$manifest = [];
$ok = 0;
$skipped = 0;
$failed = [];
$seen = [];   // remote path => local file, so one shared photo is downloaded once

$i = 0;
foreach ($wanted as $sku => $paths) {
    foreach ($paths as $n => $path) {
        $i++;
        if ($opts['limit'] !== '0' && $i > (int) $opts['limit']) {
            echo "\n(stopping at --limit)\n";
            break 2;
        }

        $safeSku = preg_replace('/[^A-Za-z0-9._-]+/', '-', $sku) ?: 'sku';
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION)) ?: 'jpg';
        $file = sprintf('%s__%d.%s', $safeSku, $n + 1, $ext);
        $target = $out.'/'.$file;

        if (isset($seen[$path])) {
            $manifest[$sku][] = $seen[$path];
            $skipped++;
            continue;
        }

        if (is_file($target) && filesize($target) > 1024) {
            $seen[$path] = $file;
            $manifest[$sku][] = $file;
            $skipped++;
            printf("[%3d/%3d] have   %s\n", $i, $total, $file);
            continue;
        }

        // The dump's paths are relative and unencoded; spaces are the common case.
        $url = $base.ltrim(str_replace(' ', '%20', $path), '/');

        $bytes = @file_get_contents($url, false, stream_context_create([
            'http' => ['timeout' => 45, 'user_agent' => 'WoodexLegacyImport/1.0', 'follow_location' => 1, 'max_redirects' => 3],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]));

        if ($bytes === false || $bytes === '') {
            $failed[] = ['sku' => $sku, 'path' => $path, 'why' => 'download failed'];
            printf("[%3d/%3d] FAIL   %s\n", $i, $total, $file);
            continue;
        }

        // A 404 that returns an HTML page would otherwise be saved as a .jpg and
        // generate a broken thumbnail three steps later, far from the cause.
        $info = @getimagesizefromstring($bytes);
        if ($info === false) {
            $failed[] = ['sku' => $sku, 'path' => $path, 'why' => 'not an image ('.strlen($bytes).' bytes)'];
            printf("[%3d/%3d] SKIP   %s — not an image\n", $i, $total, $file);
            continue;
        }

        file_put_contents($target, $bytes);
        $seen[$path] = $file;
        $manifest[$sku][] = $file;
        $ok++;
        printf("[%3d/%3d] ok     %s (%dx%d, %s)\n", $i, $total, $file, $info[0], $info[1], humanSize(strlen($bytes)));
    }
}

// `commerce:import-images` reads {"photos": {SKU: filename}} — one photo per SKU.
// Extra frames still land in the folder as <SKU>__2.jpg for the gallery import.
file_put_contents($out.'/manifest.json', json_encode(
    ['photos' => array_map(static fn (array $files): string => $files[0], $manifest)],
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
));

file_put_contents($out.'/download-report.json', json_encode(
    ['fetched' => $ok, 'already_present' => $skipped, 'failed' => $failed, 'by_sku' => $manifest],
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
));

echo "\n";
echo "  fetched            {$ok}\n";
echo "  already present    {$skipped}\n";
echo "  failed             ".count($failed)."\n";
echo "  manifest           {$out}/manifest.json\n";
if ($failed !== []) {
    echo "\nFailures (these products will fall back to a category image):\n";
    foreach (array_slice($failed, 0, 10) as $f) {
        echo "  {$f['sku']}  {$f['path']}  — {$f['why']}\n";
    }
    exit(1);
}

echo "\nNext: php artisan commerce:import-images --path={$out}\n";
exit(0);

function humanSize(int $bytes): string
{
    return $bytes >= 1048576
        ? round($bytes / 1048576, 1).' MB'
        : round($bytes / 1024).' KB';
}
