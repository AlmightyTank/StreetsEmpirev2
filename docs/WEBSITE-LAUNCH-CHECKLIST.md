# StreetsEmpire public website launch checklist

This checklist moves the existing live game from `streetsempire.dev` to
`play.streetsempire.dev` and launches the public site at the root domain without
needing to stop the Fastify API.

## 1. Before cutover

- [ ] `website-platform` is fully caught up with `main`.
- [ ] GitHub Public Platform workflow passes typecheck, tests and all builds.
- [ ] Production database backup completed.
- [ ] `play.streetsempire.dev` DNS resolves to the VPS.
- [ ] `https://play.streetsempire.dev` loads the current game.
- [ ] SSL certificate for `play.streetsempire.dev` is valid.
- [ ] Login/logout works on `play.streetsempire.dev`.
- [ ] Discord OAuth has `https://play.streetsempire.dev/api/auth/discord/callback` registered.
- [ ] Password-reset/verification links return to the play hostname.
- [ ] Web Push/service worker still works from the play hostname when enabled.
- [ ] Forum remains healthy at `https://forum.streetsempire.dev`.

## 2. Production environment

Set:

```env
FRONTEND_ORIGIN="https://play.streetsempire.dev"
CORS_ORIGINS="https://play.streetsempire.dev,https://streetsempire.dev"
DISCORD_REDIRECT_URI="https://play.streetsempire.dev/api/auth/discord/callback"
FORUM_ORIGIN="https://forum.streetsempire.dev"
```

Do not set a shared cookie domain such as `.streetsempire.dev`.

Restart the API after changing `.env`:

```bash
sudo systemctl restart streets-empire
curl -fsS http://127.0.0.1:3001/api/ready
```

## 3. Merge and deploy

Merge `website-platform` into `main`, then on the VPS:

```bash
cd /opt/streets-empire/StreetsEmpirev2

PUBLIC_SITE_URL=https://streetsempire.dev \
LIVE_SITE_URL=https://play.streetsempire.dev \
bash scripts/ops/deploy.sh
```

The deploy must produce:

```text
apps/server/dist/index.js
apps/web/dist/index.html
apps/site/dist/index.html
```

## 4. Nginx cutover

Use `docs/nginx/streets-empire-platform.conf.example` as the reference.

The critical routing boundary is:

```text
streetsempire.dev
  /api/public/* -> Fastify :3001
  /api/*        -> 404
  /*            -> apps/site/dist

play.streetsempire.dev
  /api/*        -> Fastify :3001
  /*            -> apps/web/dist
```

Before reload:

```bash
sudo nginx -t
```

Then:

```bash
sudo systemctl reload nginx
```

Do not restart PostgreSQL or the game API just to switch the static root.

## 5. Immediate verification

```bash
bash scripts/ops/check-public-platform.sh
```

Also manually verify:

- [ ] `streetsempire.dev` shows the public homepage.
- [ ] `streetsempire.dev/games` survives a direct browser refresh.
- [ ] `streetsempire.dev/rankings` loads guest data.
- [ ] `streetsempire.dev/players/<current id>` contains no private crew/inventory data.
- [ ] `streetsempire.dev/api/auth/me` is 404.
- [ ] `play.streetsempire.dev` still loads the game.
- [ ] Authenticated game API calls work from the play hostname.
- [ ] Discord login returns to the play hostname.
- [ ] Forum links work.
- [ ] `robots.txt` and `sitemap.xml` load.
- [ ] Nginx error log stays clean.

## 6. Old root-game URLs

After the public site has been stable, add explicit redirects for old game-only links
that users may have bookmarked. Do this route-by-route rather than redirecting every
unknown public path to the play hostname, because the public website now owns many of
the same human-readable paths.

Candidate legacy redirects include old login/register/account URLs and known
`/game/*` routes.

## 7. Rollback

If the public root has a problem but the game at `play.streetsempire.dev` is healthy,
rollback only the root Nginx static directory to `apps/web/dist` or the prior known
configuration. The API/database do not need to be rolled back just because the public
site has a frontend issue.

If application code must be rolled back:

```bash
git checkout <known-good-commit>
SKIP_PULL=1 bash scripts/ops/deploy.sh
```

Remember that Prisma migrations only move forward; review migrations before rolling
application code behind a destructive schema change.
