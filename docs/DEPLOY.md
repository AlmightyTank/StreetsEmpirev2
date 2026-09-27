# Deploying to the VPS

The game API and the Discord bot run as systemd services, so both start on boot
and restart if they crash. One script deploys a new version.

Paths below assume the checkout at `/opt/streets-empire/StreetsEmpirev2`. The
scripts work from wherever the repo is checked out.

## One-time setup

### 1. Find the API's service name

```bash
systemctl list-units --type=service | grep -i -E 'street|empire|node'
```

The scripts assume `streets-empire`. If yours is different, put
`API_SERVICE=<name>` in front of each script command below, for example
`API_SERVICE=streets-api bash scripts/ops/deploy.sh`.

Make sure the API starts on boot:

```bash
sudo systemctl enable streets-empire
```

### 2. Configure and build the bot

Fill in the bot settings in `.env` (see
[apps/discord-bot/README.md](../apps/discord-bot/README.md)), then build:

```bash
npm ci && npm run build
```

### 3. Install the bot service

```bash
bash scripts/ops/install-bot-service.sh
```

This writes `/etc/systemd/system/streets-empire-bot.service`, then enables and
starts it.
- It copies the user and Node binary from the API's unit.
- It restarts the bot 5 seconds after any crash.
- It starts after the API on boot.

If Node can't be detected, rerun with `NODE_BIN=$(which node)` in front.

### 4. Optional: deploy without typing a sudo password

The deploy script uses `sudo` only for `systemctl restart` and `journalctl`. To
allow just those for your deploy user, run `sudo visudo -f /etc/sudoers.d/streets-empire`
and add this, with your user name and unit names:

```text
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart streets-empire, /usr/bin/systemctl restart streets-empire-bot, /usr/bin/journalctl -u streets-empire *, /usr/bin/journalctl -u streets-empire-bot *
```

### 5. Optional: phone and browser alerts

Players can get alerts on their phone lock screen through Web Push. It needs a
key pair on the server and nothing else: no app store, no third-party account.

1. Generate the keys once, on any machine:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Put them in `.env` with a contact address, then restart the API:

   ```text
   VAPID_PUBLIC_KEY="<public key>"
   VAPID_PRIVATE_KEY="<private key>"
   VAPID_SUBJECT="mailto:you@example.com"
   ```

   Keep the private key secret, and never replace the pair once players have
   subscribed: every registered device would silently stop getting alerts.

3. Check how the web server serves the built site (`apps/web/dist`). Alerts need:
   - HTTPS. Push only works on a secure origin.
   - `/sw.js` served from the site root with `Cache-Control: no-cache`, so a new
     service worker reaches players on their next visit.
   - `/manifest.webmanifest` served as `application/manifest+json`. iPhones only
     offer push to a site added to the Home Screen, which needs the manifest.

The API sends alerts itself about once a minute. The Discord bot is not needed
for push.

Since 0.9.0-G that once-a-minute alerts pass runs on every server, with or
without push keys or a bot. It brings runs home on time and writes the clock
events (spotted pushes and tails, backup calls, revenge reminders, special
orders) into each player's in-game bell. With no keys it only fills the bell.

### 1.0.0-A: environment identity

Each server knows whether it is production or beta, and shows it.

- **`/api/meta`** (public, uncached) reports the environment, the app version
  and commit, the ruleset and the current season. `/api/health`, `/api/ready`
  and the public site's status page include the same identity. Beta and
  development pages show a ribbon and a `[BETA]`/`[DEV]` tab title; production
  shows only the version, plus a full build line in the footer.
- **`APP_ENV`** is optional. Without it, a `NODE_ENV=production` server is beta
  only when it is invite-only *and* uses its own session cookie (the documented
  beta setup). Anything else is production, so existing servers need no change.
- **Refusing to start.** A production server refuses a beta session cookie name,
  and a beta server refuses the production cookie or open registration.
- **The database claim.** The first production or beta boot records its
  environment in the `DeploymentIdentity` table. After that, a server of the
  other environment refuses to start against that database. Development servers
  never claim, and also refuse a claimed database unless
  `ALLOW_DATABASE_ENVIRONMENT=<that environment>` is set, for deliberate work on
  a restored copy.
- **Deploy checks.** `deploy.sh` and `deploy-beta.sh` run
  `scripts/ops/check-environment.mjs`. It checks that the `.env` matches the
  script before building, and after the restart that the API reports the right
  environment and this checkout's commit, locally and through the public hostname.
  This also catches a proxy that points `play.` at the beta API.

If a database was claimed by the wrong environment (say someone booted beta
against the production database), stop that server, fix its `DATABASE_URL`, and
correct the claim by hand:

```sql
UPDATE "DeploymentIdentity" SET "environment" = 'production' WHERE "id" = 'singleton';
```

## Every update

After pushing to `main`:

```bash
cd /opt/streets-empire/StreetsEmpirev2 && bash scripts/ops/deploy.sh
```

It stops at the first failure and prints why. In order, it:

1. Refuses to run if tracked files have local changes.
2. Fast-forwards to `origin/main`.
3. Runs `npm ci`, `prisma generate` and `npm run build`. That builds the API, web app and bot.
4. Takes a `predeploy` database backup (1.0.0-F). If the backup fails, the deploy stops before migrating.
5. Applies database migrations with `prisma migrate deploy`.
6. Restarts the API and waits up to 60 seconds for `/api/ready`.
7. Restarts the bot and checks that it stays running. It skips this if the bot service isn't installed.
8. Records the commit in `.deploy/history`, which `scripts/ops/rollback.sh` uses.

Backups, restore tests, rollback, failed deploys and maintenance mode are covered in
[RECOVERY.md](RECOVERY.md). Run `bash scripts/ops/install-backup-timer.sh` once per
server.

On failure, it prints the last 40 log lines of whichever service didn't come back.

The Flarum extension deploys separately; see
[integrations/flarum/street-empire-link/README.md](../integrations/flarum/street-empire-link/README.md).

## Logs and status

```bash
systemctl status streets-empire streets-empire-bot
```

```bash
journalctl -u streets-empire-bot -f
```

```bash
journalctl -u streets-empire --since "1 hour ago"
```

## Rolling back

```bash
bash scripts/ops/rollback.sh
```

This goes back to the previous good deploy. See
[RECOVERY.md → Rolling back](RECOVERY.md#rolling-back) for the migration strategy
and for what to do when a migration broke data.

## After a reboot

Both services should be `active (running)`:

```bash
systemctl is-enabled streets-empire streets-empire-bot && systemctl is-active streets-empire streets-empire-bot
```


## Public platform split

The production platform uses one Fastify API service and two static frontend builds:

```text
streetsempire.dev
  -> apps/site/dist
  -> /api/public/* only -> 127.0.0.1:3001

play.streetsempire.dev
  -> apps/web/dist
  -> /api/* -> 127.0.0.1:3001

forum.streetsempire.dev
  -> Flarum / PHP-FPM
```

The public website does **not** need a systemd service. Nginx serves its Vite build directly.
The existing `streets-empire` service continues to run `apps/server/dist/index.js` and
serves both authenticated game APIs and the read-only public API.

A final Nginx reference is checked in at
`docs/nginx/streets-empire-platform.conf.example`. The public host intentionally
returns 404 for non-public `/api/*` paths; only `/api/public/*` is proxied there.

### Production environment after the game-domain cutover

```env
FRONTEND_ORIGIN="https://play.streetsempire.dev"
CORS_ORIGINS="https://play.streetsempire.dev,https://streetsempire.dev"
DISCORD_REDIRECT_URI="https://play.streetsempire.dev/api/auth/discord/callback"
FORUM_ORIGIN="https://forum.streetsempire.dev"
```

Keep session cookies host-only. Do not set their domain to `.streetsempire.dev`.

### Frontend build checks

The deploy script now refuses to continue unless these exist after `npm run build`:

```text
apps/server/dist/index.js
apps/web/dist/index.html
apps/site/dist/index.html
```

After cutover, the deploy can also verify the public and live hostnames:

```bash
PUBLIC_SITE_URL=https://streetsempire.dev \
LIVE_SITE_URL=https://play.streetsempire.dev \
bash scripts/ops/deploy.sh
```

Those variables are optional so the deploy process can still be used before DNS/Nginx
cutover or during a local rollback.
