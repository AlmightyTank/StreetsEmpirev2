#!/usr/bin/env bash
# One time, on the VPS: install a systemd unit that runs the Discord bot next to
# the game API, starts it on boot and restarts it if it crashes. The user and
# Node binary are copied from the existing API unit so both run the same way.
# See docs/DEPLOY.md.
#
#   bash scripts/ops/install-bot-service.sh
#
# Settings (environment variables):
#   API_SERVICE  existing systemd unit for the game API (default: streets-empire)
#   BOT_SERVICE  name for the new bot unit             (default: streets-empire-bot)
#   NODE_BIN     Node binary, if it can't be detected
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_SERVICE="${API_SERVICE:-streets-empire}"
BOT_SERVICE="${BOT_SERVICE:-streets-empire-bot}"
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

fail() { printf 'Install failed: %s\n' "$*" >&2; exit 1; }

systemctl cat "$API_SERVICE" >/dev/null 2>&1 \
  || fail "no systemd unit named $API_SERVICE. Find yours with: systemctl list-units --type=service | grep -i -E 'street|empire|node' and rerun with API_SERVICE=<name>."
[ -f "$APP_DIR/apps/discord-bot/dist/index.js" ] \
  || fail "the bot isn't built yet. Run: npm ci && npm run build"
grep -q '^DISCORD_BOT_TOKEN="\?[^"]' "$APP_DIR/.env" 2>/dev/null \
  || echo "Warning: DISCORD_BOT_TOKEN looks empty in $APP_DIR/.env; the bot will exit until it's set (see apps/discord-bot/README.md)." >&2

run_user="$(systemctl show -p User --value "$API_SERVICE")"

node_bin="${NODE_BIN:-}"
if [ -z "$node_bin" ]; then
  # ExecStart looks like: { path=/usr/bin/node ; argv[]=/usr/bin/node dist/index.js ; ... }
  node_bin="$(systemctl show -p ExecStart --value "$API_SERVICE" | sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -n 1)"
  case "$node_bin" in
    */node) ;;
    *) node_bin="$(command -v node || true)" ;;
  esac
fi
[ -n "$node_bin" ] && [ -x "$node_bin" ] || fail "could not find Node. Rerun with NODE_BIN=/path/to/node (see: which node)."

unit="/etc/systemd/system/$BOT_SERVICE.service"
echo "Writing $unit (user: ${run_user:-root}, node: $node_bin)"
$SUDO tee "$unit" >/dev/null <<EOF
[Unit]
Description=StreetsEmpire Discord bot
Wants=network-online.target
After=network-online.target $API_SERVICE.service

[Service]
Type=simple
${run_user:+User=$run_user}
WorkingDirectory=$APP_DIR
ExecStart=$node_bin $APP_DIR/apps/discord-bot/dist/index.js
Restart=always
RestartSec=5
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$BOT_SERVICE"

if [ "$(systemctl is-enabled "$API_SERVICE" 2>/dev/null || true)" != "enabled" ]; then
  echo "Note: $API_SERVICE doesn't start on boot. To fix that: $SUDO systemctl enable $API_SERVICE" >&2
fi

sleep 5
systemctl --no-pager --lines=10 status "$BOT_SERVICE" || true
echo
echo "Follow the bot's log with: journalctl -u $BOT_SERVICE -f"
