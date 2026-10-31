#!/bin/sh
# Connects the reimagined storefront to a checkout of woodex420/woodexinterior.
#
# The OS used to serve the 142-page v1 website from platform/public/. This replaces that with the
# React app: index.html plus hashed assets under public/front/, and a rewrite so its client-side
# addresses survive a refresh.
#
#   sh tools/furniture-commerce/connect-storefront.sh /path/to/woodexinterior
#
# Run it BEFORE the app is built, or re-run after `npm run build`. It is idempotent: the pages it
# removes are found by name, the rewrite is added once, and a second run reports that there is
# nothing to do rather than deleting something else.
set -e

SLICE=$(cd "$(dirname "$0")/../.." && pwd)
OS=${1:?usage: connect-storefront.sh /path/to/woodexinterior}
PUBLIC="$OS/platform/public"

[ -f "$OS/platform/artisan" ] || { echo "not a woodex OS checkout: $OS" >&2; exit 1; }
[ -f "$SLICE/dist/index.html" ] || { echo "build the storefront first: cd $SLICE && npm ci && npm run build" >&2; exit 1; }

echo "== 1. inventory what is about to be removed"
# Only directories a v1 PageWriter created: one that holds an index.html and no application code.
PAGES=$(cd "$PUBLIC" && find . -name index.html -printf "%h\n" | sed 's|^\./||; s|^\.$||' | grep -v '^$' | sort)
COUNT=$(printf '%s\n' "$PAGES" | grep -c . || true)

echo "   $COUNT v1 pages found under platform/public/"

if [ "$COUNT" -gt 0 ]; then
    echo "$PAGES" > "$OS/platform/public.v1-pages.txt"
    echo "   their URLs, one per line, are saved to platform/public.v1-pages.txt"
    echo "   (that list is what a 301 map is built from — keep it)"
fi

echo "== 2. remove them"
printf '%s\n' "$PAGES" | while IFS= read -r dir; do
    [ -n "$dir" ] && rm -rf "$PUBLIC/$dir"
done
rm -f "$PUBLIC/index.html"

echo "== 3. install the storefront"
cp -R "$SLICE/dist/." "$PUBLIC/"
echo "   index.html + $(ls "$PUBLIC/front" | wc -l | tr -d ' ') assets under public/front/"

echo "== 4. teach Apache the single-page-app rule"
if grep -q "Furniture storefront" "$PUBLIC/.htaccess"; then
    echo "   already present"
else
    echo "   MISSING — copy the rewrite block from tools/furniture-commerce/htaccess.txt"
    echo "   into platform/public/.htaccess, immediately before the front-controller rule."
fi

cat <<'NEXT'

Done. The OS now serves the storefront at / and the admin at /admin.

What must be true on Hostinger for this to work:

  1. public/front/ is uploaded with the rest of public/ — it is built output, not tracked.
  2. The .htaccess block is present, or every deep link (/shop/x, /projects/y) 404s on refresh.
  3. /admin still reaches index.php. If it renders the shop instead, the exclusion list in
     that block lost a path.
NEXT
