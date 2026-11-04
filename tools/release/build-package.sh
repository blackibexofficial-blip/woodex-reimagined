#!/bin/sh
# =============================================================================
#  Build the deployable release archive from a working install.
#
#  The installation the preview runs is the only place where vendor/, the built
#  storefront and the populated database exist together — that tree is the
#  product. This script copies it, strips machine-specific state, drops the
#  deployment docs beside it, and zips the result.
#
#  Usage:
#    APP_DIR=/tmp/woodex-run/app VERSION=1.0.0 sh tools/release/build-package.sh
#
#  Options (env):
#    APP_DIR   source installation            (default /tmp/woodex-run/app)
#    VERSION   version stamped in the name    (default 1.0.0)
#    OUT       where the staging tree and zip go (default /tmp/pkg)
#    PHP_CMD   php binary used to regenerate public/nginx-redirects.conf
#              (default: php; skipped if absent)
#    NO_ZIP=1  stage only, do not compress
# =============================================================================
set -e

HERE=$(cd "$(dirname "$0")" && pwd)
APP_DIR=${APP_DIR:-/tmp/woodex-run/app}
VERSION=${VERSION:-1.0.0}
OUT=${OUT:-/tmp/pkg}
PHP_CMD=${PHP_CMD:-php}
NAME="woodex-v$VERSION"
STAGE="$OUT/$NAME"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }

[ -f "$APP_DIR/artisan" ] || { echo "No Laravel install at $APP_DIR"; exit 1; }
[ -d "$APP_DIR/public" ] || { echo "No public/ in $APP_DIR"; exit 1; }

# --- 1. Stage -----------------------------------------------------------------
say "1/6  Copying $APP_DIR"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cd "$APP_DIR"
tar -cf - \
  --exclude='./.env' \
  --exclude='./.env.*' \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./storage/logs/*' \
  --exclude='./storage/framework/views/*' \
  --exclude='./storage/framework/sessions/*' \
  --exclude='./storage/framework/cache/data/*' \
  --exclude='./bootstrap/cache/*.php' \
  --exclude='./.phpunit.result.cache' \
  --exclude='./public/storage' \
  --exclude='*.DS_Store' \
  . 2>/dev/null | tar -xf - -C "$STAGE"
ok "$(find "$STAGE" -type f | wc -l | tr -d ' ') files, $(du -sh "$STAGE" | cut -f1)"

# --- 2. Writable directories --------------------------------------------------
say "2/6  Recreating writable directories"
mkdir -p "$STAGE/storage/logs" \
         "$STAGE/storage/framework/cache/data" \
         "$STAGE/storage/framework/sessions" \
         "$STAGE/storage/framework/views" \
         "$STAGE/bootstrap/cache"
ok "storage/ and bootstrap/cache/ present and empty"

# --- 3. Deployment docs -------------------------------------------------------
say "3/6  Adding deployment files"
cp "$HERE/deploy.sh"  "$STAGE/deploy.sh"
cp "$HERE/env.example" "$STAGE/.env.example"
cp "$HERE/README.md"  "$STAGE/README.md"
cp "$HERE/DEPLOY.md"  "$STAGE/DEPLOY.md"
cp "$HERE/RELEASE-NOTES.md" "$STAGE/RELEASE-NOTES.md"
chmod +x "$STAGE/deploy.sh"
mkdir -p "$STAGE/tools"
cp "$HERE/redirects-to-nginx.php" "$STAGE/tools/redirects-to-nginx.php"
ok "deploy.sh, .env.example, README.md, DEPLOY.md, RELEASE-NOTES.md, tools/"

# --- 4. Nginx redirect map ----------------------------------------------------
say "4/6  Generating public/nginx-redirects.conf"
if command -v "$PHP_CMD" >/dev/null 2>&1; then
  ( cd "$STAGE" && "$PHP_CMD" tools/redirects-to-nginx.php )
else
  warn "no '$PHP_CMD' on PATH — reusing the copy already in public/ if present"
  [ -f "$STAGE/public/nginx-redirects.conf" ] || warn "nginx users will have to generate it server-side"
fi

# --- 5. Leak check ------------------------------------------------------------
say "5/6  Checking for anything that should not ship"
leaks=$(find "$STAGE" -maxdepth 2 \
        \( -name '.env' -o -name '*.log' -o -name '.git' -o -name 'node_modules' \) -print | head -5)
if [ -n "$leaks" ]; then
  warn "unexpected files in the stage:"; echo "$leaks"; exit 1
fi
grep -qE '^APP_KEY=.+' "$STAGE/.env.example" && { warn ".env.example carries a real APP_KEY"; exit 1; }
ok "no .env, no logs, no repository metadata, no key in the template"

# --- 6. Zip -------------------------------------------------------------------
say "6/6  Compressing"
if [ "${NO_ZIP:-0}" = "1" ]; then
  warn "NO_ZIP=1 — staged only at $STAGE"
  exit 0
fi

cd "$OUT"
rm -f "$NAME.zip"
command -v zip >/dev/null 2>&1 || { echo "zip is required"; exit 1; }
zip -rq9 "$NAME.zip" "$NAME"
cd - >/dev/null

SIZE=$(du -h "$OUT/$NAME.zip" | cut -f1)
SUM=$(sha256sum "$OUT/$NAME.zip" | cut -d' ' -f1)
ok "$OUT/$NAME.zip — $SIZE"
printf '     sha256 %s\n' "$SUM"
