#!/usr/bin/env bash
# 1.0.0-F. Turn maintenance mode on or off for this checkout's API. See docs/RECOVERY.md.
#
#   bash scripts/ops/maintenance.sh on ["message players see"]
#   bash scripts/ops/maintenance.sh off
#   bash scripts/ops/maintenance.sh status
#
# On: every player request gets 503 and the message; admins, sign-in, health checks,
# the status page and the site banner keep working, so admins can check the game
# before reopening it. It sets MAINTENANCE_MODE (and MAINTENANCE_MESSAGE) in .env and
# restarts the API; restarts take a few seconds. For planned work, announce it first
# with a maintenance banner (Admin > Site banner), and pause the season (Admin >
# Rounds) so nobody loses time while they are shut out.
#
# Settings:
#   API_SERVICE  API unit (default: streets-empire, or streets-empire-beta for a beta checkout)
#   API_URL      local API (default: http://127.0.0.1:3001, beta http://127.0.0.1:3003)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"
fail() { printf 'Maintenance: %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR"
[ -f .env ] || fail "missing .env in $APP_DIR"
environment="$(node --input-type=module -e "
import fs from 'node:fs';
import { environmentOf, parseEnvFile } from './scripts/ops/check-environment.mjs';
process.stdout.write(environmentOf(parseEnvFile(fs.readFileSync('.env', 'utf8'))));
")"
case "$environment" in
  beta) API_SERVICE="${API_SERVICE:-streets-empire-beta}"; API_URL="${API_URL:-http://127.0.0.1:3003}" ;;
  *) API_SERVICE="${API_SERVICE:-streets-empire}"; API_URL="${API_URL:-http://127.0.0.1:3001}" ;;
esac

set_env() { node scripts/ops/set-env.mjs "$1" "$2"; }

ready_field() {
  curl -fsS --max-time 3 "$API_URL/api/ready" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(JSON.parse(s).maintenance))}catch{process.stdout.write('down')}})"
}

restart_and_check() {
  local expect="$1"
  $SUDO systemctl restart "$API_SERVICE"
  for attempt in $(seq 1 30); do
    state="$(ready_field || true)"
    if [ "$state" = "$expect" ]; then return 0; fi
    sleep 2
  done
  $SUDO journalctl -u "$API_SERVICE" -n 30 --no-pager || true
  fail "$API_SERVICE did not come back with maintenance=$expect (last: ${state:-no answer})."
}

case "${1:-status}" in
  on)
    set_env MAINTENANCE_MODE true
    [ -n "${2:-}" ] && set_env MAINTENANCE_MESSAGE "$2"
    restart_and_check true
    code="$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/game/state" || true)"
    echo "Maintenance mode is ON for $environment. Players get HTTP $code; admins can still sign in and play-test."
    ;;
  off)
    set_env MAINTENANCE_MODE false
    restart_and_check false
    echo "Maintenance mode is OFF for $environment. Remember to resume the season if you paused it."
    ;;
  status)
    echo "$environment ($API_SERVICE): maintenance=$(ready_field || echo 'no answer')"
    ;;
  *) fail "usage: maintenance.sh on [message] | off | status" ;;
esac
