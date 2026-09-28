# Reliability & recovery (1.0.0-F)

What to do when StreetsEmpire breaks, and what is in place so that a broken server
is an incident rather than the end of the game. Commands run from the checkout
(`/opt/streets-empire/StreetsEmpirev2` for production, the beta checkout for beta).
Every script works out whether it is on production or beta from that checkout's `.env`.

| Something is wrong | Go to |
| --- | --- |
| "Is it broken?" | [Monitoring](#monitoring) |
| A deploy failed half way | [Failed deploy](#failed-deploy) |
| A deploy went out and the game misbehaves | [Rolling back](#rolling-back) |
| A migration destroyed or corrupted data | [The migration broke data](#the-migration-broke-data) |
| The database is gone, or the whole server is | [Restoring from a backup](#restoring-from-a-backup) |
| Players must be kept out while you work | [Maintenance mode](#maintenance-mode) |

---

## One-time setup

### 1. Backups and weekly restore tests

```bash
bash scripts/ops/install-backup-timer.sh
```

This installs two systemd timers for this checkout's environment and runs each once
straight away:

- `streets-empire-backup` (beta: `streets-empire-beta-backup`) runs daily at 03:10 UTC
  (beta 03:40).
- `streets-empire-restore-test` (beta: `streets-empire-beta-restore-test`) runs every
  Sunday at 04:10 UTC (beta 04:40).

Backups go to `/var/backups/streets-empire/<environment>`. The installer also adds
`BACKUP_DIR` and `BACKUP_STATUS_FILE` to `.env`, so the API can report backup health
once it is restarted or next deployed.

The restore test creates a scratch database next to the live one and drops it
afterwards. That needs the database user to have `CREATEDB`:

```sql
ALTER ROLE streets CREATEDB;
```

If you would rather not grant that, create one empty database for tests yourself
and set `RESTORE_TEST_DATABASE_URL` to it. It must not be the live database; the
script refuses if it is.

### 2. An off-server copy

A backup on the same disk dies with the disk. Set one of these in `.env`:

```bash
# rclone (Backblaze B2, S3, Google Drive, another server over SFTP...): configure a remote with `rclone config` first
BACKUP_OFFSITE="rclone:b2:streets-backups/production"
# rsync over SSH to another machine (key-based login for the user the timer runs as)
BACKUP_OFFSITE="rsync:backup@vault.example.net:/srv/streets/production"
# AWS S3 with the aws CLI configured
BACKUP_OFFSITE="s3://streets-backups/production"
```

Every backup and its manifest are copied after they are verified. A failed copy
still leaves the local backup, and it shows on `/admin/monitoring` as
"off-server copy failed".

For retention of the off-server copies, use the storage's own lifecycle rule. For
example, delete after 60 days, which matches 14 daily plus 8 weekly copies.

### 3. Optional: external monitoring

To let an outside monitor (Uptime Kuma, Better Stack, Grafana/Prometheus) watch the
server:

- Point an HTTP check at `https://play.streetsempire.dev/api/ready`. It answers 200
  when the API, the database and the current round's ruleset are all fine, and 503
  when they are not.
- For numbers, set `METRICS_TOKEN` (24+ random characters, e.g. `openssl rand -hex 24`)
  and scrape `GET /api/metrics` with `Authorization: Bearer <token>`. Without the
  token the endpoint does not exist.

---

## Monitoring

**Admin → Monitoring** (`/game/admin/monitoring`) refreshes every 30 seconds and shows:

- **Needs attention:** the alerts, most serious first. The overall status is
  `ok`, `degraded` (warnings) or `critical`.
- **Database:** whether it answers, and how fast.
- **Traffic:** for the last 5 minutes and the last hour: requests, server errors
  and error rate, refusals, and latency p50/p95/p99.
- **Failures:** refused game actions by code, failed sign-ins by code, and errors by
  category (validation, auth, conflict, state_guard, contention, rate_limit,
  internal...).
- **Background jobs:** for each job, runs, failures, failures in a row, last
  success, and last error. The jobs are:
  - `Turf wars`: settles turf wars on their deadline.
  - `Alerts`: lands tails and runs, collects alerts, sends push, and prunes old
    alerts.
- **Notifications:** alerts waiting to be delivered, push alerts sent, and devices
  that failed.
- **Backups:** the last backup, the last off-server copy, and the last restore test.

Alerts fire on these lines (`MONITORING_LINES` in
`apps/server/src/services/monitoring.service.ts`):

| Alert | Fires when | Severity |
| --- | --- | --- |
| database-down / database-slow | The database does not answer, or takes more than 500 ms | critical / warning |
| error-rate | 5% or more of requests got a server error in 5 minutes, once there are at least 20 requests | critical |
| latency | p95 is above 1.5 s over 5 minutes | warning |
| auth-failures | 50 or more failed sign-ins in 5 minutes | warning |
| job-failing / job-stale | A background job fails 3 times in a row, or has not succeeded for 5 of its intervals | critical |
| notification-backlog / push-failures | Alerts wait more than 10 minutes, or pushes fail more often than they arrive | warning |
| backup-failed / backup-missing | The last backup failed, or none has succeeded in 26 hours (`BACKUP_MAX_AGE_HOURS`) | critical |
| offsite-failed / offsite-missing | The off-server copy failed or is not configured | warning |
| restore-test-failed / restore-test-stale | The last restore test failed, or none has passed in 8 days (`RESTORE_TEST_MAX_AGE_DAYS`) | critical / warning |
| maintenance | Maintenance mode is on | info |

Requests turned away by maintenance mode count as refusals, not server errors.

### Logs

Every log line from a request carries these fields, as they become known:

| Field | What it is |
| --- | --- |
| `requestId` | Also sent back to the client as the `x-request-id` header |
| `accountId` | The signed-in account |
| `roundPlayerId`, `roundId` | The player and round |
| `actionId`, `action` | The action being taken |
| `ruleset` | e.g. `classic-og-v0.8-h@0.8.0-H` |
| `errorCategory` | Set on failures |

Background work carries `job`. Cookies, authorization headers, passwords, tokens,
secrets, API keys and push keys are redacted before a line is written.

To follow one failing request from a player's report, get the request id from the
browser's network tab (the `x-request-id` response header), then:

```bash
journalctl -u streets-empire --since "2 hours ago" | grep '"requestId":"<id>"'
journalctl -u streets-empire --since today | grep '"errorCategory":"internal"'
journalctl -u streets-empire --since today | grep '"job":"Turf wars"' | grep -i error
```

---

## Backups

Each backup is a pair of files:

- **The dump:** `streets-<environment>-<UTC time>[-label].dump`, a `pg_dump`
  custom-format file with mode 0600.
- **Its manifest:** a `.json` file with the dump's SHA-256, the app version and commit,
  the newest applied migration, and the exact row count of every table.

The counts are taken inside the same database snapshot as the dump, so a restore can
be checked table by table.

A backup only counts once `pg_restore` can read it back and its checksum matches.
Every run writes the result to the status file that monitoring reads.

| Kind | When | Kept |
| --- | --- | --- |
| scheduled | daily timer | the newest of each day for 14 days, then the newest of each week for 8 weeks |
| `predeploy` | every `deploy.sh` / `deploy-beta.sh`, just before migrating | the newest 5 labelled backups |
| `prerestore` | before `ops:restore` overwrites the live database | (counted with the labelled ones) |

Change the retention with `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY` and
`BACKUP_KEEP_LABELLED`. The newest backup is never deleted.

```bash
npm run ops:backup                        # back up now
npm run ops:backup -- --label manual      # a labelled one (kept with the predeploy backups)
npm run ops:backup -- --list              # what is on this server
sudo systemctl start streets-empire-backup   # the timer's job, now, as the service user
journalctl -u streets-empire-backup -n 20
```

The dumps contain every account's email and password hash. Keep the backup
directory at 0711 or tighter, and the off-server bucket private.

### Restore test

```bash
npm run ops:restore-test                   # the newest backup
npm run ops:restore-test -- --file <dump>  # a specific one (e.g. downloaded from off-server)
npm run ops:restore-test -- --keep         # leave the scratch database behind to look at
```

The restore test does the following:

1. Checks the checksum.
2. Restores into a scratch database, in one transaction.
3. Compares every table's row count and the newest migration against the manifest.
4. Applies this checkout's migrations on top, which proves the current code's
   migrations still work on real data.
5. Drops the scratch database.

A failure is recorded and shows on `/admin/monitoring` as critical.

To test the off-server copy itself, fetch a dump and its `.json` from there
(e.g. `rclone copy b2:streets-backups/production/<name>.dump .` and the `.json`
next to it), then run the restore test with `--file`.

1.0.0-F was verified this way:

1. A backup of the development database was restored into a scratch database, and
   all 72 tables and 598 rows matched.
2. A second copy was restored into a fresh database, and the API was started against
   it. `/api/ready` answered, an existing admin session was still valid, and
   `/admin/monitoring` worked.
3. A dump damaged by one byte was refused by its checksum, and the failed test
   showed on the monitoring page.
4. An in-place restore with `--confirm` took a `prerestore` safety backup first.
   It brought back deleted rows and removed a table the backup did not have.

---

## Maintenance mode

This keeps players out while the database is migrated, restored or repaired.

```bash
bash scripts/ops/maintenance.sh on "Upgrading the database. Back by 21:00 UTC."
bash scripts/ops/maintenance.sh status
bash scripts/ops/maintenance.sh off
```

Turning it on sets `MAINTENANCE_MODE=true` (and the message) in `.env`, restarts the
API, and checks that it came back in maintenance mode.

While it is on:

- Every player request gets `503 MAINTENANCE` and the message. The game shows
  "Down for maintenance" with a "Check again" button.
- Admins keep full access, so you can check the game before reopening it.
- Sign-in, `/api/health`, `/api/ready`, `/api/meta`, the public status page, the
  site banner and the Discord bot's internal API keep working.

For planned work:

1. **Announce it.** Go to Admin → News & banner and post a maintenance banner with
   its start and end time. It shows in the game and on the public status page.
2. **Pause the season** (Admin → Rounds → Pause). Turns and timers stop, so nobody
   loses time while shut out. Resuming can extend the season by the paused time.
3. Turn on maintenance mode, and do the work.
4. Check the game as an admin, turn maintenance mode off, then resume the season.

If you only need to stop game actions but let players look around, pausing the
season alone does that. Paused rounds refuse actions and raids with a clear message.

---

## Failed deploy

`deploy.sh` stops at the first failure and says why. The order matters:

1. **It failed before "Backing up the database before migrating"** (local changes,
   pull, `npm ci`, build). Nothing changed: the old build is still running. Fix the
   cause and deploy again.
2. **The pre-deploy backup failed.** Nothing was migrated and the old build is
   still running. Read the error: a full disk, `pg_dump` missing or older than the
   server, or no permission on the backup directory. Fix it and deploy again. Only
   if you must ship right now and accept the risk:
   `SKIP_BACKUP=1 bash scripts/ops/deploy.sh`.
3. **`prisma migrate deploy` failed.**
   - Postgres runs each migration in a transaction, so a failed migration leaves the
     schema as it was before that migration.
   - The API has not been restarted and is still the old build on the old schema.
   - Read the error, then look at `npx prisma migrate status`.
   - If the migration is marked failed and the fix needs a corrected migration:
     1. Push the fix.
     2. Mark the failed one rolled back:
        `npx prisma migrate resolve --rolled-back <migration_name>`
     3. Deploy again.
   - Do not hand-edit an applied migration.
4. **The API did not become ready.**
   - The migrations are applied, but the new build does not start. The script
     prints the last log lines.
   - Usually the cause is a configuration error in the new build, such as a missing
     or invalid `.env` value.
   - If the cause is not obvious, roll back (below). The old code runs on the new
     schema as long as migrations are additive.
5. **The bot or the site checks failed.** The API is up. Fix the bot's config, or
   the Nginx upstream the message names, and deploy again or restart the one service.

---

## Rolling back

```bash
bash scripts/ops/rollback.sh            # back to the deploy before the current one
bash scripts/ops/rollback.sh <commit>   # back to a chosen commit
```

Every successful deploy appends its commit to `.deploy/history`. Rollback does
the following:

1. Picks the newest recorded deploy that is neither running now nor already rolled
   back.
2. Lists any migrations the bad build brought, since those stay applied.
3. Asks for confirmation (`YES=1` skips the question).
4. Moves the branch to that commit and redeploys it with `SKIP_PULL=1`, which takes
   a fresh pre-deploy backup first.

The next ordinary deploy fast-forwards to `origin` again. Push a fix or a
`git revert` before deploying next, or the bad build returns.

### Database migration rollback strategy

Migrations only move forward. There are no down-migrations, because a
down-migration that drops a column also drops the data written to it since.
Instead:

1. **Migrations are additive.**
   - Add tables, columns (nullable or with a default), enum values, indexes and
     `NOT VALID` constraints.
   - Removing or renaming something takes two releases:
     1. Stop using it in code.
     2. Drop it in a later release, once no build that uses it could be rolled
        back to.
   - This is what lets the previous build run on the new schema. It was checked for
     1.0.0-F: `prisma migrate deploy` from an older checkout against a newer
     database reports "No pending migrations" and the old code starts.
2. **Every deploy takes a `predeploy` backup just before migrating.** If a migration
   rewrote or dropped data, that backup is the exact state from moments before.
3. **A bad migration is fixed forward** with a new migration, unless data was lost.
   In that case, see the next section.

### The migration broke data

Use this only when a deploy's migration dropped or rewrote data that matters.
Restoring the `predeploy` backup loses everything players did since the deploy, so
first decide whether a forward fix (a corrective migration or an admin correction)
is enough.

1. `bash scripts/ops/maintenance.sh on "Restoring the game. Back shortly."`
2. `npm run ops:backup -- --list` to find the newest `...-predeploy.dump` from before
   the bad deploy.
3. Roll the code back to the build that backup was taken for:
   `bash scripts/ops/rollback.sh <commit>` (the manifest's `commit` field says which).
4. Restore: `npm run ops:restore -- --file /var/backups/streets-empire/production/<name>.dump --confirm streets_empire`
   (`--confirm` takes the live database's name). It first takes a `prerestore`
   backup of the damaged state, so nothing is unrecoverable. It then replaces the
   schema in one transaction and checks every table's count.
5. Check the game as an admin, then `bash scripts/ops/maintenance.sh off`.
6. Post news explaining what happened and what window of play was lost.

---

## Restoring from a backup

### The database is damaged or gone, on the same server

1. Turn on maintenance mode, or stop the API:
   `sudo systemctl stop streets-empire`.
2. If Postgres itself is broken, get it running first:
   `sudo systemctl status postgresql`, `journalctl -u postgresql`.
3. If the database no longer exists, create it empty with the same owner:
   `sudo -u postgres createdb -O streets streets_empire`.
4. Pick the backup: the newest scheduled one, unless it is older than the damage.
   Run `npm run ops:backup -- --list`.
5. Restore it:
   `npm run ops:restore -- --file <dump> --confirm streets_empire --migrate`.
   `--migrate` applies any migrations this checkout has that the backup predates.
6. Restart the API (`sudo systemctl start streets-empire`, or
   `maintenance.sh off`), and check `/api/ready` and `/admin/monitoring`.

### The whole server is gone

1. Build the new server the way the old one was built. Follow
   [DEPLOY.md](DEPLOY.md) up to a working checkout with `.env` (restore `.env` from
   your password manager), Postgres, and the empty database.
2. Fetch the newest backup and its manifest from off-server, e.g.
   `rclone copy b2:streets-backups/production/<name>.dump .` plus the `.json`.
3. `npm run ops:restore -- --file <name>.dump --target "postgresql://streets:...@127.0.0.1:5432/streets_empire?schema=public" --migrate`
4. Install the services, then `bash scripts/ops/deploy.sh`.
5. Install the backup timers again: `bash scripts/ops/install-backup-timer.sh`.

`.env` holds the secrets, and the database backups do not include it: the session
secret, VAPID keys, Discord and forum secrets. **Keep a copy of each environment's
`.env` in a password manager.** Without the same `SESSION_SECRET`, everyone is
signed out; that is harmless. Without the same VAPID key pair, phone alerts stop
until players re-enable them.

### Restoring into beta or a local machine

To look at production data safely, restore into a database that is not live. For
example, a local one:

```bash
npm run ops:restore -- --file prod.dump --target "postgresql://streets:streets@127.0.0.1:5432/streets_copy?schema=public"
```

The tool refuses to overwrite the live database of the checkout it runs in unless
`--confirm <name>` is given. It also refuses to restore another environment's backup
over a live database without `--allow-other-environment`.

A production copy contains real emails and password hashes: do not leave one on a
laptop.
