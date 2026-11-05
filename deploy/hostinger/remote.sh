#!/usr/bin/env bash
#
# The server half of a deploy. Copied to the host by deploy.sh and run there over SSH.
#
# Runs with the privileges the shared-hosting account has (no root, no sudo), so it does only what
# an account owner can do: create directories it owns, set its own permissions, and call artisan.
#
#   remote.sh --app /home/USER/woodex-app --php /opt/alt/php84/usr/bin/php --url https://… \
#             [--migrate] [--seed-if-empty] [--first]
#
# Exit codes: 0 ok; 1 failure (deploy.sh stops); 3 .env was just created and needs filling in.

set -Eeuo pipefail

APP=""
PHP_BIN="php"
URL=""
DO_MIGRATE=0
SEED_IF_EMPTY=0
FIRST=0
DB_NAME=""
DB_USER=""
DB_PASS=""
DB_HOST="localhost"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --app) APP="${2:-}"; shift 2 ;;
        --php) PHP_BIN="${2:-php}"; shift 2 ;;
        --url) URL="${2:-}"; shift 2 ;;
        --migrate) DO_MIGRATE=1; shift ;;
        --seed-if-empty) SEED_IF_EMPTY=1; shift ;;
        --first) FIRST=1; shift ;;
        --db-name) DB_NAME="${2:-}"; shift 2 ;;
        --db-user) DB_USER="${2:-}"; shift 2 ;;
        --db-pass) DB_PASS="${2:-}"; shift 2 ;;
        --db-host) DB_HOST="${2:-localhost}"; shift 2 ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
done

[[ -n "$APP" && -d "$APP" ]] || { echo "bad --app: $APP" >&2; exit 1; }

say() { printf '\n  ·  %s\n' "$*"; }

# Set KEY=value in .env, replacing the line if it exists and appending it if it does not.
#
# awk, not sed: the value can contain /, & or a backslash (a MySQL password often does), and `sed
# s|…|…|` would treat all three as syntax. The key is passed as data too, so no regex is built from it.
env_set() {
    local key=$1 value=$2
    [[ -f .env ]] || return 0

    awk -v k="$key" -v v="$value" '
        BEGIN { done = 0 }
        !done && index($0, k "=") == 1 { print k "=" v; done = 1; next }
        { print }
        END { if (!done) print k "=" v }
    ' .env > .env.wx-tmp && mv .env.wx-tmp .env
}
fail() { printf '\n  x  %s\n' "$*" >&2; exit 1; }

cd "$APP"

artisan() { "$PHP_BIN" artisan "$@"; }

# ---- directories the app writes to ------------------------------------------------------------
# storage/ is excluded from rsync (it holds the .env-adjacent state, logs and uploads), which means
# on a first deploy it does not exist. Create the skeleton Laravel expects rather than letting the
# first request die on a missing log directory.
say "storage skeleton"
mkdir -p storage/app/public storage/framework/cache/data storage/framework/sessions \
         storage/framework/views storage/logs bootstrap/cache
chmod -R ug+rwX storage bootstrap/cache 2>/dev/null || true

# ---- .env -------------------------------------------------------------------------------------
if [[ ! -f .env ]]; then
    say ".env is missing — writing a template"
    cat > .env <<ENVEOF
APP_NAME="Woodex"
APP_ENV=staging
APP_KEY=
APP_DEBUG=false
APP_URL=${URL:-https://example.test}

APP_LOCALE=en
APP_FALLBACK_LOCALE=en
APP_TIMEZONE=Asia/Karachi
APP_MAINTENANCE_DRIVER=file

LOG_CHANNEL=stack
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=${DB_HOST}
DB_PORT=3306
DB_DATABASE=${DB_NAME:-REPLACE_ME}
DB_USERNAME=${DB_USER:-REPLACE_ME}
DB_PASSWORD=${DB_PASS:-REPLACE_ME}

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=false

BROADCAST_CONNECTION=log
FILESYSTEM_DISK=public
QUEUE_CONNECTION=database
CACHE_STORE=database

MAIL_MAILER=log
MAIL_FROM_ADDRESS="no-reply@${URL#https://}"
MAIL_FROM_NAME="\${APP_NAME}"

PUBLIC_SITE_URL=${URL:-https://example.test}
OWNER_EMAIL=owner@example.test
PUBLIC_LEADS_ALLOWED_ORIGINS=${URL:-https://example.test}
ENVEOF

    # The credentials come from deploy.conf, so the first deploy can finish on its own. The stop below
    # is for the case where they were not supplied: it is better to ask than to write a .env that
    # points at "REPLACE_ME" and then fail on the first query with a confusing SQLSTATE error.
    if [[ -n "$DB_NAME" && -n "$DB_USER" && -n "$DB_PASS" ]]; then
        say "database credentials written from deploy.conf: $DB_NAME (user $DB_USER, host $DB_HOST)"
    else
        cat <<'MSG'

  The database credentials are placeholders. Edit the file, then run the deploy again:

      ssh <user>@<host> -p 65002
      nano ~/woodex-app/.env      # DB_DATABASE / DB_USERNAME / DB_PASSWORD

  Create the database first: hPanel → Databases → MySQL Databases (the user is created there too,
  and must be attached to the database). Or put DB_NAME / DB_USER / DB_PASSWORD in deploy.conf and
  the next deploy writes them for you.

MSG
        exit 3
    fi
else
    # An existing .env is not a reason to skip the database.
    #
    # The first version only wrote .env when it was absent, so a host that already had one — this one
    # did, from an earlier install — kept whatever credentials it carried and the migrations ran
    # against them. Correcting the keys in place is what makes a re-deploy safe.
    if [[ -n "$DB_NAME" && -n "$DB_USER" && -n "$DB_PASS" ]]; then
        say ".env exists — updating the database and URL keys in place"
        env_set DB_CONNECTION mysql
        env_set DB_HOST "$DB_HOST"
        env_set DB_PORT 3306
        env_set DB_DATABASE "$DB_NAME"
        env_set DB_USERNAME "$DB_USER"
        env_set DB_PASSWORD "$DB_PASS"
        [[ -n "$URL" ]] && env_set APP_URL "$URL"
        [[ -n "$URL" ]] && env_set PUBLIC_SITE_URL "$URL"
        [[ -n "$URL" ]] && env_set PUBLIC_LEADS_ALLOWED_ORIGINS "$URL"
        say "database → $DB_NAME (user $DB_USER, host $DB_HOST); other keys left alone"
    else
        say ".env exists — leaving it alone (no DB_* in deploy.conf)"
    
fi


fi

# A key is required or every session cookie and encrypted value breaks at runtime.
if ! grep -qE '^APP_KEY=base64:' .env; then
    say "generating APP_KEY"
    artisan key:generate --force --no-interaction
fi

# A staging site that is still pointing at localhost will render links nobody can follow.
if [[ -n "$URL" ]] && ! grep -qE "^APP_URL=${URL//\//\\/}\$" .env; then
    say "APP_URL → $URL"
    "$PHP_BIN" -r '
        $f = ".env"; $s = file_get_contents($f);
        $s = preg_replace("/^APP_URL=.*$/m", "APP_URL=".getenv("WX_URL"), $s);
        file_put_contents($f, $s);
    ' WX_URL="$URL" 2>/dev/null || sed -i "s|^APP_URL=.*|APP_URL=$URL|" .env
fi

# ---- storage symlink --------------------------------------------------------------------------
# public/storage → storage/app/public. Shared hosting allows symlinks inside the account, but the
# link must be relative or it breaks the moment the account path changes.
if [[ -L public/storage || -e public/storage ]]; then
    say "storage link already present"
else
    say "linking public/storage"
    artisan storage:link --no-interaction || fail "storage:link failed"
fi

# ---- migrations -------------------------------------------------------------------------------
if [[ $DO_MIGRATE -eq 1 ]]; then
    say "migrate"
    artisan migrate --force --no-interaction || fail "migrations failed"
fi

# ---- seed, but only into an empty database ----------------------------------------------------
# The seeders are idempotent (upserts keyed on natural keys), so running them twice is harmless.
# They still run only on a first deploy, because the shell and home page are content the owner may
# have rewritten in the admin since — and a redeploy must not overwrite that.
if [[ $SEED_IF_EMPTY -eq 1 ]]; then
    TABLES=$("$PHP_BIN" -r '
        require "vendor/autoload.php";
        $app = require "bootstrap/app.php";
        $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
        echo Illuminate\Support\Facades\Schema::hasTable("settings") ? "1" : "0";
    ' 2>/dev/null || echo 0)

    if [[ "$TABLES" == "0" ]]; then
        say "first deploy: seeding settings, shell, home page"
        artisan db:seed --class=CommercePermissionsSeeder --force --no-interaction || true
        artisan db:seed --class=SiteShellSeeder --force --no-interaction || true
        artisan db:seed --class=HomePageSeeder --force --no-interaction || true
    else
        say "database already seeded — skipping seeders"
    fi
fi

# ---- caches -----------------------------------------------------------------------------------
# Cleared before rebuilt: a stale compiled view of a file that changed shape is the classic
# "works locally, 500 on staging" failure, and it costs nothing to avoid.
say "rebuild caches"
artisan optimize:clear --no-interaction >/dev/null 2>&1 || true
artisan config:cache --no-interaction || fail "config:cache failed (usually a syntax error in .env)"
artisan route:cache --no-interaction || say "route:cache skipped (a closure route blocks it — not fatal)"
artisan view:cache --no-interaction || true
artisan event:cache --no-interaction || true

# ---- the storefront's static pages ------------------------------------------------------------
# If the app publishes static shells, regenerate them so a deploy never leaves a page pointing at
# the previous build's asset hashes.
if artisan list --raw 2>/dev/null | grep -q '^website:publish'; then
    say "republish static pages"
    artisan website:publish --no-interaction || say "website:publish reported an error — check its output"
fi

say "done: $($PHP_BIN artisan --version)"
