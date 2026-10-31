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
    app/Livewire/Admin/Commerce \
    app/Http/Controllers/Admin/PageDocumentController.php \
    app/Http/Controllers/Api/Storefront \
    app/Console/Commands/DemoOrderCommand.php \
    resources/views/livewire/admin/commerce \
    resources/views/admin/commerce \
    database/seeders/CommercePermissionsSeeder.php \
    database/seeders/CatalogSeeder.php \
    database/seeders/data/catalog.json \
    routes/commerce.php
do
    if [ -e "$SLICE/$path" ]; then
        mkdir -p "$PLATFORM/$(dirname "$path")"
        cp -R "$SLICE/$path" "$PLATFORM/$(dirname "$path")/"
        echo "   $path"
    fi
done

echo "== commerce migrations"
for migration in "$SLICE"/database/migrations/2026_10_28_*.php; do
    cp "$migration" "$PLATFORM/database/migrations/"
    echo "   $(basename "$migration")"
done

echo "== tests"
mkdir -p "$PLATFORM/tests/Billing" "$PLATFORM/tests/Commerce" 2>/dev/null || true
for suite in "$SLICE"/tests/Billing/OrderToLedgerTest.php \
             "$SLICE"/tests/Billing/PaymentToLedgerTest.php \
             "$SLICE"/tests/Billing/OneLedgerTest.php
do
    [ -f "$suite" ] && cp "$suite" "$PLATFORM/tests/Billing/" && echo "   $(basename "$suite")"
done

echo "== sidebar and routes"
grep -q "admin.commerce.dashboard" "$PLATFORM/app/Support/AdminNavigation.php" \
    && echo "   sidebar: already has the Commerce group" \
    || echo "   sidebar: ADD the Commerce group manually (see platform/app/Support/AdminNavigation.php)"

grep -q "routes/commerce.php" "$PLATFORM/routes/admin.php" \
    && echo "   routes: already included" \
    || echo "   routes: ADD  Route::prefix('commerce')->name('commerce.')->group(base_path('routes/commerce.php'));"

cat <<'NEXT'

Next, in the OS checkout:

    php artisan migrate --force
    php artisan db:seed --class=CommercePermissionsSeeder --force
    php artisan db:seed --class=CatalogSeeder --force      # placeholder catalogue, not the real one
    php artisan commerce:demo-order --qty=2                # proves the whole path end to end

Then open /admin/commerce and /admin/commerce/orders/{id}.
NEXT
