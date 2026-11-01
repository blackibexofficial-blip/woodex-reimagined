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
    app/Livewire/Admin/Website/MediaLibrary.php \
    app/Console/Commands/OwnerAccountCommand.php \
    app/Console/Commands/ImportProductImagesCommand.php \
    app/Http/Controllers/Site \
    app/Http/Controllers/Admin/PageDocumentController.php \
    app/Http/Controllers/Api/Storefront \
    app/Http/Controllers/Api/Site \
    app/Console/Commands/ArchiveInteriorCommand.php \
    app/Console/Commands/PublishSiteCommand.php \
    app/Console/Commands/DemoOrderCommand.php \
    resources/views/livewire/admin/commerce \
    resources/views/admin/commerce \
    resources/views/livewire/admin/website/pages-index.blade.php \
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

echo "== sidebar and routes"
grep -q "admin.commerce.dashboard" "$PLATFORM/app/Support/AdminNavigation.php" \
    && echo "   sidebar: already has the Commerce group" \
    || echo "   sidebar: ADD the Commerce group manually (see platform/app/Support/AdminNavigation.php)"

grep -q "routes/commerce.php" "$PLATFORM/routes/admin.php" \
    && echo "   routes: already included" \
    || echo "   routes: ADD  Route::prefix('commerce')->name('commerce.')->group(base_path('routes/commerce.php'));"

grep -q "routes/site.php" "$PLATFORM/routes/api.php" \
    && echo "   site api: already included" \
    || echo "   site api: ADD  Route::prefix('site/v1')->name('site.')->group(base_path('routes/site.php'));"

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
    php artisan website:publish                            # write the static shells + sitemap.xml
    php artisan storage:link                               # /storage/... for uploaded media
    php artisan woodex:owner --force                       # (re)create the owner from OWNER_EMAIL / OWNER_PASSWORD

Then open /admin/commerce and /admin/commerce/orders/{id}.
NEXT
