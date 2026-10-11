# Automatic VPS deployments

A push to `beta` or `main` runs validation against that exact pushed commit.
After typechecking, tests, migrations in a disposable CI database, and the full
build pass, GitHub Actions connects to the VPS and deploys that same commit:

- `beta` → `/opt/streets-empire/StreetsEmpirev2-beta` → beta services/database.
- `main` → `/opt/streets-empire/StreetsEmpirev2` → production services/database.

Pull requests validate but never deploy. Failed validation leaves the running game
unchanged. Each deployment uses the existing pre-deploy backup, migration, restart,
and health-check process.

## One-time GitHub setup

Create two GitHub Environments in **Settings → Environments**: `beta` and
`production`. Add these four secrets to each environment with that environment's
VPS connection details:

- `VPS_HOST`: VPS hostname or IP address.
- `VPS_USER`: SSH deploy user.
- `VPS_SSH_PRIVATE_KEY`: private half of a dedicated SSH key pair.
- `VPS_SSH_KNOWN_HOSTS`: verified SSH host-key line for the VPS.

Generate the key pair on a trusted machine, add only its public key to the deploy
user's `~/.ssh/authorized_keys`, and save the private key as a GitHub secret. Get
the host-key line with `ssh-keyscan -H <your-vps-host>`, then verify its fingerprint
from the VPS console before saving it. Host-key checking stays enabled.

The VPS deploy account needs access to both checkouts and their `.env` files,
Git access to fetch the repository, Node.js/npm, database access, and permission
for the scripts' service checks/restarts. Configure narrow passwordless sudo rules
for only the relevant systemd units and failure logs, as described in
[DEPLOY.md](DEPLOY.md) and [BETA-DEPLOY.md](BETA-DEPLOY.md).

## Deploy or roll back to a chosen commit

In **Actions → Public Platform → Run workflow**:

1. Choose `beta` or `main`.
2. Leave **commit_sha** blank to use the selected branch's current tip, or enter a
   commit SHA from that branch to deploy a specific version.
3. Run the workflow and watch the validation and deployment jobs.

The selected commit is tested before deployment. The VPS script also verifies that
it is a commit in the selected branch's history. To roll back, choose an earlier
known-good SHA from the same branch. The normal backup, migration, restart, and
health checks still apply. This does not reverse database migrations; use the
database recovery process in [RECOVERY.md](RECOVERY.md) if a rollback requires
restoring data.

## First run

Before relying on automation, test the SSH account from a trusted machine and run
the existing deploy scripts manually once on the VPS. Add the workflow and secret
configuration to both `beta` and `main`. Future pushes will validate and deploy
automatically; manual commit selection is available from the Actions page.

After deploying a selected older SHA, the helper returns the VPS checkout to the branch tip. The services keep running the selected build until the next deployment, and later automatic pushes continue to work.

## Deploy notices

When the Discord bot has a status channel (`DISCORD_STATUS_CHANNEL_ID`, see the
[bot README](../apps/discord-bot/README.md)), each deploy posts there:

1. Before deploying, the workflow runs `scripts/ops/deploy-status.mjs started` in
   the checkout, and the channel says the game is updating.
2. After a successful deploy, `finished` edits that post to say the update is live.
3. If any deploy step fails, `failed` edits it to say the update hit a problem.

These use the same `PATCH_NOTES_API_TOKEN` as patch notes, and every step only
warns: a missing token, a down API or an old checkout without the script never
fails a deploy. While a deploy it announced is running, the bot also holds back
its own "the game isn't responding" posts.

## Patch notes

After a successful deploy, the workflow turns the PRs in it into one news post
that waits for review:

1. Each PR's description has a `## Patch notes` section (the PR template adds
   it). Its bullets are written for players. Write `none`, or leave the section
   out, for changes players won't notice.
2. The workflow finds every PR merged into the deployed branch since the last
   deploy whose notes were handled, and collects their bullets in merge order.
3. It sends them to the game on the VPS as a global news post titled
   `Patch notes: <date>`, scheduled `PATCH_NOTES_HOLD_MINUTES` ahead (default
   120). The run's summary page shows the notes too.
4. Until then, players, Discord and the forum don't see the post. In
   **Admin → News**, edit it, delete it, or click **Publish now**. If nobody acts,
   it publishes at the scheduled time and the bot posts it to Discord. Use
   **Post to forum** after it publishes to mirror it.

Set it up once per server: put a new random 64+ character secret in
`PATCH_NOTES_API_TOKEN` in the checkout's `.env` (`openssl rand -hex 48`) and
restart the API. While it's empty the internal endpoint answers 404 and
deploys just log that patch notes are off.

The first deploy that runs this step only records its commit, so older PRs are
never announced. The last handled commit is kept in `.deploy/patch-notes-commit`
in the checkout; delete that file to start over from the next deploy. A rollback
posts nothing and leaves the marker alone, so redeploying forward doesn't repeat
notes. If the notes step fails, the deploy still counts as successful; the step
shows a warning and the next deploy picks up the same PRs again. Re-running a
job within a day never posts the same notes twice.

Beta gets its own notes on the beta game from PRs merged into `beta`. Commits
cherry-picked straight onto `beta` have no PR, so they have no notes.
