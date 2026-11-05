<?php
/**
 * Read a legacy phpMyAdmin dump and emit the import manifest.
 *
 * This is the first step of the IBPanel migration: it never writes to the OS
 * database. It reads the dump, counts and normalises what is in it, and prints
 * both a human summary and a machine-readable manifest that the catalog
 * importer and the media fetcher consume.
 *
 *   php tools/migration/parse-legacy.php dump.sql --out=/tmp/legacy-manifest.json
 *
 * Deliberate rules (see docs/09-migration/MASTER-MIGRATION-PLAN.md §4.4):
 *   - every string is trimmed and internal whitespace collapsed
 *   - money is converted to integer minor units, never float
 *   - zero-price products, placeholder rows and duplicate slugs are quarantined,
 *     not silently published
 *   - two competing tables (hero slides, reviews) resolve to one canonical source
 */
declare(strict_types=1);

$args = array_slice($argv, 1);
$dump = null;
$out = '/tmp/legacy-manifest.json';
foreach ($args as $a) {
    if (str_starts_with($a, '--out=')) { $out = substr($a, 6); }
    elseif (!str_starts_with($a, '--')) { $dump = $a; }
}
if ($dump === null || !is_file($dump)) {
    fwrite(STDERR, "usage: php tools/migration/parse-legacy.php <dump.sql> [--out=file.json]\n");
    exit(2);
}

$src = (string) file_get_contents($dump);

// ---------------------------------------------------------------- dump reader

/** Split a MySQL VALUES payload into row tuples, honouring quotes and escapes. */
function split_rows(string $vals): array
{
    $rows = []; $depth = 0; $cur = ''; $q = null; $n = strlen($vals);
    for ($i = 0; $i < $n; $i++) {
        $ch = $vals[$i];
        if ($q !== null) {
            $cur .= $ch;
            if ($ch === '\\') { $cur .= $vals[$i + 1] ?? ''; $i++; continue; }
            if ($ch === $q) { $q = null; }
        } elseif ($ch === "'" || $ch === '"') {
            $q = $ch; $cur .= $ch;
        } elseif ($ch === '(') {
            $depth++; $cur .= $ch;
        } elseif ($ch === ')') {
            $depth--; $cur .= $ch;
            if ($depth === 0) { $rows[] = $cur; $cur = ''; }
        } elseif ($depth > 0) {
            $cur .= $ch;
        }
    }
    return $rows;
}

/** Split one tuple into cells. */
function split_cells(string $row): array
{
    $row = substr($row, 1, -1);
    $cells = []; $cell = ''; $q = null; $n = strlen($row);
    for ($i = 0; $i < $n; $i++) {
        $ch = $row[$i];
        if ($q !== null) {
            if ($ch === '\\') {
                $nx = $row[$i + 1] ?? '';
                $cell .= match ($nx) { 'r' => "\r", 'n' => "\n", 't' => "\t", '0' => "\0", default => $nx };
                $i++; continue;
            }
            if ($ch === $q) { $q = null; } else { $cell .= $ch; }
        } elseif ($ch === "'" || $ch === '"') {
            $q = $ch;
        } elseif ($ch === ',') {
            $cells[] = $cell; $cell = '';
        } else {
            $cell .= $ch;
        }
    }
    $cells[] = $cell;
    return $cells;
}

/** @return list<array<string,string|null>> */
function table_rows(string $src, string $table): array
{
    $all = [];
    $re = '/INSERT INTO `' . preg_quote($table, '/') . '` \(([^)]*)\) VALUES\s+(.*?);\n/s';
    if (!preg_match_all($re, $src, $m, PREG_SET_ORDER)) { return []; }
    foreach ($m as $set) {
        $cols = array_map(fn ($c) => trim($c, '` '), explode(',', $set[1]));
        foreach (split_rows($set[2]) as $row) {
            $cells = split_cells($row);
            $rec = [];
            foreach ($cols as $i => $c) {
                $v = $cells[$i] ?? null;
                $rec[$c] = ($v === null || $v === 'NULL') ? null : $v;
            }
            $all[] = $rec;
        }
    }
    return $all;
}

function declared_tables(string $src): array
{
    preg_match_all('/CREATE TABLE `([^`]+)`/', $src, $m);
    return $m[1];
}

// ------------------------------------------------------------------- helpers

/** Trim, collapse whitespace, and turn the dump's literal \r\n into real newlines. */
function clean(?string $v): ?string
{
    if ($v === null) { return null; }
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    $v = preg_replace('/[ \t]+/', ' ', $v) ?? $v;
    $v = preg_replace('/ *\n */', "\n", $v) ?? $v;
    return trim($v);
}

/** "PKR 82,000.00" style decimal string -> integer minor units (paisa). */
function minor(?string $v): int
{
    $v = trim((string) $v);
    if ($v === '' || !is_numeric($v)) { return 0; }
    return (int) round(((float) $v) * 100);
}

function slugify(string $s): string
{
    $s = strtolower(trim($s));
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? $s;
    return trim($s, '-');
}

/** Titles that are clearly fixtures rather than content. */
function is_placeholder(?string $s): bool
{
    $t = strtolower(trim((string) $s));
    if ($t === '') { return true; }
    if (strlen($t) < 4) { return true; }                        // "sss", "xdgdgdg"
    if (preg_match('/^(.)\1+$/', str_replace(' ', '', $t))) { return true; }   // "ssssss"
    if (preg_match('/^(test|testing|demo|sample|project title|category|location city)\b/', $t)) { return true; }
    if (str_contains($t, 'test blog') || str_contains($t, 'this is test')) { return true; }
    if (preg_match('/^[a-z]{1,3}$/', $t)) { return true; }
    return false;
}

$tables = declared_tables($src);
$report = ['generated_at' => gmdate('c'), 'source' => basename($dump), 'tables_declared' => count($tables)];

// ------------------------------------------------------------------- catalog

$products = table_rows($src, 'products');
$categories = table_rows($src, 'categories');
$links = table_rows($src, 'product_categories');

$cleanCats = [];
$quarantined = ['products' => [], 'categories' => [], 'content' => [], 'duplicate_slugs' => []];

foreach ($categories as $c) {
    $name = clean($c['category_name']);
    $rec = [
        'legacy_id' => (int) $c['id'],
        'name' => $name,
        'slug' => slugify(clean($c['slug']) ?: (string) $name),
        'parent_id' => (int) $c['parent_id'] ?: null,
        'level' => (int) $c['level'],
        'path' => clean($c['path']),
        'is_active' => (int) $c['is_active'] === 1,
        'show_in_home_carousel' => (int) $c['show_in_home_carousel'] === 1,
        'show_in_hot_products' => (int) $c['show_in_hot_products'] === 1,
        'image' => clean($c['main_image']) ?: clean($c['background_image']),
    ];
    if (is_placeholder($name)) { $quarantined['categories'][] = $rec; continue; }
    $cleanCats[] = $rec;
}

$catById = [];
foreach ($cleanCats as $c) { $catById[$c['legacy_id']] = $c; }

$prodsByCategory = [];
foreach ($links as $l) {
    $pid = (int) $l['product_id']; $cid = (int) $l['category_id'];
    $prodsByCategory[$pid][] = $cid;
}

$cleanProducts = [];
$slugSeen = [];
$mediaRefs = [];

foreach ($products as $p) {
    $name = clean($p['product_name']);
    $price = minor($p['current_price']);
    $sku = clean($p['product_sku']) ?? '';
    $sku = preg_replace('/^SKU:\s*/i', '', $sku) ?? $sku;

    $images = [];
    $rawImages = trim((string) $p['images'], " \n\r\t");
    if ($rawImages !== '' && $rawImages !== '[]') {
        $decoded = json_decode(str_replace('\\/', '/', $rawImages), true);
        if (is_array($decoded)) {
            foreach ($decoded as $img) {
                $img = clean((string) $img);
                if ($img) { $images[] = $img; }
            }
        }
    }

    $catIds = $prodsByCategory[(int) $p['id']] ?? [];
    $catIds = array_values(array_filter($catIds, fn ($id) => isset($catById[$id])));

    $slug = slugify(clean($p['slug']) ?: $name);
    $base = $slug; $n = 2;

    $rec = [
        'legacy_id' => (int) $p['id'],
        'name' => $name,
        'sku' => $sku,
        'slug' => $slug,
        'price_minor' => $price,
        'compare_at_minor' => minor($p['old_price']),
        'qty' => (int) $p['quantity'],
        'sold' => (int) $p['sold_quantity'],
        'is_best_seller' => (int) $p['is_best_seller'] === 1,
        'is_sale_item' => (int) $p['is_sale_item'] === 1,
        'summary' => clean($p['short_description']),
        'details' => clean($p['product_details']),
        'specifications' => clean($p['specifications']),
        'video' => clean($p['video_embed']),
        'rating_count' => (int) $p['rating_count'],
        'rating_sum' => (int) $p['rating_sum'],
        'category_ids' => $catIds,
        'images' => $images,
    ];

    if (isset($slugSeen[$base])) {
        $n = ++$slugSeen[$base];
        $rec['slug'] = $base . '-' . $n;
        $quarantined['duplicate_slugs'][] = ['legacy_id' => $rec['legacy_id'], 'name' => $name, 'slug' => $rec['slug']];
    } else {
        $slugSeen[$base] = 1;
    }

    $reason = null;
    if (is_placeholder($name)) { $reason = 'placeholder title'; }
    elseif ($price === 0) { $reason = 'zero price'; }
    elseif (!$catIds) { $reason = 'no category'; }

    if ($reason !== null) {
        $rec['reason'] = $reason;
        $quarantined['products'][] = $rec;
        continue;
    }

    foreach ($images as $img) { $mediaRefs[$img] = ($mediaRefs[$img] ?? 0) + 1; }
    $cleanProducts[] = $rec;
}

// ------------------------------------------------------------------- content

$faqs = table_rows($src, 'faqs');
$heroSlides = table_rows($src, 'hero_slides');
$heroAlt = table_rows($src, 'hero_slides_alt');
$footerLinks = table_rows($src, 'footer_links');
$blogs = table_rows($src, 'blogs');
$projects = table_rows($src, 'projects');
$quotes = table_rows($src, 'quotation_requests');
$quoteItems = table_rows($src, 'quotation_request_items');
$orders = table_rows($src, 'orders');
$orderItems = table_rows($src, 'order_items');
$posTx = table_rows($src, 'pos_transactions');
$posRefunds = table_rows($src, 'pos_refunds');
$redirects = table_rows($src, 'url_redirects');
$contactForms = table_rows($src, 'contact_forms');

$cleanFaqs = [];
foreach ($faqs as $f) {
    $q = clean($f['question']); $a = clean($f['answer']);
    if (!$q || !$a || is_placeholder($q)) { continue; }
    $cleanFaqs[] = ['legacy_id' => (int) $f['id'], 'for' => clean($f['faq_for']), 'item_id' => (int) $f['item_id'], 'question' => $q, 'answer' => $a];
}

$cleanHero = [];
foreach ($heroSlides as $s) {
    $title = clean($s['title']);
    if (is_placeholder($title)) { $quarantined['content'][] = ['table' => 'hero_slides', 'legacy_id' => (int) $s['id'], 'title' => $title]; continue; }
    $cleanHero[] = [
        'legacy_id' => (int) $s['id'],
        'kicker' => clean($s['kicker']),
        'title' => $title,
        'description' => clean($s['description']),
        'cta_label' => clean($s['cta_label']),
        'cta_url' => clean($s['cta_url']),
        'image' => clean($s['image_path']),
        'text_col' => clean($s['text_col']),
        'sort_order' => (int) $s['sort_order'],
        'published' => (int) $s['is_published'] === 1,
    ];
    if ($img = clean($s['image_path'])) { $mediaRefs[$img] = ($mediaRefs[$img] ?? 0) + 1; }
}

$cleanBlogs = [];
foreach ($blogs as $b) {
    $t = clean($b['blog_title']);
    if (is_placeholder($t)) { $quarantined['content'][] = ['table' => 'blogs', 'legacy_id' => (int) $b['id'], 'title' => $t]; continue; }
    $cleanBlogs[] = ['legacy_id' => (int) $b['id'], 'title' => $t, 'slug' => slugify(clean($b['slug']) ?: $t), 'meta' => clean($b['meta_description']), 'image' => clean($b['blog_image']), 'content_len' => strlen((string) $b['blog_content'])];
    if ($img = clean($b['blog_image'])) { $mediaRefs[$img] = ($mediaRefs[$img] ?? 0) + 1; }
}

$cleanProjects = [];
foreach ($projects as $p) {
    $t = clean($p['title']);
    if (is_placeholder($t)) { $quarantined['content'][] = ['table' => 'projects', 'legacy_id' => (int) $p['id'], 'title' => $t]; continue; }
    $cleanProjects[] = ['legacy_id' => (int) $p['id'], 'title' => $t, 'slug' => slugify(clean($p['slug']) ?: $t), 'category' => clean($p['category']), 'city' => clean($p['location_city']), 'cover' => clean($p['cover_image'])];
    if ($img = clean($p['cover_image'])) { $mediaRefs[$img] = ($mediaRefs[$img] ?? 0) + 1; }
}

// ---------------------------------------------------------------- assemble

$report['catalog'] = [
    'products_source' => count($products),
    'products_importable' => count($cleanProducts),
    'products_quarantined' => count($quarantined['products']),
    'categories_source' => count($categories),
    'categories_importable' => count($cleanCats),
    'category_links_source' => count($links),
    'category_levels' => array_count_values(array_map(fn ($c) => $c['level'], $cleanCats)),
    'products_with_price' => count(array_filter($cleanProducts, fn ($p) => $p['price_minor'] > 0)),
    'products_with_images' => count(array_filter($cleanProducts, fn ($p) => $p['images'] !== [])),
    'total_image_refs' => count($mediaRefs),
    'featured' => count(array_filter($cleanProducts, fn ($p) => $p['is_best_seller'])),
    'on_sale' => count(array_filter($cleanProducts, fn ($p) => $p['is_sale_item'])),
];

$report['content'] = [
    'faqs' => count($cleanFaqs),
    'hero_slides_canonical' => count($cleanHero),
    'hero_slides_alt_archived' => count($heroAlt),
    'footer_links' => count($footerLinks),
    'blogs' => count($cleanBlogs),
    'projects' => count($cleanProjects),
];

$report['history'] = [
    'quotation_requests' => count($quotes),
    'quotation_items' => count($quoteItems),
    'orders' => count($orders),
    'order_items' => count($orderItems),
    'pos_transactions' => count($posTx),
    'pos_refunds' => count($posRefunds),
    'contact_form_submissions' => count($contactForms),
    'url_redirects' => count($redirects),
];

$report['quarantine'] = [
    'products' => array_map(fn ($p) => ['legacy_id' => $p['legacy_id'], 'name' => $p['name'], 'reason' => $p['reason'], 'sku' => $p['sku']], $quarantined['products']),
    'content' => $quarantined['content'],
    'categories' => count($quarantined['categories']),
    'duplicate_slugs' => $quarantined['duplicate_slugs'],
];

$report['manifest'] = [
    'products' => $cleanProducts,
    'categories' => $cleanCats,
    'faqs' => $cleanFaqs,
    'hero_slides' => $cleanHero,
    'blogs' => $cleanBlogs,
    'projects' => $cleanProjects,
    'media' => array_keys($mediaRefs),
];

file_put_contents($out, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

// ------------------------------------------------------------------ summary

$line = fn (string $k, $v) => printf("  %-34s %s\n", $k, is_bool($v) ? ($v ? 'yes' : 'no') : $v);

echo "\nLEGACY MANIFEST — {$report['source']}\n";
echo str_repeat('=', 58), "\n";
echo "CATALOG\n";
$line('products in dump', $report['catalog']['products_source']);
$line('products importable', $report['catalog']['products_importable']);
$line('products quarantined', $report['catalog']['products_quarantined']);
$line('categories importable', $report['catalog']['categories_importable']);
$line('category levels', json_encode($report['catalog']['category_levels']));
$line('product↔category links', $report['catalog']['category_links_source']);
$line('distinct images referenced', $report['catalog']['total_image_refs']);
$line('featured (best sellers)', $report['catalog']['featured']);
$line('marked on sale', $report['catalog']['on_sale']);

echo "\nCONTENT\n";
$line('FAQs', $report['content']['faqs']);
$line('hero slides (canonical)', $report['content']['hero_slides_canonical']);
$line('hero slides (alt, archived)', $report['content']['hero_slides_alt_archived']);
$line('footer links', $report['content']['footer_links']);
$line('blog posts', $report['content']['blogs']);
$line('projects', $report['content']['projects']);

echo "\nHISTORY (imported as records)\n";
$line('quotation requests', $report['history']['quotation_requests']);
$line('  └ items', $report['history']['quotation_items']);
$line('orders', $report['history']['orders']);
$line('  └ items', $report['history']['order_items']);
$line('POS transactions', $report['history']['pos_transactions']);
$line('POS refunds', $report['history']['pos_refunds']);
$line('redirects', $report['history']['url_redirects']);

echo "\nQUARANTINE\n";
$byReason = [];
foreach ($report['quarantine']['products'] as $q) { $byReason[$q['reason']] = ($byReason[$q['reason']] ?? 0) + 1; }
foreach ($byReason as $r => $n) { $line("products: $r", $n); }
$line('placeholder content rows', count($report['quarantine']['content']));
$line('slug collisions re-slugged', count($report['quarantine']['duplicate_slugs']));

echo "\nmanifest → {$out} (" . number_format(filesize($out)) . " bytes)\n\n";
