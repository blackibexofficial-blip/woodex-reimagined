#!/bin/sh
# =============================================================================
#  Woodex OS — one-command setup for a fresh server
#
#  Usage:   sh deploy.sh
#  Safe to run again: it never overwrites an existing .env or database, and
#  never regenerates an APP_KEY that is already set.
#
#  Requires PHP 8.4.1+ with: pdo_sqlite (or pdo_mysql), mbstring, openssl,
#  fileinfo, gd or imagick, curl, json, tokenizer, xml, ctype, bcmath.
# =============================================================================
set -e

cd "$(dirname "$0")"
PHP_CMD="${PHP_CMD:-php}"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }
ok() { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }

# --- 1. PHP version ----------------------------------------------------------
say "1/7  Checking PHP"
if ! $PHP_CMD -r 'exit(PHP_VERSION_ID >= 80401 ? 0 : 1);' 2>/dev/null; then
  warn "Woodex OS needs PHP 8.4.1 or newer (this Laravel release requires it)."
  warn "Current: $($PHP_CMD -r 'echo PHP_VERSION;' 2>/dev/null || echo 'php not found')"
  warn "Set the PHP version in your hosting panel, or point PHP_CMD at a 8.4 binary:"
  warn "  PHP_CMD=/usr/bin/php84 sh deploy.sh"
  exit 1
fi
ok "PHP $($PHP_CMD -r 'echo PHP_VERSION;')"

# --- 2. Required extensions --------------------------------------------------
say "2/7  Checking extensions"
missing=""
for ext in pdo mbstring openssl fileinfo curl json tokenizer xml ctype bcmath; do
  $PHP_CMD -m 2>/dev/null | grep -qi "^${ext}$" || missing="$missing $ext"
done
$PHP_CMD -m 2>/dev/null | grep -qi '^pdo_sqlite$\|^pdo_mysql$' || missing="$missing pdo_sqlite"
if [ -n "$missing" ]; then
  warn "Missing PHP extensions:$missing"
  warn "Enable them in the hosting panel (php.ini / extensions), then re-run."
  exit 1
fi
ok "all required extensions present"

# --- 3. .env -----------------------------------------------------------------
say "3/7  Environment file"
if [ -f .env ]; then
  ok ".env already exists — left untouched"
else
  cp .env.example .env
  ok "created .env from .env.example"
  warn "Edit .env now: set APP_URL, OWNER_EMAIL, PUBLIC_SITE_URL,"
  warn "PUBLIC_LEADS_ALLOWED_ORIGINS and MAIL_* to your real values."
fi

# An empty DB_DATABASE is NOT the same as an absent one: Laravel would try to
# open a file literally named "" and every query fails. Same for a path that
# only existed on another machine. Both are repaired by commenting the line out,
# which restores the built-in database/database.sqlite default.
if grep -qE '^DB_CONNECTION=sqlite' .env; then
  db_path=$(grep -E '^DB_DATABASE=' .env | head -1 | cut -d= -f2-)
  if [ "$(grep -cE '^[[:space:]]*DB_DATABASE=[[:space:]]*$' .env)" -gt 0 ]; then
    sed -i.bak 's|^DB_DATABASE=[[:space:]]*$|# DB_DATABASE=|' .env && rm -f .env.bak
    ok "DB_DATABASE was empty — restored the database/database.sqlite default"
  elif [ -n "$db_path" ] && [ ! -f "$db_path" ]; then
    sed -i.bak 's|^DB_DATABASE=.*|# DB_DATABASE=|' .env && rm -f .env.bak
    warn "DB_DATABASE pointed at a file that does not exist ($db_path) — ignored it"
  fi

  if [ ! -f database/database.sqlite ]; then
    warn "database/database.sqlite is missing from this archive."
    warn "Restore it from the zip — it is the only copy of the shipped content."
    exit 1
  fi
  ok "SQLite database present ($(du -h database/database.sqlite | cut -f1))"
fi

# --- 4. APP_KEY --------------------------------------------------------------
say "4/7  Application key"
if grep -qE '^APP_KEY=.+' .env; then
  ok "APP_KEY already set"
else
  $PHP_CMD artisan key:generate --force >/dev/null
  ok "generated a new APP_KEY"
fi

# --- 5. Permissions ----------------------------------------------------------
say "5/7  Writable directories"
mkdir -p storage/logs storage/framework/cache/data storage/framework/sessions \
         storage/framework/views storage/app/public storage/app/private \
         bootstrap/cache
chmod -R ug+rwX storage bootstrap/cache 2>/dev/null || true
ok "storage/ and bootstrap/cache/ are writable"

say "6/7  Public storage link"
if [ -L public/storage ] || [ -d public/storage ]; then
  ok "public/storage already linked"
else
  $PHP_CMD artisan storage:link >/dev/null 2>&1 && ok "linked public/storage" \
    || warn "could not create the symlink — uploads will still work, media URLs may 404"
fi

# --- 6. Caches ---------------------------------------------------------------
# A config:cache left over from another machine will pin a wrong APP_URL and a
# dead database path. Clearing is always safe and always correct here.
$PHP_CMD artisan optimize:clear >/dev/null 2>&1 || true

# --- 7. Health check ---------------------------------------------------------
say "7/7  Health check"
# migrate:status is read-only, needs no queue or process helper, and fails
# loudly if the database cannot be opened — a better probe than `about`,
# which shells out to `php -v` and breaks wherever proc_open is disabled.
if $PHP_CMD artisan migrate:status >/dev/null 2>&1; then
  ok "artisan boots and the database answers"
else
  warn "the database did not answer — running the check verbosely:"
  $PHP_CMD artisan migrate:status 2>&1 | head -12
  warn "Usually a wrong DB_DATABASE path or an unwritable storage/ folder."
  exit 1
fi

counts=$($PHP_CMD artisan tinker --execute="echo \DB::table('site_pages')->count().' pages, '.\DB::table('commerce_products')->count().' products, '.\DB::table('redirects')->count().' redirects';" 2>/dev/null | tail -1)
[ -n "$counts" ] && ok "database contains $counts"
true

cat <<'EOF'

  Setup complete.

  Next:
    1. Point your web root / document root at this folder's  public/  directory.
    2. Open https://your-domain/admin and sign in.
    3. Immediately change the owner password:
         php artisan woodex:owner --password='a-long-new-password'
    4. Add the cron entry from DEPLOY.md section 6 so reminders and
       follow-ups run.

  Full instructions: DEPLOY.md
EOF
