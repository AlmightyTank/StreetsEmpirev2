#!/usr/bin/env bash
# 1.0.0-F. Install the automatic database backup (daily) and restore test (weekly)
# as systemd timers for this checkout: production or beta, whichever its .env is.
# Run it once on the server from the checkout, after the API service is installed:
#
#   bash scripts/ops/install-backup-timer.sh
#
# Settings:
#   API_SERVICE    the API unit whose user and Node the jobs reuse
#                  (default: streets-empire, or streets-empire-beta for a beta checkout)
#   BACKUP_DIR     where backups go (default: /var/backups/streets-empire/<environment>)
#   BACKUP_TIME    systemd OnCalendar for the backup      (default: *-*-* 03:10:00 UTC; beta 03:40)
#   RESTORE_TIME   systemd OnCalendar for the restore test (default: Sun *-*-* 04:10:00 UTC; beta 04:40)
#   NODE_BIN       override Node if detection fails
#
# Afterwards: set BACKUP_OFFSITE in .env for the off-server copy (docs/RECOVERY.md),
# and check /admin/monitoring the next morning.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"
fail() { printf 'Backup timer install failed: %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR"
[ -f .env ] || fail "missing $APP_DIR/.env"
[ -f node_modules/tsx/dist/cli.mjs ] || fail "dependencies are not installed. Run: npm ci"
command -v pg_dump >/dev/null || fail "pg_dump is not installed (apt install postgresql-client-16, matching the database server)."

environment="$(node --input-type=module -e "
import fs from 'node:fs';
import { environmentOf, parseEnvFile } from './scripts/ops/check-environment.mjs';
process.stdout.write(environmentOf(parseEnvFile(fs.readFileSync('.env', 'utf8'))));
")"
case "$environment" in
  production) prefix="streets-empire"; default_backup="*-*-* 03:10:00 UTC"; default_restore="Sun *-*-* 04:10:00 UTC" ;;
  beta) prefix="streets-empire-beta"; default_backup="*-*-* 03:40:00 UTC"; default_restore="Sun *-*-* 04:40:00 UTC" ;;
  *) fail "this checkout's .env is a $environment configuration; timers are for production or beta servers." ;;
esac
API_SERVICE="${API_SERVICE:-$prefix}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/streets-empire/$environment}"
BACKUP_TIME="${BACKUP_TIME:-$default_backup}"
RESTORE_TIME="${RESTORE_TIME:-$default_restore}"

systemctl cat "$API_SERVICE" >/dev/null 2>&1 || fail "no systemd unit named $API_SERVICE. Rerun with API_SERVICE=<your API unit>."
run_user="$(systemctl show -p User --value "$API_SERVICE")"
run_user="${run_user:-root}"

node_bin="${NODE_BIN:-}"
if [ -z "$node_bin" ]; then
  node_bin="$(systemctl show -p ExecStart --value "$API_SERVICE" | sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -n 1)"
  case "$node_bin" in */node) ;; *) node_bin="$(command -v node || true)" ;; esac
fi
[ -n "$node_bin" ] && [ -x "$node_bin" ] || fail "could not find Node. Rerun with NODE_BIN=/path/to/node."

echo "Environment: $environment · user: $run_user · backups: $BACKUP_DIR"
$SUDO mkdir -p "$BACKUP_DIR"
$SUDO chown "$run_user" "$BACKUP_DIR"
# Backups are 0600 and the directory cannot be listed by others; 711 still lets the
# API read status.json (0644) for /admin/monitoring if it runs as another user.
$SUDO chmod 711 "$BACKUP_DIR"

if ! grep -Eq '^BACKUP_STATUS_FILE="?[^"]+' .env; then
  printf '\n# 1.0.0-F: written by install-backup-timer.sh\nBACKUP_DIR="%s"\nBACKUP_STATUS_FILE="%s/status.json"\n' "$BACKUP_DIR" "$BACKUP_DIR" >> .env
  echo "Added BACKUP_DIR and BACKUP_STATUS_FILE to .env (restart $API_SERVICE, or deploy, for monitoring to see them)."
fi

path_env="$(dirname "$node_bin"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
write_job() {
  local name="$1" description="$2" command="$3" calendar="$4" timeout="$5"
  $SUDO tee "/etc/systemd/system/$name.service" >/dev/null <<EOF
[Unit]
Description=$description
Wants=network-online.target
After=network-online.target postgresql.service

[Service]
Type=oneshot
User=$run_user
WorkingDirectory=$APP_DIR
Environment=PATH=$path_env
Environment=BACKUP_DIR=$BACKUP_DIR
ExecStart=$node_bin $APP_DIR/node_modules/tsx/dist/cli.mjs scripts/ops/backup.ts $command
TimeoutStartSec=$timeout
Nice=10
IOSchedulingClass=idle
NoNewPrivileges=true
EOF
  $SUDO tee "/etc/systemd/system/$name.timer" >/dev/null <<EOF
[Unit]
Description=$description (schedule)

[Timer]
OnCalendar=$calendar
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF
  echo "Wrote $name.service and $name.timer ($calendar)"
}

write_job "$prefix-backup" "StreetsEmpire $environment database backup" "backup" "$BACKUP_TIME" "2h"
write_job "$prefix-restore-test" "StreetsEmpire $environment restore test" "restore-test" "$RESTORE_TIME" "3h"

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$prefix-backup.timer" "$prefix-restore-test.timer"

echo
echo "Taking the first backup and restore test now..."
$SUDO systemctl start "$prefix-backup.service" || { $SUDO journalctl -u "$prefix-backup" -n 30 --no-pager; fail "the first backup failed."; }
$SUDO systemctl start "$prefix-restore-test.service" || {
  $SUDO journalctl -u "$prefix-restore-test" -n 30 --no-pager
  echo "The restore test failed. If it says 'permission denied to create database', either"
  echo "  ALTER ROLE <db user> CREATEDB;   or set RESTORE_TEST_DATABASE_URL to a separate empty database."
  fail "the first restore test failed."
}
$SUDO journalctl -u "$prefix-backup" -u "$prefix-restore-test" -n 12 --no-pager -o cat || true
echo
systemctl list-timers "$prefix-*" --no-pager || true
echo
echo "Done. Next: set BACKUP_OFFSITE in .env so a copy leaves this server (docs/RECOVERY.md)."
