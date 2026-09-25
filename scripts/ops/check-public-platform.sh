#!/usr/bin/env bash
# Post-cutover smoke test for the StreetsEmpire public platform.
#
#   bash scripts/ops/check-public-platform.sh
#
# Optional:
#   PUBLIC_SITE_URL=https://streetsempire.dev
#   LIVE_SITE_URL=https://play.streetsempire.dev
#   FORUM_URL=https://forum.streetsempire.dev
set -euo pipefail

PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-https://streetsempire.dev}"
LIVE_SITE_URL="${LIVE_SITE_URL:-https://play.streetsempire.dev}"
FORUM_URL="${FORUM_URL:-https://forum.streetsempire.dev}"

ok() { printf '  OK  %s\n' "$*"; }
fail() { printf ' FAIL %s\n' "$*" >&2; exit 1; }
get() {
  local url="$1"
  curl -fsS --max-time 12 "$url" >/dev/null || fail "$url"
  ok "$url"
}
assert_serves_app() {
  local url="$1"
  local marker="$2"
  local label="$3"
  local html
  html="$(curl -fsS --max-time 12 "$url")" || fail "$url"
  case "$html" in
    *"$marker"*) ok "$label serves the expected frontend" ;;
    *) fail "$label answered, but it did not include $marker" ;;
  esac
}

printf 'Public website\n'
assert_serves_app "$PUBLIC_SITE_URL/" 'data-streets-app="public-site"' "$PUBLIC_SITE_URL"
get "$PUBLIC_SITE_URL/robots.txt"
get "$PUBLIC_SITE_URL/sitemap.xml"
get "$PUBLIC_SITE_URL/api/public/status"
get "$PUBLIC_SITE_URL/api/public/overview"
get "$PUBLIC_SITE_URL/api/public/games"
get "$PUBLIC_SITE_URL/api/public/rankings"
get "$PUBLIC_SITE_URL/api/public/cities"
get "$PUBLIC_SITE_URL/api/public/turf"
get "$PUBLIC_SITE_URL/api/public/hall-of-fame"
get "$PUBLIC_SITE_URL/api/public/stats"
get "$PUBLIC_SITE_URL/api/public/news"

printf '\nPublic API boundary\n'
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "$PUBLIC_SITE_URL/api/auth/me" || true)"
[ "$code" = "404" ] || fail "$PUBLIC_SITE_URL/api/auth/me returned HTTP $code; expected 404 on the public host"
ok "non-public API is blocked on streetsempire.dev"

printf '\nLive game\n'
assert_serves_app "$LIVE_SITE_URL/" 'data-streets-app="game-client"' "$LIVE_SITE_URL"
get "$LIVE_SITE_URL/api/ready"

printf '\nForum\n'
get "$FORUM_URL/"

printf '\nPublic platform smoke test passed.\n'
