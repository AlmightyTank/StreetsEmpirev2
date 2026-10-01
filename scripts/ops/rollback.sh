#!/usr/bin/env bash
# 1.0.0-F. Put the previous good build back after a bad deploy. See docs/RECOVERY.md.
#
#   bash scripts/ops/rollback.sh              back to the last deploy before this one
#   bash scripts/ops/rollback.sh <commit>     back to a chosen commit
#
# It moves this checkout's branch to that commit and redeploys it with SKIP_PULL=1
# (deploy.sh or deploy-beta.sh, whichever this checkout is), which takes a fresh
# pre-deploy backup first. Database migrations are NOT undone: code is rolled back,
# the schema stays. That is safe while migrations are additive (the project rule);
# when the bad deploy rewrote or dropped data, restore its predeploy backup instead
# (docs/RECOVERY.md, "The migration broke data").
#
# The next ordinary deploy fast-forwards to origin again, so push the fix (or a
# revert) before deploying next.
#
# Settings:
#   YES=1   do not ask for confirmation (for when there is no terminal)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
YES="${YES:-0}"
fail() { printf '\nRollback failed: %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR"
[ -f .env ] || fail "missing .env in $APP_DIR"
if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "tracked files have local changes; commit or discard them first (git status)."
fi

environment="$(node --input-type=module -e "
import fs from 'node:fs';
import { environmentOf, parseEnvFile } from './scripts/ops/check-environment.mjs';
process.stdout.write(environmentOf(parseEnvFile(fs.readFileSync('.env', 'utf8'))));
")"
case "$environment" in
  production) deploy_script="scripts/ops/deploy.sh" ;;
  beta) deploy_script="scripts/ops/deploy-beta.sh" ;;
  *) fail "this checkout's .env is a $environment configuration; rollback is for production or beta." ;;
esac

current="$(git rev-parse HEAD)"
history_file="$APP_DIR/.deploy/history"
rolled_back_file="$APP_DIR/.deploy/rolled-back"
target="${1:-}"
if [ -z "$target" ]; then
  [ -f "$history_file" ] || fail "no deploy history yet ($history_file). Pass the commit to roll back to: bash scripts/ops/rollback.sh <commit>"
  # Newest first; skip what is running now and anything already rolled back.
  target="$(tac "$history_file" | awk '{print $2}' | while read -r commit; do
    [ "$commit" = "$current" ] && continue
    [ -f "$rolled_back_file" ] && grep -qx "$commit" "$rolled_back_file" && continue
    echo "$commit"; break
  done || true)"
  [ -n "$target" ] || fail "no earlier good deploy in $history_file. Pass the commit: bash scripts/ops/rollback.sh <commit>"
fi
target="$(git rev-parse --verify --quiet "$target^{commit}")" || fail "${1:-$target} is not a commit in this checkout (git fetch first?)."
[ "$target" != "$current" ] || fail "$(git rev-parse --short "$target") is already checked out."

echo "Environment:  $environment"
echo "Running now:  $(git log -1 --format='%h %s' "$current")"
echo "Roll back to: $(git log -1 --format='%h %s (%cr)' "$target")"

new_migrations="$(git diff --name-only --diff-filter=A "$target" "$current" -- prisma/migrations | sed -n 's#^prisma/migrations/\([^/]*\)/migration.sql$#\1#p')"
if [ -n "$new_migrations" ]; then
  echo
  echo "These migrations came with the build being rolled back. They STAY applied:"
  printf '  %s\n' $new_migrations
  echo "The older code runs on the newer schema when migrations are additive. If one of them"
  echo "dropped or rewrote data, stop and follow \"The migration broke data\" in docs/RECOVERY.md."
fi

if [ "$YES" != "1" ]; then
  [ -t 0 ] || fail "not a terminal; rerun with YES=1 to confirm."
  printf '\nRoll back now? [y/N] '
  read -r answer
  case "$answer" in y|Y|yes) ;; *) fail "cancelled." ;; esac
fi

mkdir -p "$APP_DIR/.deploy"
echo "$current" >> "$rolled_back_file"
git reset --keep "$target"
echo
echo "Checked out $(git rev-parse --short HEAD); redeploying it with $deploy_script"
SKIP_PULL=1 bash "$deploy_script"
echo
echo "Rolled back to $(git log -1 --format='%h %s'). Push a fix or revert before the next deploy."
