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

## Every update

After pushing to `main`:

```bash
cd /opt/streets-empire/StreetsEmpirev2 && bash scripts/ops/deploy.sh
```

It stops at the first failure and prints why. In order, it:

1. Refuses to run if tracked files have local changes.
2. Fast-forwards to `origin/main`.
3. Runs `npm ci`, `prisma generate` and `npm run build`. That builds the API, web app and bot.
4. Applies database migrations with `prisma migrate deploy`.
5. Restarts the API and waits up to 60 seconds for `/api/ready`.
6. Restarts the bot and checks that it stays running. It skips this if the bot service isn't installed.

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

Find the last good commit with `git log --oneline`. Check it out, then redeploy
that checkout without pulling:

```bash
git checkout <good-commit> && SKIP_PULL=1 bash scripts/ops/deploy.sh
```

Migrations only move forward. If the bad version added a migration, the older
code runs against the newer schema. Additive changes like new tables or columns
are fine, but check before rolling back past a migration that removed anything.

To return to normal updates afterwards:

```bash
git checkout main && bash scripts/ops/deploy.sh
```

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
