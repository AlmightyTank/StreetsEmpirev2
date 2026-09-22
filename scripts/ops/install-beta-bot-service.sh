#!/usr/bin/env bash
# Install/update the isolated StreetsEmpire beta Discord bot systemd service.
#
# Run this from the beta checkout after .env is configured and the app is built:
#   bash scripts/ops/install-beta-bot-service.sh
#
# Settings:
#   BETA_API_SERVICE  beta API unit used to copy User/Node settings (default: streets-empire-beta)
#   BETA_BOT_SERVICE  beta bot unit name                       (default: streets-empire-beta-bot)
#   NODE_BIN          override Node binary if detection fails
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_SERVICE="${API_SERVICE:-${BETA_API_SERVICE:-streets-empire-beta}}"
BOT_SERVICE="${BOT_SERVICE:-${BETA_BOT_SERVICE:-streets-empire-beta-bot}}"
export API_SERVICE BOT_SERVICE

exec bash "$SCRIPT_DIR/install-bot-service.sh"
