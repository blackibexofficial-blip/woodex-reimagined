#!/bin/sh
# Puts the furniture-commerce slice into a checkout of woodex420/woodexinterior.
#
# The slice is developed in the furniture project's repository because that is where its tests
# run without a database; the OS is where it belongs. This copies it across, including the two
# edits to files the OS already owns (the sidebar group and the route include), and then tells
# you what to run.
#
#   sh tools/furniture-commerce/apply.sh /path/to/woodexinterior
#
# It never deletes anything outside the paths it owns, never touches git, and can be re-run.
set -e

SLICE=$(cd "$(dirname "$0")/../.." && pwd)/platform
OS=${1:?usage: apply.sh /path/to/woodexinterior}
PLATFORM="$OS/platform"

[ -f "$PLATFORM/artisan" ] || { echo "not a woodex OS checkout: $OS" >&2; exit 1; }

echo "== commerce slice"
for path in \
    app/Domain/Commerce \
    app/Domain/Website/Content \
    app/Livewire/Admin/Commerce \
    app/Livewire/Admin/Website/PagesIndex.php \
    app/Livewire/Admin/Website/ContentIndex.php \
    app/Livewire/Admin/Website/MediaLibrary.php \
    app/Console/Commands/OwnerAccountCommand.php \
    app/Console/Commands/ImportProductImagesCommand.php \
    app/Http/Controllers/Site \
    app/Http/Controllers/Admin/PageDocumentController.php \
    app/Http/Controllers/Api/Storefront \
    app/Http/Controllers/Api/Site \
    app/Console/Commands/ArchiveInteriorCommand.php \
    app/Console/Commands/PublishSiteCommand.php \
    app/Console/Commands/ImportLegacyRedirectsCommand.php \
    app/Console/Commands/DemoOrderCommand.php \
    resources/views/livewire/admin/commerce \
    resources/views/admin/commerce \
    resources/views/errors/404.blade.php \
    resources/views/livewire/admin/website/pages-index.blade.php \
    resources/views/livewire/admin/website/content-index.blade.php \
    resources/views/livewire/admin/website/media-library.blade.php \
    database/seeders/CommercePermissionsSeeder.php \
    database/seeders/ThemeTokensSeeder.php \
    database/seeders/CatalogSeeder.php \
    database/seeders/data/catalog.json \
    database/seeders/SiteContentSeeder.php \
    database/seeders/data/site-content.json \
    database/data/product-photos \
    routes/commerce.php \
    routes/site.php
do
    if [ -e "$SLICE/$path" ]; then
        mkdir -p "$PLATFORM/$(dirname "$path")"
        cp -R "$SLICE/$path" "$PLATFORM/$(dirname "$path")/"
        echo "   $path"
    fi
done

echo "== migrations"
for migration in "$SLICE"/database/migrations/2026_10_28_*.php "$SLICE"/database/migrations/2026_11_01_*.php; do
    [ -f "$migration" ] || continue
    cp "$migration" "$PLATFORM/database/migrations/"
    echo "   $(basename "$migration")"
done

echo "== tests"
mkdir -p "$PLATFORM/tests/Billing" "$PLATFORM/tests/Commerce" 2>/dev/null || true
mkdir -p "$PLATFORM/tests/Site" 2>/dev/null || true
# The runner for that directory too: `tests/run.php Site` filters by *file name*, so inside a real checkout it
# also picks up the OS's InstalledSiteFixtureTest, which this framework-free runner cannot execute.
[ -f "$SLICE/tests/run-site.php" ] && cp "$SLICE/tests/run-site.php" "$PLATFORM/tests/run-site.php" && echo "   run-site.php"
# Its framework-free support, in a folder of its own: the OS's `tests/TestCase.php` is the Pest base class and
# replacing it would break the OS suite, while the storefront tests need the one that only knows `sitePath()`.
if [ -d "$SLICE/tests/standalone" ]; then
    rm -rf "$PLATFORM/tests/standalone"
    cp -R "$SLICE/tests/standalone" "$PLATFORM/tests/standalone"
    echo "   standalone/ (bootstrap, Assert, TestCase)"
fi
for suite in "$SLICE"/tests/Site/*Test.php; do
    [ -f "$suite" ] && cp "$suite" "$PLATFORM/tests/Site/" && echo "   $(basename "$suite")"
done

for suite in "$SLICE"/tests/Billing/OrderToLedgerTest.php \
             "$SLICE"/tests/Billing/PaymentToLedgerTest.php \
             "$SLICE"/tests/Billing/OneLedgerTest.php
do
    [ -f "$suite" ] && cp "$suite" "$PLATFORM/tests/Billing/" && echo "   $(basename "$suite")"
done

# Two lines in files the OS already owns: the import and the route that answers the URL every
# ProductCard has always printed. Neither file is replaced — a line is added, once, and the
# anchor is checked so a future OS rewrite is reported instead of silently patched wrong.
#
#   insert_before FILE ANCHOR TEXT LABEL [GUARD]
#
# GUARD is what proves the edit is already present. It defaults to TEXT, but a multi-line block
# in the OS never equals the one-line text we insert, so callers pass the shortest distinctive
# fragment instead — otherwise re-running would add the route a second time.
# Like insert_before, but the text comes from a file — for anything longer than one line (a route include plus
# its comment). awk -v cannot carry embedded newlines portably, so the block is read line by line.
insert_file_before() {
    file=$1; anchor=$2; blockfile=$3; label=$4; guard=$5

    if grep -qF "$guard" "$file"; then
        echo "   $label: already there"
        return
    fi

    if ! grep -qF "$anchor" "$file"; then
        echo "   $label: ANCHOR MISSING in $file — add manually from $blockfile" >&2
        return
    fi

    tmp="$file.wx-tmp"
    awk -v anchor="$anchor" -v block="$blockfile" '
        !done && index($0, anchor) { while ((getline line < block) > 0) print line; done=1 } { print }
    ' "$file" > "$tmp" && mv "$tmp" "$file"
    echo "   $label: added"
}

insert_before() {
    file=$1; anchor=$2; text=$3; label=$4; guard=${5:-$3}

    if grep -qF "$guard" "$file"; then
        echo "   $label: already there"
        return
    fi

    if ! grep -qF "$anchor" "$file"; then
        echo "   $label: ANCHOR MISSING in $file — add manually: $text" >&2
        return
    fi

    tmp="$file.wx-tmp"
    awk -v anchor="$anchor" -v text="$text" '
        !done && index($0, anchor) { print text; done=1 } { print }
    ' "$file" > "$tmp" && mv "$tmp" "$file"
    echo "   $label: added"
}

echo "== product media route"
WEB="$PLATFORM/routes/web.php"
if [ -f "$WEB" ]; then
    insert_before "$WEB" \
        "use App\\Http\\Controllers\\Site\\SitemapController;" \
        "use App\\Http\\Controllers\\Site\\ProductImageController;" \
        "web.php import" \
        "Site\\ProductImageController;"

    insert_before "$WEB" \
        "Route::get('/robots.txt'" \
        "Route::get('/media/products/{sku}/{file}', ProductImageController::class)->name('commerce.media.product');" \
        "web.php route" \
        "'/media/products/{sku}/{file}'"
else
    echo "   routes/web.php missing — skipped"
fi

# `media` must be a reserved first segment, or a photograph that does not exist is redirected to
# its trailing-slash "canonical" page form before it ever 404s (SiteRouter::respond).
ROUTER="$PLATFORM/app/Domain/Website/Services/SiteRouter.php"
if [ -f "$ROUTER" ] && ! grep -qF "'media'," "$ROUTER"; then
    tmp="$ROUTER.wx-tmp"
    awk "!/done/ && /'portal', 'admin',/ { print; print \"        'media',\"; done=1; next } { print }" \
        "$ROUTER" > "$tmp" && mv "$tmp" "$ROUTER"
    echo "   SiteRouter RESERVED: added media"
else
    echo "   SiteRouter RESERVED: already there"
fi

# The trailing-slash hop lived in the same class. It existed so a database row answered /about and /about/ as
# one canonical URL; a page is a file now, so the web server answers both forms and the only paths left in that
# class are ones nothing owns — where the redirect first turns one 404 into a 301 and a 404.
if [ -f "$ROUTER" ] && grep -qF "One canonical form:" "$ROUTER"; then
    tmp="$ROUTER.wx-tmp"
    awk '
        /One canonical form:/ {
            print "        // No trailing-slash hop: a page is a file now and the web server answers /about and"
            print "        // /about/ alike, so a redirect here would only turn one 404 into a 301 and a 404."
            skip = 1
            next
        }
        skip && /^        }$/ { skip = 0; next }
        skip { next }
        { print }
    ' "$ROUTER" > "$tmp" && mv "$tmp" "$ROUTER"
    echo "   SiteRouter: trailing-slash hop removed"
else
    echo "   SiteRouter: no trailing-slash hop"
fi

# The Content screen edits the rows the storefront reads; its route and its sidebar entry live in two
# OS-owned files, so both are inserted once by anchor rather than replaced. It goes *above* Blog and
# Portfolio, and ahead of the comment that says "the six screens still to port": this one is ported, and
# the two beneath it still list the archived interior rows.
ADMIN_ROUTES="$PLATFORM/routes/admin.php"
if [ -f "$ADMIN_ROUTES" ]; then
    insert_before "$ADMIN_ROUTES" \
        "use App\\Livewire\\Admin\\Website\\MediaLibrary;" \
        "use App\\Livewire\\Admin\\Website\\ContentIndex;" \
        "admin.php import" \
        "Livewire\\Admin\\Website\\ContentIndex;"

    insert_before "$ADMIN_ROUTES" \
        "Route::livewire('/website/media', MediaLibrary::class)" \
        "Route::livewire('/website/content', ContentIndex::class)->name('website.content')->middleware('can:website.edit');" \
        "admin.php route" \
        "'/website/content'"
else
    echo "   routes/admin.php missing — skipped"
fi

NAV="$PLATFORM/app/Support/AdminNavigation.php"
if [ -f "$NAV" ]; then
    insert_before "$NAV" \
        "self::item('Blog', 'book', 'admin.website.blog', 'website.edit')," \
        "                self::item('Content', 'file', 'admin.website.content', 'website.edit')," \
        "sidebar: content item" \
        "admin.website.content"
else
    echo "   AdminNavigation.php missing — skipped"
fi

# Livewire 3 serves its own script from /livewire-<hash>/livewire.js, and the storefront fallback rule in
# public/.htaccess excluded only the bare word `livewire` — so production answered the app's own script with
# index.html: HTML sent as JavaScript, which the browser refuses. Every page still rendered, so nothing looked
# wrong, but no button on an admin screen did anything. The rule now allows the `-<hash>` tail.
HTACCESS="$PLATFORM/public/.htaccess"
if [ -f "$HTACCESS" ]; then
    if grep -qF '|livewire|' "$HTACCESS"; then
        tmp="$HTACCESS.wx-tmp"
        awk '{ gsub(/[|]livewire[|]/, "|livewire(-[^/]*)?|"); print }' "$HTACCESS" > "$tmp" && mv "$tmp" "$HTACCESS"
        echo "== .htaccess: /livewire-<hash>/ now reaches the app instead of index.html"
    else
        echo "== .htaccess: already allows /livewire-<hash>/"
    fi
    # The storefront fallback is gone: every address the app can render is published (`website:publish`), so an
    # unknown path should reach Laravel — where the 137 legacy 301s are applied — and 404 honestly. While the
    # fallback existed, a typo, a retired product and every archived interior URL answered 200 with the shop.
    if grep -qF 'RewriteRule ^ index.html [L]' "$HTACCESS"; then
        awk '
            /# Furniture storefront/ { skip = 1 }
            skip && /RewriteRule \^ index\.html \[L\]/ { skip = 0; next }
            !skip { print }
        ' "$HTACCESS" > "$HTACCESS.wx-tmp" && mv "$HTACCESS.wx-tmp" "$HTACCESS"
        echo "== .htaccess: unknown paths now reach the app (404s are real, legacy 301s fire)"
    else
        echo "== .htaccess: no storefront fallback to remove"
    fi
else
    echo "== .htaccess missing — skipped"
fi

echo "== sidebar and routes"
grep -q "admin.commerce.dashboard" "$PLATFORM/app/Support/AdminNavigation.php" \
    && echo "   sidebar: already has the Commerce group" \
    || echo "   sidebar: ADD the Commerce group manually (see platform/app/Support/AdminNavigation.php)"

# Both includes are one line each, and without them a whole half of the product is missing from the app: no
# /api/site/v1 means the storefront silently falls back to its bundled TypeScript snapshot, and no commerce
# routes means the shop has no back office. A notice asking a human to do it is a bug, not a step.
BLOCK=$(mktemp)
printf '%s\n' \
    "// Commerce: products, inventory, orders, invoices (the storefront's back office)." \
    "Route::prefix('commerce')->name('commerce.')->group(base_path('routes/commerce.php'));" \
    "" > "$BLOCK"
insert_file_before "$PLATFORM/routes/admin.php" \
    "Route::livewire('/website/content', ContentIndex::class)" \
    "$BLOCK" "routes: commerce include" "routes/commerce.php"

printf '%s\n' \
    "// The reimagined storefront's read-only content API: pages, records, theme." \
    "Route::prefix('site/v1')->name('site.')->group(base_path('routes/site.php'));" \
    "" > "$BLOCK"
insert_file_before "$PLATFORM/routes/api.php" \
    "// Remote MCP (JSON-RPC 2.0 over HTTPS)" \
    "$BLOCK" "site api: include" "routes/site.php"
rm -f "$BLOCK"

# ---- the 137 redirects, in the preview server -------------------------------------------------------------------
#
# Production reads them out of `public/.htaccess` (the block written above). The preview server has no Apache, so
# without this every archived interior URL is answered by whatever file is still sitting at that path — the old
# interior folder is right there in public/ — and the 301s look broken in preview while working live. The rules are
# rendered a second time as `public/redirects.json` by `website:publish`; this teaches the server to read them, and
# to read them *before* the static lookup, which is when mod_rewrite runs and why a 301 beats a file that is still
# on disk.
SERVER="$OS/tools/sandbox/server.mjs"
if [ -f "$SERVER" ]; then
    if grep -qF "redirectFor" "$SERVER"; then
        echo "   preview 301s: already there"
    else
        BLOCK=$(mktemp)
        cat > "$BLOCK" <<'REDIRECTS'
/**
 * The published 301s, as Apache reads them out of `.htaccess`.
 *
 * `website:publish` renders the redirect table twice: `RewriteRule`s for Apache and `public/redirects.json` for
 * this server, which has no Apache to read. These fire before the static lookup — a rewrite runs in the
 * URL-to-filename phase, which is why a 301 wins even when a file with that path is still on disk. That matters
 * here: the archived interior folders are still under public/ and would otherwise shadow all 137 rules.
 */
const REDIRECTS_FILE = path.join(DOCROOT, 'redirects.json');
let redirects = { map: new Map(), mtime: 0 };

function redirectMap() {
    try {
        const mtime = fs.statSync(REDIRECTS_FILE).mtimeMs;
        if (mtime !== redirects.mtime) {
            const raw = JSON.parse(fs.readFileSync(REDIRECTS_FILE, 'utf8'));
            const map = new Map();
            // The shape is `{ "<from>": { to, code } }` — the path is the key, not a field.
            for (const [from, row] of Object.entries(raw)) {
                if (row && typeof row.to === 'string') map.set(from, { to: row.to, code: Number(row.code) || 301 });
            }
            redirects = { map, mtime };
        }
    } catch {
        redirects = { map: new Map(), mtime: 0 };
    }
    return redirects.map;
}

function redirectFor(urlPath) {
    const map = redirectMap();
    if (map.size === 0) return null;
    const clean = urlPath.length > 1 ? urlPath.replace(/\/+$/, '') : urlPath;
    return map.get(urlPath) ?? map.get(clean) ?? map.get(`${clean}/`) ?? null;
}

REDIRECTS
        insert_file_before "$SERVER" "const handler = new PHPRequestHandler({" "$BLOCK" \
            "preview 301s: loader" "function redirectFor"

        printf '%s\n' \
            "        // The 301s first: a rewrite runs before file mapping, exactly as mod_rewrite does in .htaccess." \
            "        const redirect = (req.method === 'GET' || req.method === 'HEAD') && !editingPreview ? redirectFor(urlPath) : null;" \
            "        if (redirect) {" \
            "            res.writeHead(redirect.code, { Location: redirect.to + url.search, 'Cache-Control': 'no-cache' });" \
            "            return res.end();" \
            "        }" > "$BLOCK"
        # The guard must be a string that exists *only* in this snippet: "redirectFor(urlPath)" also appears in
        # the loader above (`function redirectFor(urlPath)`), which made the guard match before anything was added.
        insert_file_before "$SERVER" "        const file = (req.method === 'GET' || req.method === 'HEAD') && !editingPreview" \
            "$BLOCK" "preview 301s: request path" "const redirect = (req.method"
        rm -f "$BLOCK"
    fi
else
    echo "   preview 301s: no tools/sandbox/server.mjs — skipped"
fi

cat <<'NEXT'

Next, in the OS checkout:

    php artisan migrate --force
    php artisan db:seed --class=CommercePermissionsSeeder --force
    php artisan db:seed --class=CatalogSeeder --force      # placeholder catalogue, not the real one
    php artisan commerce:demo-order --qty=2                # proves the whole path end to end
    php artisan commerce:import-images --force             # 20 products, 3 sizes each, into storage/app/public
    php artisan db:seed --class=SiteContentSeeder --force  # the reimagined site's 16 pages + 30 records
    php artisan db:seed --class=ThemeTokensSeeder --force   # the storefront palette, editable in Website → Theme
    php artisan website:archive-interior                   # export + stamp the 142 interior pages
    php artisan website:import-redirects                   # the 301s for the archived interior URLs (rows only)
    php artisan website:publish                            # shells, sitemap, and the .htaccess redirect block
                                                          # (publish renders the rows — import first, or the
                                                          #  block is written empty and the next publish adds it)
    php artisan storage:link                               # /storage/... for uploaded media
    php artisan woodex:owner --force                       # (re)create the owner from OWNER_EMAIL / OWNER_PASSWORD

Then open /admin/commerce and /admin/commerce/orders/{id}.
NEXT
