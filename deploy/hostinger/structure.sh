#!/bin/sh
# ---------------------------------------------------------------- structure.sh
#
# Checks — and optionally repairs — the layout this project expects on Hostinger.
#
# The layout is deliberate and slightly unusual, so it is written down here rather than rediscovered:
#
#   public_html/                 the document root AND the repository root
#   ├── .htaccess                routes requests into platform/public, and denies the rest
#   ├── composer.json            the deploy manifest; installs into platform/vendor
#   ├── .env                     Laravel's environment (must be 600)
#   ├── platform/                the application
#   │   ├── public/              the real webroot — index.php, build/, fonts, uploads
#   │   ├── vendor/              composer output
#   │   └── storage/             writable
#   └── tools/  docs/  .github/  not served, and must not be
#
# Serving the repository root is safe *only* because `.htaccess` exists and does the right thing. If it
# is missing — after a bad clone, a restore, or an rsync that excluded dotfiles — the whole checkout is
# downloadable, `.env` included. That is what this script looks for first.
#
#   sh structure.sh                    check ~/public_html
#   sh structure.sh /path/to/public_html
#   sh structure.sh /path/to/public_html --fix       also repair permissions and remove junk
#
# `--fix` changes permissions, removes leftover downloads and diagnostics, and creates nothing else. It
# never touches `platform/`, `.env`, or any file it did not name.

set -u

DOCROOT=${1:-$HOME/public_html}
APP="$DOCROOT/platform"
FIX=0
for arg in "$@"; do [ "$arg" = "--fix" ] && FIX=1; done

fails=0
warns=0
says() { printf '%s\n' "$*"; }
ok()   { printf '  ok    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; fails=$((fails + 1)); }
warn() { printf '  warn  %s\n' "$*"; warns=$((warns + 1)); }

[ -d "$DOCROOT" ] || { printf 'No such directory: %s\n' "$DOCROOT" >&2; exit 1; }

says ""
says "document root: $DOCROOT"
says "application:   $APP"

# ---------------------------------------------------------------- the .htaccess that makes this safe
says ""
says "front controller"
if [ -f "$DOCROOT/.htaccess" ]; then
    ok ".htaccess exists ($(wc -c < "$DOCROOT/.htaccess" | tr -d ' ') bytes)"
    if grep -q 'platform/public' "$DOCROOT/.htaccess" 2>/dev/null; then
        ok "it points at platform/public"
    else
        warn "it never mentions platform/public — confirm it forwards to the app"
    fi
else
    bad ".htaccess is MISSING — everything below is downloadable, including .env"
fi

# ---------------------------------------------------------------- what must never be reachable
says ""
says "reachable-only-if-.htaccess-is-wrong"
for f in .env composer.json composer.lock .git/config platform/.env platform/vendor/autoload.php; do
    [ -e "$DOCROOT/$f" ] && says "  ..    /$f exists (fine behind .htaccess; a leak without it)"
done

if [ -f "$DOCROOT/.env" ]; then
    mode=$(stat -c '%a' "$DOCROOT/.env" 2>/dev/null || echo '?')
    case "$mode" in
        600|400) ok ".env mode is $mode" ;;
        *)       warn ".env mode is $mode — 600 is the intent" ;
                 if [ "$FIX" = 1 ] && chmod 600 "$DOCROOT/.env"; then
                     ok "chmod 600 applied" ; warns=$((warns - 1))
                 fi ;;
    esac
fi

# ---------------------------------------------------------------- the application itself
says ""
says "application"
for f in artisan composer.json; do
    [ -f "$APP/$f" ] && ok "platform/$f" || bad "platform/$f is missing"
done
[ -d "$APP/vendor" ] && ok "platform/vendor installed" \
    || bad "platform/vendor is missing — run: composer install (see README)"
[ -f "$APP/public/index.php" ] && ok "platform/public/index.php" \
    || bad "platform/public/index.php is missing — the domain has nothing to serve"

if [ -d "$APP/storage" ] && [ -d "$APP/bootstrap/cache" ]; then
    if [ "$FIX" = 1 ]; then
        chmod -R ug+rwX "$APP/storage" "$APP/bootstrap/cache" 2>/dev/null && ok "storage permissions refreshed"
    fi
    if [ -w "$APP/storage" ] && [ -w "$APP/bootstrap/cache" ]; then
        ok "storage and bootstrap/cache are writable"
    else
        bad "storage or bootstrap/cache is not writable (run with --fix)"
    fi
fi

if [ -L "$APP/public/storage" ]; then
    ok "public/storage -> $(readlink "$APP/public/storage")"
elif [ -d "$APP/public/storage" ]; then
    warn "public/storage is a real directory, not the storage:link symlink"
else
    warn "public/storage is missing — uploads will 404 (artisan storage:link)"
fi

# ---------------------------------------------------------------- what the archive actually contained
says ""
says "leftovers"
junk_found=0
for f in recovery READ-ME-FIRST.txt woodex-diagnostic.php; do
    if [ -e "$DOCROOT/$f" ]; then
        junk_found=1
        bad "$f sits in the document root"
    fi
done
for f in "$DOCROOT"/*.zip; do
    [ -e "$f" ] || continue
    junk_found=1
    bad "$(basename "$f") is a download left in the document root"
done
[ "$junk_found" = 0 ] && ok "none"

if [ "$FIX" = 1 ] && [ "$junk_found" = 1 ]; then
    says ""
    says "removing leftovers (listed above; nothing else is touched)"
    for f in recovery READ-ME-FIRST.txt woodex-diagnostic.php; do
        if [ -e "$DOCROOT/$f" ]; then
            rm -rf "$DOCROOT/$f" && says "  removed $f" && fails=$((fails - 1))
        fi
    done
    for f in "$DOCROOT"/*.zip; do
        if [ -e "$f" ]; then
            rm -f "$f" && says "  removed $(basename "$f")" && fails=$((fails - 1))
        fi
    done
fi

# ---------------------------------------------------------------- the point of all of it
says ""
says "prove it from outside (run these from your laptop):"
says "  curl -s -o /dev/null -w '%{http_code}\\n' https://DOMAIN/.env          # 403 or 404, never 200"
says "  curl -s -o /dev/null -w '%{http_code}\\n' https://DOMAIN/composer.json # 403 or 404"
says "  curl -s -o /dev/null -w '%{http_code}\\n' https://DOMAIN/.git/config   # 403 or 404"
says "  curl -s -o /dev/null -w '%{http_code}\\n' https://DOMAIN/              # 200"

says ""
if [ "$fails" -gt 0 ]; then
    printf '%s failed, %s warnings\n' "$fails" "$warns"
    [ "$FIX" = 0 ] && says "Re-run with --fix to repair permissions and remove leftovers."
    exit 1
fi
printf 'structure looks right (%s warnings)\n' "$warns"
