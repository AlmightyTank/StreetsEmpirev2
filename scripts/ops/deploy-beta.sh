#!/usr/bin/env bash
# Deploy the isolated beta checkout/database/service.
#
# From the beta checkout:
#   bash scripts/ops/deploy-beta.sh
#
# First deployment into a fresh beta database:
#   SEED=1 bash scripts/ops/deploy-beta.sh
#
# Settings:
#   BETA_SERVICE   beta systemd API unit               (default: streets-empire-beta)
#   BETA_BOT_SERVICE beta Discord bot unit             (default: streets-empire-beta-bot)
#   BRANCH         branch deployed to beta             (default: beta)
#   API_URL        local beta API                      (default: http://127.0.0.1:3003)
#   BETA_SITE_URL  optional external smoke-test URL    (default: https://beta.streetsempire.dev)
#   SEED=1         seed a fresh beta database once
#   SKIP_BOT=1     do not restart the beta bot service
#   SKIP_PULL=1    deploy current checkout without fetching
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BETA_SERVICE="${BETA_SERVICE:-streets-empire-beta}"
BETA_BOT_SERVICE="${BETA_BOT_SERVICE:-streets-empire-beta-bot}"
BRANCH="${BRANCH:-beta}"
API_URL="${API_URL:-http://127.0.0.1:3003}"
BETA_SITE_URL="${BETA_SITE_URL:-https://beta.streetsempire.dev}"
SEED="${SEED:-0}"
SKIP_BOT="${SKIP_BOT:-0}"
SKIP_PULL="${SKIP_PULL:-0}"
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nBeta deploy failed: %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR"

[ -f .env ] || fail "missing beta .env in $APP_DIR"
grep -Eq '^BETA_INVITE_ONLY="?true"?

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "tracked files have local changes; commit or discard them first."
fi

if [ "$SKIP_PULL" = "1" ]; then
  step "Skipping pull; deploying $(git rev-parse --short HEAD)"
else
  step "Updating beta checkout to origin/$BRANCH"
  git fetch --prune origin "$BRANCH"
  git merge --ff-only "origin/$BRANCH" || fail "local $BRANCH diverged from origin/$BRANCH."
fi

step "Installing dependencies"
npm ci

step "Generating Prisma client"
npx prisma generate

step "Building beta"
npm run build

[ -f "$APP_DIR/apps/server/dist/index.js" ] || fail "beta API build missing"
[ -f "$APP_DIR/apps/web/dist/index.html" ] || fail "beta game build missing"

step "Applying beta database migrations"
npx prisma migrate deploy

if [ "$SEED" = "1" ]; then
  step "Seeding beta database"
  npm run db:seed
fi

step "Restarting $BETA_SERVICE"
$SUDO systemctl restart "$BETA_SERVICE"

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 "$API_URL/api/ready" >/dev/null 2>&1; then
    echo "Beta API is ready."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    $SUDO journalctl -u "$BETA_SERVICE" -n 60 --no-pager || true
    fail "beta API did not become ready at $API_URL/api/ready."
  fi
  sleep 2
done

if [ "$SKIP_BOT" != "1" ] && systemctl cat "$BETA_BOT_SERVICE" >/dev/null 2>&1; then
  step "Restarting $BETA_BOT_SERVICE"
  $SUDO systemctl restart "$BETA_BOT_SERVICE"
  sleep 3
  systemctl --no-pager --lines=12 status "$BETA_BOT_SERVICE" || true
fi

if [ -n "$BETA_SITE_URL" ]; then
  step "Checking $BETA_SITE_URL"
  curl -fsS --max-time 10 "$BETA_SITE_URL/" >/dev/null || fail "beta web app did not answer."
  curl -fsS --max-time 10 "$BETA_SITE_URL/api/ready" >/dev/null || fail "beta API did not answer through Nginx."
fi

step "Beta deployed: $(git log -1 --format='%h %s')"
 .env || fail "beta .env must set BETA_INVITE_ONLY=true. Refusing to deploy an open beta."
systemctl cat "$BETA_SERVICE" >/dev/null 2>&1 || fail "no $BETA_SERVICE service. Run scripts/ops/install-beta-service.sh after the first build."

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "tracked files have local changes; commit or discard them first."
fi

if [ "$SKIP_PULL" = "1" ]; then
  step "Skipping pull; deploying $(git rev-parse --short HEAD)"
else
  step "Updating beta checkout to origin/$BRANCH"
  git fetch --prune origin "$BRANCH"
  git merge --ff-only "origin/$BRANCH" || fail "local $BRANCH diverged from origin/$BRANCH."
fi

step "Installing dependencies"
npm ci

step "Generating Prisma client"
npx prisma generate

step "Building beta"
npm run build

[ -f "$APP_DIR/apps/server/dist/index.js" ] || fail "beta API build missing"
[ -f "$APP_DIR/apps/web/dist/index.html" ] || fail "beta game build missing"

step "Applying beta database migrations"
npx prisma migrate deploy

if [ "$SEED" = "1" ]; then
  step "Seeding beta database"
  npm run db:seed
fi

step "Restarting $BETA_SERVICE"
$SUDO systemctl restart "$BETA_SERVICE"

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 "$API_URL/api/ready" >/dev/null 2>&1; then
    echo "Beta API is ready."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    $SUDO journalctl -u "$BETA_SERVICE" -n 60 --no-pager || true
    fail "beta API did not become ready at $API_URL/api/ready."
  fi
  sleep 2
done

if [ "$SKIP_BOT" != "1" ] && systemctl cat "$BETA_BOT_SERVICE" >/dev/null 2>&1; then
  step "Restarting $BETA_BOT_SERVICE"
  $SUDO systemctl restart "$BETA_BOT_SERVICE"
  sleep 3
  systemctl --no-pager --lines=12 status "$BETA_BOT_SERVICE" || true
fi

if [ -n "$BETA_SITE_URL" ]; then
  step "Checking $BETA_SITE_URL"
  curl -fsS --max-time 10 "$BETA_SITE_URL/" >/dev/null || fail "beta web app did not answer."
  curl -fsS --max-time 10 "$BETA_SITE_URL/api/ready" >/dev/null || fail "beta API did not answer through Nginx."
fi

step "Beta deployed: $(git log -1 --format='%h %s')"
