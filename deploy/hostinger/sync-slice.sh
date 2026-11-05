#!/usr/bin/env bash
#
# Ship the slice, not the whole app.
#
# deploy.sh needs the full Woodex OS checkout on the machine running it. That is fine on your laptop
# and impossible in a fresh GitHub runner, which only has this repository. So CI uses this path
# instead: sync the slice to the server, apply it over the app that is already there with apply.sh,
# then run the same server-side steps deploy.sh runs.
#
#   ./sync-slice.sh              build the SPA, ship the slice, apply, migrate, cache, health-check
#   ./sync-slice.sh --skip-build reuse the dist/ already on disk
#
# Requires on the server (one-time, by hand): ~/woodex-app is a working installation (see README §3).

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

SKIP_BUILD=0
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=1

CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/deploy.conf}"
[[ -f "$CONFIG_FILE" ]] && set -a && . "$CONFIG_FILE" && set +a

SSH_HOST="${SSH_HOST:?set SSH_HOST}"
SSH_PORT="${SSH_PORT:-65002}"
SSH_USER="${SSH_USER:?set SSH_USER}"
SSH_KEY="${SSH_KEY:-}"
REMOTE_APP="${REMOTE_APP:?set REMOTE_APP}"
REMOTE_SLICE="${REMOTE_SLICE:-$(dirname "$REMOTE_APP")/woodex-slice}"
STAGING_DOMAIN="${STAGING_DOMAIN:?set STAGING_DOMAIN}"
APP_URL="${APP_URL:-https://$STAGING_DOMAIN}"
PHP_BIN="${PHP_BIN:-php}"
HEALTH_PATH="${HEALTH_PATH:-/page-preview/home}"

if [[ -t 1 ]]; then C_OK=$'\e[32m'; C_DIM=$'\e[2m'; C_OFF=$'\e[0m'; else C_OK=; C_DIM=; C_OFF=; fi
step() { printf '\n%s==> %s%s\n' "$C_OK" "$*" "$C_OFF"; }
note() { printf '    %s%s%s\n' "$C_DIM" "$*" "$C_OFF"; }

SSH_OPTS=(-p "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
[[ -n "$SSH_KEY" ]] && SSH_OPTS+=(-i "$SSH_KEY")
remote() { ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" "$@"; }

RSYNC_SSH="ssh -p $SSH_PORT -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
[[ -n "$SSH_KEY" ]] && RSYNC_SSH="$RSYNC_SSH -i $SSH_KEY"

step "Preflight"
remote 'echo ok' >/dev/null || { echo "cannot ssh to $SSH_HOST" >&2; exit 1; }
remote "test -f $REMOTE_APP/artisan" || {
    echo "no application at $REMOTE_APP — do the one-time bootstrap in deploy/hostinger/README.md §3" >&2
    exit 1
}
note "app on server: $REMOTE_APP"
note "slice staging: $REMOTE_SLICE"

if [[ $SKIP_BUILD -eq 0 ]]; then
    step "Build the storefront SPA"
    [[ -d "$REPO_DIR/node_modules" ]] || ( cd "$REPO_DIR" && npm ci )
    ( cd "$REPO_DIR" && npx vite build )
fi

step "Sync the slice"
# deploy/keys holds a private key; it never leaves this machine.
rsync -az --delete --human-readable \
    --exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' --exclude 'deploy/keys/' \
    -e "$RSYNC_SSH" "$REPO_DIR/" "$SSH_USER@$SSH_HOST:$REMOTE_SLICE/"

if [[ -d "$REPO_DIR/dist/front" ]]; then
    step "Ship the built SPA bundles"
    remote "mkdir -p $REMOTE_APP/public/front"
    rsync -az --delete -e "$RSYNC_SSH" "$REPO_DIR/dist/front/" "$SSH_USER@$SSH_HOST:$REMOTE_APP/public/front/"
fi

step "Apply the slice to the application"
remote "sh $REMOTE_SLICE/tools/furniture-commerce/apply.sh $REMOTE_APP" || {
    echo "apply.sh failed on the server" >&2; exit 1;
}

step "Migrate, cache, publish"
remote "bash $REMOTE_SLICE/deploy/hostinger/remote.sh --app $REMOTE_APP --php $PHP_BIN --url $APP_URL --migrate"

step "Health check"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 30 "$APP_URL$HEALTH_PATH" || echo 000)
note "$APP_URL$HEALTH_PATH → $CODE"
[[ "$CODE" == "200" ]] || { echo "health check failed ($CODE)" >&2; exit 1; }
