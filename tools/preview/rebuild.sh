#!/bin/sh
# Rebuild and start the WOODEX preview in a sandbox with no PHP, no Composer and no MySQL.
#
# The AI sandbox has Node but no PHP, packagist and GitHub release assets are blocked, and every VM reset wipes
# /tmp. The OS repository already ships a harness built for exactly that (tools/sandbox/setup.sh: php-wasm, a
# Composer substitute that resolves the lock off api.github.com, a front-end build and a SQLite database). This
# script drives it *and then* does the part the OS harness knows nothing about — the furniture storefront.
#
#   sh tools/preview/rebuild.sh            rebuild everything (~5 min) and start on :8081
#   PORT=8080 sh tools/preview/rebuild.sh  another port
#   sh tools/preview/rebuild.sh --keep     reuse the /tmp runtime, just sync + restart
#
# Order matters, and each step exists for a reason:
#   1. clone the OS the slice is applied to
#   2. point its setup.sh/sync.sh at the clone (they hard-code /home/user/woodexinterior)
#   3. apply this repository's platform/ slice over it — including the route includes and the SiteRouter fix
#   4. run the OS harness: php-wasm, vendor/, the OS front-end build, SQLite, migrate, woodex:install, demo seed
#   5. build the *storefront* SPA (this repository's src/) and install it as public/index.html + public/front/
#   6. seed the storefront: catalogue, site content, product photographs, theme, archive, redirects
#   7. publish — 67 files, 66 sitemap URLs, 137 redirect rules
#   8. start tools/sandbox/server.mjs
#
# The runtime lives in /tmp on purpose: php-wasm + vendor is ~600 MB and must never enter this repository.
set -e

SLICE=$(cd "$(dirname "$0")/../.." && pwd)
OS=${OS_DIR:-/tmp/woodexinterior}
PORT=${PORT:-8081}
APP=${APP_DIR:-/tmp/woodex-run/app}
PHP=/tmp/woodex-run/php

echo "== os checkout"
if [ ! -d "$OS/.git" ]; then
    git clone --quiet https://github.com/woodex420/woodexinterior.git "$OS"
fi
echo "   $OS at $(cd "$OS" && git log --oneline -1 | cut -c1-58)"

sed -i "s|^REPO=.*|REPO=$OS|" "$OS/tools/sandbox/setup.sh"
sed -i "s|^SRC=.*|SRC=$OS/platform|" "$OS/tools/sandbox/sync.sh"

echo "== furniture slice"
sh "$SLICE/tools/furniture-commerce/apply.sh" "$OS" 2>&1 | grep -vE "^ +php artisan|^ +#'|^Next, in the OS|^$" | tail -20

if [ "${1:-}" != "--keep" ]; then
    echo "== os harness (php-wasm, vendor, OS build, database)"
    PORT="$PORT" E2B_SANDBOX_ID="${E2B_SANDBOX_ID:-sandbox}" sh "$OS/tools/sandbox/setup.sh"
else
    echo "== reusing $APP"
    sh "$OS/tools/sandbox/sync.sh"
    mkdir -p /tmp/woodex-run
    PORT="$PORT" sh "$OS/tools/sandbox/preview-env.sh"
fi

echo "== storefront build"
(cd "$SLICE" && { [ -d node_modules ] || npm ci --no-audit --no-fund > /dev/null; } && npx vite build --logLevel error 2>&1 | tail -2)

echo "== install the storefront into public/"
mkdir -p "$APP/public/front"
rm -f "$APP/public/front"/*
cp -R "$SLICE/dist/front/." "$APP/public/front/"
cp "$SLICE/dist/index.html" "$APP/public/index.html"
[ -f "$SLICE/dist/favicon.ico" ] && cp "$SLICE/dist/favicon.ico" "$APP/public/favicon.ico"
echo "   $(ls "$APP/public/front" | wc -l) files in public/front"

echo "== storefront data"
cd "$APP"
"$PHP" artisan db:seed --class=CatalogSeeder --force 2>&1 | tail -1
"$PHP" artisan db:seed --class=SiteContentSeeder --force 2>&1 | tail -1
"$PHP" artisan commerce:import-images --force 2>&1 | grep -E "Photos attached|Failures" | sed 's/^/   /'
"$PHP" artisan website:archive-interior 2>&1 | grep -E "Stamped" | sed 's/^/   /'
"$PHP" artisan website:import-redirects 2>&1 | grep -E "archived URLs" | sed 's/^/   /'

echo "== publish"
"$PHP" artisan website:publish 2>&1 | grep -E "redirects|sitemap|Files written|Failures|Pages |Records |Products " | sed 's/^/   /'

echo "== storefront tests"
node /tmp/phpwasm/php-cli.mjs "$APP/tests/run-site.php" 2>&1 | tail -2 | sed 's/^/   /'

echo "== server on :$PORT"
cd "$OS"
exec env PORT="$PORT" APP_DIR="$APP" node --stack-size=8000 tools/sandbox/server.mjs
