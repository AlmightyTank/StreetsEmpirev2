#!/usr/bin/env bash
# Deploy one validated commit from main or beta using the repository's existing
# environment-specific deployment script.
set -euo pipefail

branch="${1:-}"
requested_commit="${2:-}"
fail() { printf 'Selected-commit deploy failed: %s\n' "$*" >&2; exit 1; }

case "$branch" in
  beta)
    APP_DIR="/opt/streets-empire/StreetsEmpirev2-beta"
    deploy_script="scripts/ops/deploy-beta.sh"
    ;;
  main)
    APP_DIR="/opt/streets-empire/StreetsEmpirev2"
    deploy_script="scripts/ops/deploy.sh"
    ;;
  *)
    fail "branch must be beta or main."
    ;;
esac

[[ -d "$APP_DIR/.git" || -f "$APP_DIR/.git" ]] || fail "checkout not found at $APP_DIR."
cd "$APP_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "tracked files have local changes; refusing to switch commits."
fi

git fetch --prune origin "$branch"
branch_tip="$(git rev-parse --verify "origin/$branch^{commit}")" || fail "could not resolve origin/$branch."

if [[ -z "$requested_commit" ]]; then
  target="$branch_tip"
else
  [[ "$requested_commit" =~ ^[[:xdigit:]]{7,40}$ ]] || fail "commit must be a 7–40 character hexadecimal SHA."
  target="$(git rev-parse --verify "$requested_commit^{commit}")" || fail "commit was not found in this checkout."
  git merge-base --is-ancestor "$target" "$branch_tip" \
    || fail "commit $target is not in the selected $branch branch history."
fi

# Always leave the worktree at the current branch tip, even after a rollback.
# The deployment script records/builds the selected SHA before this cleanup.
restore_checkout() {
  git checkout --detach "$branch_tip" >/dev/null 2>&1 \
    || printf 'Warning: could not restore checkout to origin/%s (%s).\n' "$branch" "$branch_tip" >&2
}
trap restore_checkout EXIT

printf 'Deploying %s commit %s\n' "$branch" "$target"
git checkout --detach "$target"
SKIP_PULL=1 BRANCH="$branch" bash "$deploy_script"
