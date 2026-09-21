# Beta environment

The beta game is a separate deployment from production. It has its own checkout,
database, API process, port, session cookie and hostname.

```text
Production
  /opt/streets-empire/StreetsEmpirev2
  play.streetsempire.dev
  streets-empire.service
  127.0.0.1:3001
  production database

Beta
  /opt/streets-empire/StreetsEmpirev2-beta
  beta.streetsempire.dev
  streets-empire-beta.service
  127.0.0.1:3003
  streets_empire_beta database
```

Never point beta at the production `DATABASE_URL`.

## 1. Create the beta checkout

The repository has a permanent `beta` branch. On the VPS, from the production
checkout:

```bash
cd /opt/streets-empire/StreetsEmpirev2
git fetch origin beta
git branch beta origin/beta 2>/dev/null || true
git worktree add /opt/streets-empire/StreetsEmpirev2-beta beta
```

The worktree shares Git objects with production but has completely separate files,
build output and `.env`.

## 2. Create the beta environment file

Start from production so provider/client IDs do not have to be typed again:

```bash
cp /opt/streets-empire/StreetsEmpirev2/.env \
   /opt/streets-empire/StreetsEmpirev2-beta/.env

chmod 600 /opt/streets-empire/StreetsEmpirev2-beta/.env
nano /opt/streets-empire/StreetsEmpirev2-beta/.env
```

Generate a different session secret:

```bash
openssl rand -hex 32
```

At minimum, beta must differ from production like this:

```env
DATABASE_URL="postgresql://<same-user>:<same-password>@<same-host>:<same-port>/streets_empire_beta?schema=public"

PORT=3003
HOST=127.0.0.1
NODE_ENV=production

SESSION_SECRET="<different-random-secret>"
SESSION_COOKIE_NAME="se_beta_session"

CORS_ORIGINS="https://beta.streetsempire.dev"
FRONTEND_ORIGIN="https://beta.streetsempire.dev"

DISCORD_REDIRECT_URI="https://beta.streetsempire.dev/api/auth/discord/callback"
```

The same Discord OAuth client ID/secret can be reused if the beta redirect URI is
also registered in the Discord developer portal.

### Disable production side effects in beta

Until a separate beta integration is intentionally configured, blank these in the beta
`.env` so testing cannot post into production community channels or send production
alerts:

```env
FORUM_LINK_SECRET=""
FORUM_API_KEY=""
FORUM_NEWS_TAG_ID=""
FORUM_RECRUITMENT_TAG_ID=""

DISCORD_BOT_API_TOKEN=""
DISCORD_BOT_PUSH_URL=""
DISCORD_BOT_TOKEN=""
DISCORD_GUILD_ID=""

RESEND_API_KEY=""
EMAIL_FROM=""

VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT=""
```

`FORUM_ORIGIN="https://forum.streetsempire.dev"` can remain because it is only the
public forum address while the secrets/API key above are disabled.

## 3. Create the beta PostgreSQL database

Use the same PostgreSQL server as production, but create a completely different
database named `streets_empire_beta`.

First check how PostgreSQL runs on the VPS:

```bash
systemctl is-active postgresql || true
docker ps --format 'table {{.Names}}\t{{.Image}}' | grep -i postgres || true
```

For host-installed PostgreSQL, a typical command is:

```bash
sudo -u postgres psql -c 'CREATE DATABASE streets_empire_beta OWNER streets;'
```

For Docker PostgreSQL, enter the existing Postgres container and create the same
database with its configured database admin user, for example:

```bash
docker exec -it <postgres-container> \
  psql -U <postgres-admin-user> -d postgres \
  -c 'CREATE DATABASE streets_empire_beta OWNER streets;'
```

If the production database owner is not `streets`, use the production owner instead.

## 4. Build and initialize beta once

```bash
cd /opt/streets-empire/StreetsEmpirev2-beta

npm ci
npx prisma generate
npm run build
npx prisma migrate deploy
npm run db:seed
```

The seed is for the initial/fresh beta database only. Normal beta deployments do not
reseed the current game.

Verify the beta build exists:

```bash
test -f apps/server/dist/index.js
test -f apps/web/dist/index.html
```

## 5. Install the beta API service

```bash
cd /opt/streets-empire/StreetsEmpirev2-beta
bash scripts/ops/install-beta-service.sh
```

This creates and enables:

```text
streets-empire-beta.service
```

Check it directly before touching Nginx:

```bash
systemctl status streets-empire-beta --no-pager
curl -fsS http://127.0.0.1:3003/api/ready
```

Production remains on port 3001.

## 6. Add DNS

Create an A record for:

```text
beta.streetsempire.dev -> same VPS IP as play.streetsempire.dev
```

Cloudflare proxying can be enabled the same way as the live hostname.

## 7. Add Nginx

Use the beta server block in:

```text
docs/nginx/streets-empire-platform.conf.example
```

The important mapping is:

```text
beta.streetsempire.dev
  /*      -> /opt/streets-empire/StreetsEmpirev2-beta/apps/web/dist
  /api/* -> http://127.0.0.1:3003
```

The reference config also sends:

```text
X-Robots-Tag: noindex, nofollow, noarchive
```

so search engines do not index beta.

Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Add HTTPS

Once DNS resolves:

```bash
sudo certbot --nginx -d beta.streetsempire.dev
```

Then verify:

```bash
curl -I https://beta.streetsempire.dev/
curl -fsS https://beta.streetsempire.dev/api/ready
```

The game UI automatically shows a permanent:

```text
BETA ENVIRONMENT
Test server · data may be reset at any time · progress does not transfer to live.
```

banner only on `beta.streetsempire.dev`.

## 9. Discord OAuth, if beta login should support Discord

In the existing Discord application, add this redirect URI without removing the live
one:

```text
https://beta.streetsempire.dev/api/auth/discord/callback
```

Keep both:

```text
https://play.streetsempire.dev/api/auth/discord/callback
https://beta.streetsempire.dev/api/auth/discord/callback
```

## 10. Normal beta deployment

After changes are merged/pushed to `beta`:

```bash
cd /opt/streets-empire/StreetsEmpirev2-beta
bash scripts/ops/deploy-beta.sh
```

The beta deploy script:

1. Fast-forwards only the `beta` branch.
2. Installs dependencies.
3. Generates Prisma.
4. Builds.
5. Applies migrations to the beta database.
6. Restarts only `streets-empire-beta`.
7. Checks port 3003 and `https://beta.streetsempire.dev`.

It never restarts `streets-empire` or the production Discord bot.

## 11. Recommended branch flow

```text
feature/*
    |
    v
  beta  --------> beta.streetsempire.dev
    |
    | tested/approved
    v
  main  --------> play.streetsempire.dev
```

Features can be merged into `beta` for real-server testing. After they are accepted,
merge the tested beta changes into `main` and use the normal production deploy.

## Beta reset rule

Beta data is disposable, but production data is not. Before any database reset:

- stop `streets-empire-beta`;
- verify the database name is exactly `streets_empire_beta`;
- never run a reset while the URL contains the production database name;
- recreate/migrate/seed only the beta database;
- start `streets-empire-beta` again.

The beta hostname, cookie name, service, port, checkout and database are all different
specifically so a beta reset cannot become a production reset by accident.
