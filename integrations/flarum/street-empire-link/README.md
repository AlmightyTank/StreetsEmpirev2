# Street Empire Profile Link (Flarum extension)

Verified, opt-in links between a permanent Street Empire game account and a
Flarum account. Players keep their existing accounts and usernames; this is not
shared login.

Once linked:

- The game's public profile shows a **Forum Profile** button, in every round.
- The forum user card (profile page and avatar hover) shows a **Game Profile**
  button, which opens that player's profile in the current round.
- Players manage the connection under **Game → Account → Forum account**.

## How linking works

1. The game signs a short-lived request (10 minutes) bound to the player's game
   account *and* login session, and sends them to `/street-empire/link` on the forum.
2. The player signs into Flarum and confirms the pair of usernames shown.
3. Flarum signs a response and sends the player back to `/account/forum-link`,
   where they click **Finish linking**.

Both sides sign with one shared HMAC secret. It never reaches a browser.
Tokens travel in URL fragments, so they stay out of access logs and referrers.

## Requirements

- Flarum `^1.8` on PHP 8.1+, with SSH and Composer access (the self-hosted VPS
  install at `forum.streetsempire.dev`).
- A game build that includes the `20260913010000_forum_profile_links` migration.
- The forum server must reach the game's public HTTPS origin. If both run on the
  same VPS, check that the game hostname resolves and is reachable from there.

No JavaScript build step is needed; `js/forum.js` is plain JavaScript.

## 1. Generate the shared secret

Use a new random value of at least 64 characters, used for nothing else:

```bash
openssl rand -hex 48
```

Store it like a password. It goes in exactly two places below.

## 2. Configure and deploy the game (do this first)

The forum looks up profile links from the game, so the game endpoints must exist
before the extension is enabled.

In the game server's environment (see `.env.example`):

```dotenv
FORUM_ORIGIN="https://forum.streetsempire.dev"
FORUM_LINK_SECRET="<secret from step 1>"
```

- `FORUM_ORIGIN` must match Flarum's `url` in `config.php` exactly: scheme and
  host, no path, no trailing slash. HTTP is only accepted for localhost in development.
- `FRONTEND_ORIGIN` (or the first `CORS_ORIGINS` entry) is the game origin. It
  must match `street_empire.game_origin` in step 3 exactly.
- Leaving `FORUM_LINK_SECRET` empty turns linking off: account settings say
  "coming soon" and no Forum Profile buttons appear.

Apply the migration and restart the API:

```bash
npx prisma migrate deploy
```

In local development, stop the dev server before running `npx prisma migrate dev`,
because the running API locks Prisma's engine file.

## 3. Configure Flarum

Edit Flarum's `config.php` (next to `flarum` in the install root) and add a
`street_empire` block beside `url`:

```php
'url' => 'https://forum.streetsempire.dev',
'street_empire' => [
    'game_origin' => 'https://streetsempire.dev', // the game's FRONTEND_ORIGIN
    'link_secret' => '<secret from step 1>',
],
```

If the secret is shorter than 64 characters, or either origin is invalid, the
extension stays installed but disabled. The link page then says
"Forum linking is not available yet."

## 4. Install the extension

Copy this directory to the forum server, for example into
`packages/street-empire-link` inside the Flarum root:

```bash
rsync -a integrations/flarum/street-empire-link/ user@forum-host:/var/www/flarum/packages/street-empire-link/
```

Then, from the Flarum root on the server:

```bash
composer config repositories.street-empire path packages/street-empire-link
```

```bash
composer require street-empire/flarum-profile-link:^0.1
```

```bash
php flarum cache:clear
```

Finally, open **Administration → Extensions → Street Empire Profile Link** and
enable it.

The Composer path repository symlinks the package, so later updates only need
the rsync plus `php flarum cache:clear`. Clearing the cache also recompiles the
forum JavaScript and CSS.

## 5. Verify

1. Sign into the game and open **Account**. The Forum account panel shows
   **Link Forum Account**, not "coming soon".
2. Click it. You land on the forum's link page with your game username shown.
   Sign in if asked, then click **Confirm these accounts**.
3. Back on the game, click **Finish linking**. The panel shows your forum username.
4. Open your game profile and click **Forum Profile**. It should go through
   `/street-empire/u/<id>` and land on your forum profile.
5. On the forum, open your user card. **Game Profile** appears within about two
   minutes and opens your game profile.
6. Unlink from game account settings. Both buttons disappear; the forum one can
   take up to two minutes.

From the forum server, this checks the game lookup directly. Use your forum user
ID; the numbers in the path are that ID, not usernames:

```bash
curl -s https://streetsempire.dev/api/forum/users/1
```

It returns `{"profileUrl":"https://streetsempire.dev/game/forum/1"}` when linked,
or `{"profileUrl":null}` when not linked.

## Behaviour notes

- **Profile URLs:** the game links to `/street-empire/u/<forum user id>`. That
  route redirects to the user's current `/u/<slug>`, so links survive username
  changes and work with any slug driver. Users hidden from the viewer 404, as
  they would on `/u/<slug>`.
- **Caching:** the forum caches each user's Game Profile lookup for 120 seconds,
  including "not linked", in Flarum's cache. The browser also caches it per page
  load. Game outages and rate-limit responses are not cached; the button is just
  hidden until the next lookup. This keeps the forum server's IP well inside the
  game's 300 reads per minute limit.
- **Round scope:** the Game Profile button needs a signed-in game player who has
  joined the current round. Linked players who haven't joined yet show
  "This player has not entered the current round yet."
- **Stored username:** the game saves the forum username at link time for display
  in account settings. It does not update on rename, but the profile URL does.
- **Deleted forum users:** the game keeps the link, and its Forum Profile button
  goes to a 404 until the player unlinks.

## Rotating the secret

Generate a new secret, then update `FORUM_LINK_SECRET` on the game and
`street_empire.link_secret` on the forum, and restart the game API. Only link
attempts in progress at that moment fail; players retry from account settings.
Existing links are unaffected.

## Uninstall

1. Disable the extension in Flarum administration.
2. From the Flarum root, run `composer remove street-empire/flarum-profile-link`,
   then `php flarum cache:clear`.
3. Set `FORUM_LINK_SECRET=""` on the game and restart. Forum Profile buttons
   disappear. Existing links stay in the `ForumLink` table and come back if
   linking is re-enabled with the same `FORUM_ORIGIN`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Game says "Forum account linking is coming soon." | `FORUM_LINK_SECRET` is empty or the API wasn't restarted. |
| Forum says "Forum linking is not available yet." | `config.php` secret is under 64 characters, or `game_origin`/`url` has a path, trailing slash or non-HTTPS scheme. |
| "This linking request expired or is invalid" | Secrets differ, origins don't match exactly, more than 10 minutes passed, or the player started a newer request. |
| Finish linking returns "no longer valid" | The game session changed (signed out or signed in elsewhere) after starting. Start again. |
| "That game or forum account is already linked" | Each account links to one account on the other side. Unlink the existing one first. |
| Game Profile never appears on the forum | Run the `curl` check from the forum server; check firewall, DNS and TLS from the forum to the game. |
| Forum Profile goes to a 404 | The extension is disabled, or the forum user was deleted or is hidden from you. |
