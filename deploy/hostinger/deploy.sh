#!/usr/bin/env bash
#
# Deploy Woodex OS to Hostinger shared hosting.
#
# One script, two callers: GitHub Actions (no config file, everything from the environment) and a
# human at a terminal (deploy.conf). Keeping them the same script means a deploy that works in CI
# also works by hand when GitHub is down, which is exactly when you need it most.
#
#   ./deploy.sh --dry-run          show every action, change nothing
#   ./deploy.sh                    first run also migrates and seeds; later runs just update
#   ./deploy.sh --skip-build       reuse the assets already built locally
#   ./deploy.sh --rollback         restore the previous application snapshot
#
# Shared hosting has no root, no supervisor and no systemd. Everything below is written for that:
# code lives outside the document root, composer runs locally, and the only long-lived process is
# cron. Nothing here assumes a VPS.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR_DEFAULT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DRY_RUN=0
SKIP_BUILD=0
ROLLBACK=0
FIRST_DEPLOY=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=1 ;;
        --skip-build) SKIP_BUILD=1 ;;
        --rollback) ROLLBACK=1 ;;
        --first-deploy) FIRST_DEPLOY=1 ;;
        --config) shift; CONFIG_FILE="${1:-}" ;;
        -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
    shift
done

# ---- config, in increasing precedence: defaults < deploy.conf < environment ---------------------
CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/deploy.conf}"
[[ -f "$CONFIG_FILE" ]] && set -a && . "$CONFIG_FILE" && set +a

SSH_HOST="${SSH_HOST:?set SSH_HOST (see deploy.conf.example)}"
SSH_PORT="${SSH_PORT:-65002}"
SSH_USER="${SSH_USER:?set SSH_USER}"
SSH_KEY="${SSH_KEY:-}"
REMOTE_APP="${REMOTE_APP:?set REMOTE_APP}"
REMOTE_DOCROOT="${REMOTE_DOCROOT:?set REMOTE_DOCROOT}"
APP_DIR="${APP_DIR:?set APP_DIR — the Woodex OS checkout with the slice applied}"
REPO_DIR="${REPO_DIR:-$REPO_DIR_DEFAULT}"
STAGING_DOMAIN="${STAGING_DOMAIN:?set STAGING_DOMAIN}"
APP_URL="${APP_URL:-https://$STAGING_DOMAIN}"
PHP_BIN="${PHP_BIN:-}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"
SEED_ON_FIRST_DEPLOY="${SEED_ON_FIRST_DEPLOY:-1}"
BUILD_SPA="${BUILD_SPA:-1}"
BUILD_PLATFORM_ASSETS="${BUILD_PLATFORM_ASSETS:-1}"
HEALTH_PATH="${HEALTH_PATH:-/page-preview/home}"
SYNC_VENDOR="${SYNC_VENDOR:-1}"

# The database hPanel created. With all three here the first deploy writes a complete .env and runs to
# the end; without them remote.sh writes a template and stops to ask, which is the old behaviour.
DB_NAME="${DB_NAME:-}"
DB_USER="${DB_USER:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-localhost}"

# ---- output ------------------------------------------------------------------------------------
if [[ -t 1 ]]; then C_OK=$'\e[32m'; C_WARN=$'\e[33m'; C_ERR=$'\e[31m'; C_DIM=$'\e[2m'; C_OFF=$'\e[0m'; else C_OK=; C_WARN=; C_ERR=; C_DIM=; C_OFF=; fi
step() { printf '\n%s==> %s%s\n' "$C_OK" "$*" "$C_OFF"; }
note() { printf '    %s%s%s\n' "$C_DIM" "$*" "$C_OFF"; }
warn() { printf '%s !  %s%s\n' "$C_WARN" "$*" "$C_OFF" >&2; }
die()  { printf '%s x  %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }

run() {
    if [[ $DRY_RUN -eq 1 ]]; then printf '    %swould run:%s %s\n' "$C_DIM" "$C_OFF" "$*"; return 0; fi
    "$@"
}

SSH_OPTS=(-p "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
[[ -n "$SSH_KEY" ]] && SSH_OPTS+=(-i "$SSH_KEY")

remote() { ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" "$@"; }
RSYNC_SSH="ssh -p $SSH_PORT -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
[[ -n "$SSH_KEY" ]] && RSYNC_SSH="$RSYNC_SSH -i $SSH_KEY"

# ---- preflight: local --------------------------------------------------------------------------
step "Preflight (local)"
[[ -d "$APP_DIR" ]] || die "APP_DIR does not exist: $APP_DIR"
[[ -f "$APP_DIR/artisan" ]] || die "APP_DIR has no artisan — that is not a Laravel app root: $APP_DIR"
[[ -f "$APP_DIR/composer.json" ]] || die "APP_DIR has no composer.json: $APP_DIR"
command -v rsync >/dev/null || die "rsync is required locally"
[[ -z "$SSH_KEY" || -f "$SSH_KEY" ]] || die "SSH_KEY not found: $SSH_KEY"
note "app:    $APP_DIR"
note "repo:   $REPO_DIR"
note "target: $SSH_USER@$SSH_HOST:$REMOTE_APP (port $SSH_PORT)"
note "domain: $STAGING_DOMAIN"

# ---- preflight: remote -------------------------------------------------------------------------
step "Preflight (server)"
remote 'echo ok' >/dev/null || die "cannot ssh to $SSH_USER@$SSH_HOST:$SSH_PORT — is the public key in hPanel → SSH Access?"

if [[ -z "$PHP_BIN" ]]; then
    PHP_BIN=$(remote 'for c in php /opt/alt/php84/usr/bin/php /opt/alt/php83/usr/bin/php /usr/bin/php84 /usr/bin/php; do command -v "$c" >/dev/null 2>&1 && { echo "$c"; break; }; done' || true)
fi
[[ -n "$PHP_BIN" ]] || die "no PHP binary found on the server (set PHP_BIN in deploy.conf)"
note "php:    $PHP_BIN"

PHP_VERSION=$(remote "$PHP_BIN -r 'echo PHP_VERSION;'" || echo "0")
note "php version: $PHP_VERSION"
case "$PHP_VERSION" in
    8.[4-9]*|9.*) : ;;
    8.3*) warn "PHP 8.3 detected. The app targets 8.4; it runs on 8.3 but switch the domain in hPanel when you can." ;;
    *) die "PHP $PHP_VERSION is too old. Set the domain's PHP version to 8.4 in hPanel (Advanced → PHP Configuration)." ;;
esac

# Composer and the vendor directory: on shared hosting the reliable route is to ship vendor/ from
# the machine that has network access, rather than hoping the server can reach packagist.
if [[ "$SYNC_VENDOR" == "1" ]]; then
    [[ -d "$APP_DIR/vendor" ]] || die "APP_DIR/vendor is missing — run composer install locally first (or set SYNC_VENDOR=0)"
    note "vendor: shipping from local"
else
    remote "command -v composer >/dev/null" || warn "SYNC_VENDOR=0 but composer is not on the server — the deploy will fail after rsync"
fi

if [[ $ROLLBACK -eq 1 ]]; then
    step "Rollback"
    remote "ls -1t $REMOTE_APP/../woodex-releases/*.tar.gz 2>/dev/null | head -1" | grep -q . \
        || die "no release snapshots found next to $REMOTE_APP"
    run remote "set -e; LATEST=\$(ls -1t $REMOTE_APP/../woodex-releases/*.tar.gz | head -1); \
        echo \"restoring \$LATEST\"; tar -xzf \"\$LATEST\" -C $(dirname "$REMOTE_APP"); \
        cd $REMOTE_APP && $PHP_BIN artisan optimize:clear"
    warn "Code restored. Database migrations are NOT rolled back — run 'php artisan migrate:rollback' if the release added any."
    exit 0
fi

# ---- build assets ------------------------------------------------------------------------------
if [[ $SKIP_BUILD -eq 0 ]]; then
    if [[ "$BUILD_SPA" == "1" && -f "$REPO_DIR/package.json" ]]; then
        step "Build the storefront SPA"
        ( cd "$REPO_DIR" && [[ -d node_modules ]] || ( cd "$REPO_DIR" && npm ci ) )
        run bash -c "cd '$REPO_DIR' && npx vite build"
        note "dist/front built"
    fi

    if [[ "$BUILD_PLATFORM_ASSETS" == "1" && -f "$APP_DIR/package.json" ]]; then
        step "Build the platform assets (admin + storefront CSS)"
        ( cd "$APP_DIR" && [[ -d node_modules ]] || ( cd "$APP_DIR" && npm ci ) )
        run bash -c "cd '$APP_DIR' && npm run build"
    else
        warn "no package.json in APP_DIR — admin/storefront CSS is used as committed. If the UI looks unstyled, build it and redeploy."
    fi
else
    note "build skipped (--skip-build)"
fi

# The SPA build lands in dist/front; the app serves it from public/front.
if [[ -d "$REPO_DIR/dist/front" ]]; then
    step "Copy SPA bundles into the application's public/front"
    run mkdir -p "$APP_DIR/public/front"
    run rsync -a --delete "$REPO_DIR/dist/front/" "$APP_DIR/public/front/"
fi

# ---- snapshot the previous release -------------------------------------------------------------
step "Snapshot the previous release"
run remote "mkdir -p $REMOTE_APP/../woodex-releases"
run remote "cd $(dirname "$REMOTE_APP") && tar -czf $REMOTE_APP/../woodex-releases/\$(date +%Y%m%d-%H%M%S).tar.gz \
    --exclude='vendor' --exclude='node_modules' --exclude='storage' --exclude='.env' \$(basename "$REMOTE_APP") 2>/dev/null || true"
run remote "ls -1t $REMOTE_APP/../woodex-releases/*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f"
note "kept the last 5 snapshots in $(dirname "$REMOTE_APP")/woodex-releases"

# ---- sync the application ----------------------------------------------------------------------
step "Sync application code"
run remote "mkdir -p $REMOTE_APP $REMOTE_DOCROOT"
run rsync -az --delete --human-readable \
    --exclude '.git/' --exclude 'node_modules/' --exclude '.env' --exclude '.env.*' \
    --exclude 'storage/' --exclude 'public/' --exclude 'database/database.sqlite' \
    --exclude 'tests/' --exclude '.phpunit.cache/' \
    $([[ "$SYNC_VENDOR" == "1" ]] || echo "--exclude vendor/") \
    -e "$RSYNC_SSH" "$APP_DIR/" "$SSH_USER@$SSH_HOST:$REMOTE_APP/"

step "Sync the web root (public/) into the domain document root"
run rsync -az --delete --human-readable \
    --exclude 'storage' --exclude 'index.html' \
    -e "$RSYNC_SSH" "$APP_DIR/public/" "$SSH_USER@$SSH_HOST:$REMOTE_DOCROOT/"

# public/index.html is excluded above for one important reason: `website:publish` writes it. Syncing
# it would overwrite a published home page with the SPA shell on every deploy.

# ---- run the server-side steps -----------------------------------------------------------------
step "Server-side: permissions, storage, migrations, caches"
REMOTE_FLAGS=""
[[ "$RUN_MIGRATIONS" == "1" ]] && REMOTE_FLAGS="$REMOTE_FLAGS --migrate"
[[ "$SEED_ON_FIRST_DEPLOY" == "1" ]] && REMOTE_FLAGS="$REMOTE_FLAGS --seed-if-empty"
[[ $FIRST_DEPLOY -eq 1 ]] && REMOTE_FLAGS="$REMOTE_FLAGS --first"

if [[ $DRY_RUN -eq 1 ]]; then
    if [[ -n "$DB_NAME" ]]; then
        note "would run: remote.sh --app $REMOTE_APP --php $PHP_BIN $REMOTE_FLAGS --db-name $DB_NAME --db-user $DB_USER --db-pass ***"
    else
        note "would run: remote.sh --app $REMOTE_APP --php $PHP_BIN $REMOTE_FLAGS"
        warn "no DB_NAME/DB_USER/DB_PASSWORD in deploy.conf — the server will write a .env template and stop"
    fi
else
    SCP_OPTS=(-P "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
    [[ -n "$SSH_KEY" ]] && SCP_OPTS+=(-i "$SSH_KEY")
    scp "${SCP_OPTS[@]}" "$SCRIPT_DIR/remote.sh" "$SSH_USER@$SSH_HOST:$REMOTE_APP/../remote.sh"
    # Quoted with %q so a password containing a space, $ or & survives the trip through the remote
    # shell. It is never echoed: `set -x` is not used anywhere in this script for exactly this reason.
    REMOTE_DB=""
    [[ -n "$DB_NAME" ]] && REMOTE_DB="$REMOTE_DB --db-name $(printf %q "$DB_NAME")"
    [[ -n "$DB_USER" ]] && REMOTE_DB="$REMOTE_DB --db-user $(printf %q "$DB_USER")"
    [[ -n "$DB_PASSWORD" ]] && REMOTE_DB="$REMOTE_DB --db-pass $(printf %q "$DB_PASSWORD")"
    [[ -n "$DB_HOST" ]] && REMOTE_DB="$REMOTE_DB --db-host $(printf %q "$DB_HOST")"

    remote "bash $REMOTE_APP/../remote.sh --app $REMOTE_APP --php $PHP_BIN --url $APP_URL $REMOTE_FLAGS $REMOTE_DB" \
        || die "server-side steps failed — see the output above"
fi

# ---- health check ------------------------------------------------------------------------------
step "Health check"
if [[ $DRY_RUN -eq 1 ]]; then note "would GET https://$STAGING_DOMAIN$HEALTH_PATH"; exit 0; fi

sleep 2
CODE=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 30 "$APP_URL$HEALTH_PATH" || echo 000)
case "$CODE" in
    200) note "$APP_URL$HEALTH_PATH → 200" ;;
    301|302) note "$APP_URL$HEALTH_PATH → $CODE (redirect; check APP_URL and force-https)" ;;
    404) die "deploy finished but $HEALTH_PATH returned 404 — is the domain pointed at the right document root?" ;;
    500) die "deploy finished but the site returns 500 — read $REMOTE_APP/storage/logs/laravel.log" ;;
    *)   warn "health check returned $CODE — the deploy ran, but verify the site by hand" ;;
esac

printf '\n%sDeployed.%s  %s  (rollback: %s --rollback)\n' "$C_OK" "$C_OFF" "$APP_URL" "$0"
