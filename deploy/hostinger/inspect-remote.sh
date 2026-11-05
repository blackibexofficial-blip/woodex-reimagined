#!/bin/sh
# ---------------------------------------------------------------- inspect-remote.sh
#
# Answers "what is actually on the server?" without a 27 MB export.
#
# The Hostinger folder download is the wrong tool for this job twice over: it is slow, it puts the
# whole site (including every uploaded image) on your laptop, and the copy that reaches Drive is
# routinely truncated — one we were handed ended mid-stream with no central directory, so it could
# not be opened at all. This prints the same decision-relevant facts in about forty lines.
#
# Run it in hPanel → Advanced → Terminal (or over SSH). It writes nothing and changes nothing; every
# command is a read. Paste the whole output back.
#
#   sh inspect-remote.sh                 # inspects the current document root
#   sh inspect-remote.sh ~/public_html   # or name a directory
#
# What it establishes, and why each line matters:
#
#   * the document root — whether the checkout is being served to the public, or only its public/;
#   * whether `.env` is reachable over HTTP — the single most expensive mistake in this layout, since
#     it hands out the database password;
#   * whether `platform/public/index.php` is the entry point the domain actually uses;
#   * PHP version, because Laravel 12 needs 8.2 and this project targets 8.4;
#   * whether `vendor/` is installed, which decides slice-deploy versus full deploy.

set -u

ROOT=${1:-$HOME/public_html}

say() { printf '\n=== %s\n' "$1"; }

say "where am I"
pwd
id -un 2>/dev/null || whoami

say "document root: $ROOT"
if [ -d "$ROOT" ]; then
    ls -la "$ROOT" 2>/dev/null
else
    echo "MISSING: $ROOT"
fi

say "two levels down (directories only)"
find "$ROOT" -maxdepth 2 -type d \
    -not -path '*/node_modules*' -not -path '*/.git/*' -not -path '*/vendor/*' \
    2>/dev/null | sort | head -60

say "is the Laravel root inside it?"
for candidate in "$ROOT" "$ROOT/platform" "$ROOT/../woodex-app" "$HOME/woodex-app"; do
    if [ -f "$candidate/artisan" ]; then
        echo "APP ROOT: $candidate"
        [ -d "$candidate/vendor" ] && echo "  vendor/: present (slice deploy is enough)" \
                                   || echo "  vendor/: MISSING (first install must run composer)"
        [ -f "$candidate/.env" ] && echo "  .env:   present ($(wc -c < "$candidate/.env" | tr -d ' ') bytes)" \
                                 || echo "  .env:   MISSING"
        [ -f "$candidate/public/index.php" ] && echo "  public/index.php: present"
    fi
done

say "what serves the domain today"
for f in .htaccess index.php index.html; do
    if [ -f "$ROOT/$f" ]; then
        echo "--- $ROOT/$f"
        if [ "$f" = ".htaccess" ]; then cat "$ROOT/$f"; else head -5 "$ROOT/$f"; fi
    fi
done

say "reachability of things that must never be web-readable"
for f in .env composer.json .git/config platform/.env; do
    [ -e "$ROOT/$f" ] && echo "EXISTS under the document root: $f"
done
echo "(a file being listed here is only dangerous if the domain's root is $ROOT itself)"

say "php"
php -v 2>/dev/null | head -2 || echo "no php on PATH for this shell"

say "space"
df -h "$HOME" 2>/dev/null | tail -1

say "done"
echo "Nothing was changed. Paste the output above."
