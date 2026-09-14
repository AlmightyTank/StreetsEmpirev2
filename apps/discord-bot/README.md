# Street Empire Discord bot

Keeps Street Empire roles in sync on your Discord server and answers a few slash
commands. It runs as its own process next to the game API and reads game data
through the API; it has no database access.

## What it does

**Roles.** Each member's roles follow their game account. A Discord account
counts as linked once the player has signed in with Discord or linked it under
**Game → Account**.

| Role | Who gets it |
| --- | --- |
| Linked | Any member whose Discord is linked to an active game account |
| Player | Linked members who have joined the current round |
| National #1 | Current national #1, while the round is active |
| Top 10 | Current national top 10, while the round is active |
| Veteran | Finished at least one past round |
| Top Finisher | Finished a past round in the national top ten |
| Past Winner | Won a past round |
| Hall of Fame | Won three past rounds |
| Forum Admin, Forum Mod, … | Linked forum account is in that visible forum group (see `DISCORD_FORUM_GROUPS`) |

- The bot owns only the roles in this table. It finds them by exact name, or
  creates them the first time, and never adds or removes any other role.
- A full sync runs on startup and every `DISCORD_SYNC_MINUTES` (default 10).
  Members who join the server are synced straight away.
- Linking or unlinking in the game shows up at the next sync.
- Members who aren't linked lose every bot-owned role.

**Commands.** No reply ever pings anyone. Private replies are visible only to
the person who ran the command.

| Command | Reply | Shows |
| --- | --- | --- |
| `/profile` | Public | Your own profile. `user:` shows a linked member's; `name:` looks up an in-game name. Net worth, ranks, badges, legacy and links. Never crew, weapons or cash. |
| `/badges` | Public | Every achievement: earned badges by rarity (◆ = permanent), and the eight locked ones closest to unlocking, with progress. Same `user:` / `name:` options as `/profile`. |
| `/compare` | Public | Two players side by side. `player:` and `with:` take a name or an @mention; `with:` defaults to you. |
| `/rankings` | Public | Current round national top 10 with links |
| `/city` | Public | Top 10 in one city this round; city names autocomplete |
| `/halloffame` | Public | Final top 3 of the five most recently finished rounds |
| `/round` | Public | Round status, time left, players, turn rate |
| `/news` | Public | Latest five news posts |
| `/invite` | Public | How to register, join the current round and get roles, with the round's status |
| `/link` | Private | Your game account, current-round player, forum link, and the roles you qualify for, or how to link |
| `/remind` | Private | `turns:On` DMs you once each time your turns fill to the cap; `turns:Off` stops. See below. |
| `/sync` | Private | Updates your roles now instead of at the next scheduled sync; once a minute per member |
| `/help` | Private | Every command |
| `/syncall` | Private | Mods: a full role sync for the whole server. Hidden from members without **Manage Roles**, and checked again when run. |

**News auto-post.** When `DISCORD_NEWS_CHANNEL_ID` is set, the bot checks for
newly published game news every `DISCORD_NEWS_MINUTES` (default 1) and posts
each item to that channel once.
- In an Announcement channel, it also publishes the post to following servers.
- News that already existed when auto-posting was added is never posted.
- The bot needs **View Channel**, **Send Messages** and **Embed Links** in that
  channel. It checks them at startup and logs what's missing instead of posting.
- Each post is marked as sent before it goes out. If Discord rejects a send, for
  example because permissions changed, that post is skipped and logged, not
  retried.

**Turn reminders.** Members opt in with `/remind turns:On`.
- Every `DISCORD_REMINDER_MINUTES` (default 5), the bot DMs anyone whose turns
  have filled to the cap since their last reminder.
- They get one DM per fill-up. Spending turns sets up the next one.
- Reminders only run during an active round, for members who have joined it.
- A member who blocks DMs from server members won't get them; the bot logs that
  and moves on.

## 1. Create the bot in Discord

You can reuse the application you already use for Discord login
(`DISCORD_CLIENT_ID`), or create a new one at
<https://discord.com/developers/applications>.

1. **Bot** tab: click **Reset Token** and copy it. This is `DISCORD_BOT_TOKEN`.
   Treat it like a password.
2. On the same tab, under **Privileged Gateway Intents**, turn on **Server
   Members Intent** and save. Role sync can't list members without it.
3. Invite the bot with this URL, using your application ID. The permission
   requested is **Manage Roles** only:

   ```text
   https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=bot%20applications.commands&permissions=268435456
   ```

4. In **Server Settings → Roles**, drag the bot's role above the roles it
   manages. Discord doesn't let a bot assign roles that sit above its own.
   The bot logs a warning naming any role it can't manage.
5. Copy your server ID: turn on Developer Mode under User Settings → Advanced,
   then right-click the server → **Copy Server ID**. This is `DISCORD_GUILD_ID`.

If roles named "Player" or "Linked" already exist, the bot adopts them instead
of creating new ones. Rename those first if they mean something else.

## 2. Configure

Generate the shared API token once:

```bash
openssl rand -hex 48
```

The bot and the game server both read the repo's root `.env`:

```dotenv
# Game server and bot: the same 64+ character secret. The game's internal bot
# API stays off (404) while this is empty.
DISCORD_BOT_API_TOKEN="<secret>"

# Bot only
DISCORD_BOT_TOKEN="<bot token>"
DISCORD_CLIENT_ID="<application id>"
DISCORD_GUILD_ID="<server id>"
GAME_API_URL="http://127.0.0.1:3001"
FRONTEND_ORIGIN="https://streetsempire.dev"
DISCORD_SYNC_MINUTES=10
DISCORD_FORUM_GROUPS="Admin,Mod"
DISCORD_NEWS_CHANNEL_ID="<channel id, or empty for no auto-posting>"
DISCORD_NEWS_MINUTES=1
DISCORD_REMINDER_MINUTES=5
```

- `GAME_API_URL` is where the bot reaches the API, as an origin with no path.
  On the VPS, use the API's local address so traffic never leaves the machine.
- `FRONTEND_ORIGIN` is only used for links in replies.
- `DISCORD_FORUM_GROUPS` lists which forum groups get a "Forum <group>" role.
  Names match the forum's group names, ignoring case. Leave it empty for none.
  Forum roles need forum linking (`FORUM_LINK_SECRET`) turned on.
- `DISCORD_NEWS_CHANNEL_ID` is the channel for automatic news posts. Copy it by
  right-clicking the channel → **Copy Channel ID**, with Developer Mode on.

Restart the game API after setting `DISCORD_BOT_API_TOKEN`.

## 3. Run

Local development, with the game API already running:

```bash
npm run dev:bot
```

Production runs the bot as a systemd service next to the API, so it starts on
boot and restarts after a crash. Install it once with
`scripts/ops/install-bot-service.sh`; see [docs/DEPLOY.md](../../docs/DEPLOY.md).

On startup it logs `Street Empire bot ready as …`. The slash commands appear in
your server immediately.

The bot keeps one connection to Discord and claims news and reminders, so run
exactly one copy of it.

## Updating

Run `bash scripts/ops/deploy.sh` on the VPS. It pulls, rebuilds, migrates, and
restarts the API and then the bot. Commands re-register on every start, so
renamed or new commands need no extra step.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Exits with `Invalid Discord bot configuration` | The listed variables are missing or malformed in `.env`. |
| Commands say "The application did not respond" | Check the bot log. A startup warning about an **Interactions Endpoint URL** means Discord sends commands there instead of the bot: clear it under General Information in the developer portal. No log line at all means the bot process isn't running or is logged in with a different token. `Could not acknowledge` or `Discord rate limit` lines show how late commands arrived. |
| `Used disallowed intents` | Turn on **Server Members Intent** (step 1.2). |
| Warns `Cannot manage role "…"` | Drag the bot's role above that role (step 1.4). |
| Commands reply "Street Empire is not answering" | The API is down or unreachable at `GAME_API_URL`, or the two `DISCORD_BOT_API_TOKEN` values differ. The bot logs the error. |
| No news posts | Startup log says `News auto-post is off` and why: a wrong channel ID or missing channel permissions. News that existed before auto-posting is never posted. |
| No reminder DMs | The round must be active and the member joined. They need DMs from server members allowed; failed DMs are logged as `Could not DM a turn reminder`. One DM per fill-up: spend turns to get the next. |
| `/profile` says your Discord isn't linked | Sign in with Discord or link it under Game → Account, then wait for the next sync. |
| No Forum roles | Forum linking must be on, the member's forum account linked, and the group listed in `DISCORD_FORUM_GROUPS` and visible on the forum. |

## Security notes

- The internal API (`/api/internal/discord/*`) accepts only the bearer token,
  compared in constant time. With no token set, it answers 404.
- It is exempt from the per-IP rate limit so role sync on a large server isn't
  throttled. The 64+ character token makes guessing impractical.
- It returns only public profile data: no emails, sessions, crew, weapons or cash.
- Replies escape player-chosen text and disable all mentions, so a player name
  can't format a message or ping `@everyone`.
