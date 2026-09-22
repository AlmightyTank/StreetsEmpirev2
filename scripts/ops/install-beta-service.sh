#!/usr/bin/env bash
# Install/update the isolated StreetsEmpire beta API systemd service.
#
# Run this from the beta checkout after .env is configured and the app is built:
#   bash scripts/ops/install-beta-service.sh
#
# Settings:
#   PROD_SERVICE  live API unit used to copy User/Node settings (default: streets-empire)
#   BETA_SERVICE  beta API unit name                       (default: streets-empire-beta)
#   BETA_PORT     expected beta API port                   (default: 3003)
#   NODE_BIN      override Node binary if detection fails
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROD_SERVICE="${PROD_SERVICE:-streets-empire}"
BETA_SERVICE="${BETA_SERVICE:-streets-empire-beta}"
BETA_PORT="${BETA_PORT:-3003}"
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

fail() { printf 'Beta service install failed: %s\n' "$*" >&2; exit 1; }

[ -f "$APP_DIR/.env" ] || fail "missing $APP_DIR/.env"
[ -f "$APP_DIR/apps/server/dist/index.js" ] || fail "beta API is not built yet. Run: npm ci && npm run build"

systemctl cat "$PROD_SERVICE" >/dev/null 2>&1 || fail "no production service named $PROD_SERVICE. Rerun with PROD_SERVICE=<your-live-api-unit>."

if ! grep -Eq '^PORT="?'"$BETA_PORT"'"?
  echo "Warning: FRONTEND_ORIGIN in beta .env does not appear to be https://beta.streetsempire.dev" >&2
fi

run_user="$(systemctl show -p User --value "$PROD_SERVICE")"

node_bin="${NODE_BIN:-}"
if [ -z "$node_bin" ]; then
  node_bin="$(systemctl show -p ExecStart --value "$PROD_SERVICE" | sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -n 1)"
  case "$node_bin" in
    */node) ;;
    *) node_bin="$(command -v node || true)" ;;
  esac
fi
[ -n "$node_bin" ] && [ -x "$node_bin" ] || fail "could not find Node. Rerun with NODE_BIN=/path/to/node."

unit="/etc/systemd/system/$BETA_SERVICE.service"
echo "Writing $unit (working directory: $APP_DIR)"
$SUDO tee "$unit" >/dev/null <<EOF
[Unit]
Description=StreetsEmpire Beta API
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
${run_user:+User=$run_user}
WorkingDirectory=$APP_DIR
ExecStart=$node_bin $APP_DIR/apps/server/dist/index.js
Restart=always
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$BETA_SERVICE"

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$BETA_PORT/api/ready" >/dev/null 2>&1; then
    echo "Beta API is ready on 127.0.0.1:$BETA_PORT."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    $SUDO journalctl -u "$BETA_SERVICE" -n 60 --no-pager || true
    fail "beta API did not become ready."
  fi
  sleep 2
done

systemctl --no-pager --lines=12 status "$BETA_SERVICE" || true
echo
echo "Beta service installed. Follow logs with:"
echo "  journalctl -u $BETA_SERVICE -f"
 "$APP_DIR/.env"; then
  fail "$APP_DIR/.env must set PORT=$BETA_PORT before installing the beta service."
fi
if ! grep -Eq '^BETA_INVITE_ONLY="?true"?
  echo "Warning: FRONTEND_ORIGIN in beta .env does not appear to be https://beta.streetsempire.dev" >&2
fi

run_user="$(systemctl show -p User --value "$PROD_SERVICE")"

node_bin="${NODE_BIN:-}"
if [ -z "$node_bin" ]; then
  node_bin="$(systemctl show -p ExecStart --value "$PROD_SERVICE" | sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -n 1)"
  case "$node_bin" in
    */node) ;;
    *) node_bin="$(command -v node || true)" ;;
  esac
fi
[ -n "$node_bin" ] && [ -x "$node_bin" ] || fail "could not find Node. Rerun with NODE_BIN=/path/to/node."

unit="/etc/systemd/system/$BETA_SERVICE.service"
echo "Writing $unit (working directory: $APP_DIR)"
$SUDO tee "$unit" >/dev/null <<EOF
[Unit]
Description=StreetsEmpire Beta API
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
${run_user:+User=$run_user}
WorkingDirectory=$APP_DIR
ExecStart=$node_bin $APP_DIR/apps/server/dist/index.js
Restart=always
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$BETA_SERVICE"

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$BETA_PORT/api/ready" >/dev/null 2>&1; then
    echo "Beta API is ready on 127.0.0.1:$BETA_PORT."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    $SUDO journalctl -u "$BETA_SERVICE" -n 60 --no-pager || true
    fail "beta API did not become ready."
  fi
  sleep 2
done

systemctl --no-pager --lines=12 status "$BETA_SERVICE" || true
echo
echo "Beta service installed. Follow logs with:"
echo "  journalctl -u $BETA_SERVICE -f"
 "$APP_DIR/.env"; then
  fail "$APP_DIR/.env must set BETA_INVITE_ONLY=true. Beta is invite-only."
fi
if ! grep -Eq '^FRONTEND_ORIGIN="?https://beta\.streetsempire\.dev/?"?
  echo "Warning: FRONTEND_ORIGIN in beta .env does not appear to be https://beta.streetsempire.dev" >&2
fi

run_user="$(systemctl show -p User --value "$PROD_SERVICE")"

node_bin="${NODE_BIN:-}"
if [ -z "$node_bin" ]; then
  node_bin="$(systemctl show -p ExecStart --value "$PROD_SERVICE" | sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -n 1)"
  case "$node_bin" in
    */node) ;;
    *) node_bin="$(command -v node || true)" ;;
  esac
fi
[ -n "$node_bin" ] && [ -x "$node_bin" ] || fail "could not find Node. Rerun with NODE_BIN=/path/to/node."

unit="/etc/systemd/system/$BETA_SERVICE.service"
echo "Writing $unit (working directory: $APP_DIR)"
$SUDO tee "$unit" >/dev/null <<EOF
[Unit]
Description=StreetsEmpire Beta API
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
${run_user:+User=$run_user}
WorkingDirectory=$APP_DIR
ExecStart=$node_bin $APP_DIR/apps/server/dist/index.js
Restart=always
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$BETA_SERVICE"

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$BETA_PORT/api/ready" >/dev/null 2>&1; then
    echo "Beta API is ready on 127.0.0.1:$BETA_PORT."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    $SUDO journalctl -u "$BETA_SERVICE" -n 60 --no-pager || true
    fail "beta API did not become ready."
  fi
  sleep 2
done

systemctl --no-pager --lines=12 status "$BETA_SERVICE" || true
echo
echo "Beta service installed. Follow logs with:"
echo "  journalctl -u $BETA_SERVICE -f"
 "$APP_DIR/.env"; then
  echo "Warning: FRONTEND_ORIGIN in beta .env does not appear to be https://beta.streetsempire.dev" >&2
fi

run_user="$(systemctl show -p User --value "$PROD_SERVICE")"

node_bin="${NODE_BIN:-}"
if [ -z "$node_bin" ]; then
  node_bin="$(systemctl show -p ExecStart --value "$PROD_SERVICE" | sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -n 1)"
  case "$node_bin" in
    */node) ;;
    *) node_bin="$(command -v node || true)" ;;
  esac
fi
[ -n "$node_bin" ] && [ -x "$node_bin" ] || fail "could not find Node. Rerun with NODE_BIN=/path/to/node."

unit="/etc/systemd/system/$BETA_SERVICE.service"
echo "Writing $unit (working directory: $APP_DIR)"
$SUDO tee "$unit" >/dev/null <<EOF
[Unit]
Description=StreetsEmpire Beta API
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
${run_user:+User=$run_user}
WorkingDirectory=$APP_DIR
ExecStart=$node_bin $APP_DIR/apps/server/dist/index.js
Restart=always
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$BETA_SERVICE"

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$BETA_PORT/api/ready" >/dev/null 2>&1; then
    echo "Beta API is ready on 127.0.0.1:$BETA_PORT."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    $SUDO journalctl -u "$BETA_SERVICE" -n 60 --no-pager || true
    fail "beta API did not become ready."
  fi
  sleep 2
done

systemctl --no-pager --lines=12 status "$BETA_SERVICE" || true
echo
echo "Beta service installed. Follow logs with:"
echo "  journalctl -u $BETA_SERVICE -f"
