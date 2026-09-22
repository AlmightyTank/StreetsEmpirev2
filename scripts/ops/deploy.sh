#!/usr/bin/env bash
# Deploy the latest main on the VPS: pull, install, build, migrate, restart the
# game API and Discord bot, then check both came back. See docs/DEPLOY.md.
#
#   bash scripts/ops/deploy.sh
#
# Settings (environment variables):
#   API_SERVICE  systemd unit for the game API   (default: streets-empire)
#   BOT_SERVICE  systemd unit for the Discord bot (default: streets-empire-bot)
#   BRANCH       branch to deploy                 (default: main)
#   API_URL      where the API listens locally     (default: http://127.0.0.1:3001)
#   PUBLIC_SITE_URL optional public-site smoke URL  (e.g. https://streetsempire.dev)
#   LIVE_SITE_URL   optional live-game smoke URL    (e.g. https://play.streetsempire.dev)
#   SKIP_PULL=1  rebuild and restart the current checkout (e.g. after a rollback)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_SERVICE="${API_SERVICE:-streets-empire}"
BOT_SERVICE="${BOT_SERVICE:-streets-empire-bot}"
BRANCH="${BRANCH:-main}"
API_URL="${API_URL:-http://127.0.0.1:3001}"
PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-}"
LIVE_SITE_URL="${LIVE_SITE_URL:-}"
SKIP_PULL="${SKIP_PULL:-0}"
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nDeploy failed: %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR"

step "Checking $APP_DIR"
systemctl cat "$API_SERVICE" >/dev/null 2>&1 \
  || fail "no systemd unit named $API_SERVICE. Find yours with: systemctl list-units --type=service | grep -i -E 'street|empire|node' and rerun with API_SERVICE=<name>."
if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "tracked files have local changes; commit or discard them first (git status)."
fi

if [ "$SKIP_PULL" = "1" ]; then
  step "Skipping pull; deploying the current checkout $(git rev-parse --short HEAD)"
else
  step "Updating to origin/$BRANCH"
  previous="$(git rev-parse --short HEAD)"
  git fetch --prune origin "$BRANCH"
  git merge --ff-only "origin/$BRANCH" || fail "local $BRANCH has diverged from origin/$BRANCH; resolve it by hand."
  echo "$previous -> $(git rev-parse --short HEAD)"
fi

step "Installing dependencies"
npm ci

step "Generating the Prisma client"
npx prisma generate

step "Building"
npm run build

[ -f "$APP_DIR/apps/web/dist/index.html" ] || fail "game frontend build is missing: apps/web/dist/index.html"
[ -f "$APP_DIR/apps/site/dist/index.html" ] || fail "public website build is missing: apps/site/dist/index.html"
[ -f "$APP_DIR/apps/server/dist/index.js" ] || fail "API build is missing: apps/server/dist/index.js"
grep -q 'data-streets-app="game-client"' "$APP_DIR/apps/web/dist/index.html" \
  || fail "game frontend build does not contain the expected game-client marker"
grep -q 'data-streets-app="public-site"' "$APP_DIR/apps/site/dist/index.html" \
  || fail "public website build does not contain the expected public-site marker"

step "Applying database migrations"
npx prisma migrate deploy

step "Restarting $API_SERVICE"
$SUDO systemctl restart "$API_SERVICE"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 "$API_URL/api/ready" >/dev/null 2>&1; then
    echo "API is ready."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    $SUDO journalctl -u "$API_SERVICE" -n 40 --no-pager || true
    fail "the API did not become ready at $API_URL/api/ready within 60 seconds."
  fi
  sleep 2
done

if systemctl cat "$BOT_SERVICE" >/dev/null 2>&1; then
  step "Restarting $BOT_SERVICE"
  $SUDO systemctl restart "$BOT_SERVICE"
  # A bot with bad config exits within a few seconds and systemd shows it as restarting.
  sleep 10
  if ! systemctl is-active --quiet "$BOT_SERVICE"; then
    $SUDO journalctl -u "$BOT_SERVICE" -n 40 --no-pager || true
    fail "$BOT_SERVICE is not running."
  fi
  echo "Bot is running."
else
  step "Skipping the bot: no $BOT_SERVICE unit yet (install it once with scripts/ops/install-bot-service.sh)"
fi

if [ -n "$PUBLIC_SITE_URL" ]; then
  step "Checking public website $PUBLIC_SITE_URL"
  public_html="$(curl -fsS --max-time 10 "$PUBLIC_SITE_URL/")" \
    || fail "public website did not answer at $PUBLIC_SITE_URL/"
  case "$public_html" in
    *'data-streets-app="public-site"'*) ;;
    *) fail "public website answered at $PUBLIC_SITE_URL/ but did not serve the public-site build. Check the Nginx root for streetsempire.dev." ;;
  esac
  curl -fsS --max-time 10 "$PUBLIC_SITE_URL/api/public/status" >/dev/null     || fail "public API did not answer through $PUBLIC_SITE_URL/api/public/status"
fi

if [ -n "$LIVE_SITE_URL" ]; then
  step "Checking live game $LIVE_SITE_URL"
  live_html="$(curl -fsS --max-time 10 "$LIVE_SITE_URL/")" \
    || fail "live game did not answer at $LIVE_SITE_URL/"
  case "$live_html" in
    *'data-streets-app="game-client"'*) ;;
    *) fail "live game answered at $LIVE_SITE_URL/ but did not serve the game-client build. Check the Nginx root for play.streetsempire.dev." ;;
  esac
  curl -fsS --max-time 10 "$LIVE_SITE_URL/api/ready" >/dev/null     || fail "live API did not answer through $LIVE_SITE_URL/api/ready"
fi

step "Deployed $(git log -1 --format='%h %s')"
