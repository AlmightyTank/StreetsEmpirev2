# StreetsEmpire Discord bot

Keeps StreetsEmpire roles in sync on your Discord server and answers a few slash
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
| Alliance [TAG] | Linked members in that alliance in the current round (0.3.0-C) |

- The bot owns only the roles in this table. It finds them by exact name, or
  creates them the first time, and never adds or removes any other role.
- Alliance roles follow the game. Each full sync creates a role for a new
  alliance and **deletes** `Alliance [TAG]` roles whose alliance disbanded, was
  renamed to a new tag, or belonged to a finished round. Only roles named exactly
  `Alliance [TAG]` are ever deleted, so don't give a hand-made role that name.
- Founding, joining, leaving and kicking queue a resync for that member, so
  alliance roles update as soon as the game API nudges the bot, with
  `DISCORD_ALERTS_MINUTES` polling as a fallback. A disband or tag change
  queues a full sync.
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
| `/leaderboard` | Public | Top combat and intel counts this round: raids, defenses, drive-bys, recon, stolen rides and crew lured |
| `/history` | Public | Finished round history for you, a linked member, or a current/past player name |
| `/city` | Public | Top 10 in one city this round; city names autocomplete |
| `/turf` | Public | Public block holders, garrisons and city control for one city; city names autocomplete |
| `/alliance` | Public | Alliance roster, rank, combined net worth, held turf, controlled cities and recent captures; omit `tag:` to show your alliance |
| `/halloffame` | Public | Final top 3 of the five most recently finished rounds |
| `/round` | Public | Round status, time left, players, turn rate |
| `/news` | Public | Latest five news posts |
| `/status` | Public | Whether the game is answering, the running version, the season and any planned maintenance. Answers even while the game is down. |
| `/invite` | Public | How to register, join the current round and get roles, with the round's status |
| `/link` | Private | Your game account, current-round player, forum link, and the roles you qualify for, or how to link |
| `/stats` | Private | Your own cash, crew, weapons, supplies, happiness, turns and ranks |
| `/alerts` | Private | Turns on DMs for attacks, round events, rank drops or full turns. See below. |
| `/remind` | Private | Compatibility shortcut for `/alerts type:turns` |
| `/bug` | Private | Opens a form to report a bug from the member's linked account; same limit as the game form (5 an hour). They hear back when staff resolve it. |
| `/support` | Private | Opens a private ticket thread with staff. Works without a linked account. One open ticket per member. |
| `/sync` | Private | Updates your roles now instead of at the next scheduled sync; once a minute per member |
| `/help` | Private | Every command |
| `/announce` | Private | Game admins: create a news post from Discord |
| `/syncall` | Private | Mods: a full role sync for the whole server. Hidden from members without **Manage Roles**, and checked again when run. |

**News auto-post.** When `DISCORD_NEWS_CHANNEL_ID` is set, the game API nudges
the bot after news is created; the bot also checks for newly published game
news every `DISCORD_NEWS_MINUTES` (default 1) and posts each item to that
channel once.
- In an Announcement channel, it also publishes the post to following servers.
- News that already existed when auto-posting was added is never posted.
- The bot needs **View Channel**, **Send Messages** and **Embed Links** in that
  channel. It checks them before every run and logs what's missing instead of
  posting, so fixing a permission needs no restart.
- Each post is marked as sent before it goes out. If Discord rejects a send, for
  example because permissions changed, the bot reports why to the game and the
  post is not retried on its own.
- **Admin → News** shows each post's Discord state. A post that isn't on Discord
  says why: scheduled, attached to a round that isn't the current one, the bot
  API is off, the bot hasn't checked in, or the bot can't use its channel. A post
  Discord refused shows the reason and a **Resend to Discord** button. A post
  marked sent that never showed up can be posted again with **Post to Discord
  again**.

**Alerts and feeds.** Members opt in with `/alerts`.
- The game API nudges the bot when work is queued, and every
  `DISCORD_ALERTS_MINUTES` (default 1) the bot also checks full-turn DMs,
  attack DMs, turf-loss DMs, alliance city-control DMs, rank-drop DMs,
  round-event DMs, the raid feed and round-end posts as a fallback.
- Turn alerts send one DM per fill-up. Spending turns sets up the next one.
- Attack alerts DM the defender when they opted in. Turf alerts DM a player when
  one of their blocks is captured. Alliance alerts DM current members when their
  alliance gains or loses city control. These are opt-in just like the other alerts.
- If `DISCORD_RAID_FEED_CHANNEL_ID` is set, each new raid/combat, turf capture,
  city-control change and Federal crackdown result is also posted publicly once.
- Rank alerts fire only when a member loses national #1 or falls out of the top 10.
- Round alerts DM opted-in members when a round opens, is ending soon, or ends.
  Ended rounds also post final standings to the news channel when configured.
- A member who blocks DMs from server members won't get them; the bot logs that
  and moves on.

**Staff channel.** When `DISCORD_STAFF_CHANNEL_ID` is set, the bot posts there:
- Every new bug report, from the game form or `/bug`, with **Fixed**, **Won't
  fix** and **Duplicate** buttons and a link to **Admin → Bug reports**.
  Reports that existed before this was added are never posted.
- Each button opens a form for the private staff note and an optional message to
  the player. Only members whose linked game account is an admin can resolve; the
  game checks that on every submit and records them in the audit log, just like
  the web panel.
- Resolving a report anywhere (Discord or the web panel) updates its post to say
  who resolved it and removes the buttons. The reporter gets a "your report was
  resolved" alert by Discord DM or push if they get message alerts. It never
  includes the staff note.
- Every new private-message report, from a player or the automatic spam check,
  with who reported whom and why. It never includes the message: reading that
  stays in **Admin → Reports**, where opening a report is audited.
- Report posts have **Mute sender 1 day** and **Dismiss** buttons, each asking
  for a note for the audit log. Muting is the same account action as the admin
  panel's 1-day comms mute, recorded before the report closes as actioned. Closing
  one report closes every report on that message, and all of their posts update.
- Patch notes a deploy holds for review, with when they will publish on their own.
- A post for every new `/support` ticket (see below).
- Make the channel private to staff. The bot needs **View Channel**, **Send
  Messages**, **Embed Links** and **Read Message History** there (the last one
  lets it edit its own posts). While any is missing, posts wait on the server and
  the bot logs what to fix; with no channel set, posts are dropped.

**Status channel.** When `DISCORD_STATUS_CHANNEL_ID` is set, the bot posts there:
- **Updates:** "Updating StreetsEmpire" when a deploy starts, edited to "Update
  finished" or "Update hit a problem" when it ends. The deploy workflow sends these
  through `scripts/ops/deploy-status.mjs`, using the game's `PATCH_NOTES_API_TOKEN`
  (see [docs/AUTO-DEPLOY.md](../../docs/AUTO-DEPLOY.md)).
- **Planned maintenance:** every maintenance banner scheduled in **Admin → News**,
  announced or not, with its window in each reader's own time zone.
- **Outages:** the bot checks the game every minute. After
  `DISCORD_OUTAGE_MINUTES` (default 3) without an answer it posts that the game
  isn't responding, and edits that post when it is back, with how long it was
  down. It stays quiet for up to 20 minutes after posting that an update started,
  since restarts are expected then. A bot restart mid-outage forgets its post, so
  it posts the recovery as a new message.
- Make it a read-only channel members can see. The bot needs **View Channel**,
  **Send Messages**, **Embed Links** and **Read Message History** there.

**Moderation from the game.** The admin account page's **Community** panel
shows a linked player's Discord status (in the server, display name, any timeout)
and can time them out or lift a timeout. The game audits who did it; the bot
records the reason in Discord's audit log too. The game reaches the bot through
`DISCORD_BOT_PUSH_URL`, so that must be set. The bot needs **Moderate Members**,
and its role must sit above the player's highest role; Discord never times out
the server owner or members with **Administrator**. The panel says which applies.
Ticking "Time out on Discord" on a game suspension or ban does the same in one go,
for as long as fits (Discord allows at most 28 days).

**Support tickets.** When `DISCORD_SUPPORT_CHANNEL_ID` is set, `/support` opens a
form and turns it into a private thread in that channel:
- Only the member and staff can see the thread. The bot adds the member and posts
  their message with a **Close ticket** button; the member or a game admin closes
  it, and the bot locks and archives the thread.
- What staff should know about the member goes to the staff channel only, never
  into the thread: their game account (or that they have none), current round,
  restrictions such as bans, suspensions and mutes, bug reports, open reports
  against them and past tickets. **Join ticket** adds a linked game admin to the
  thread. Server members with **Manage Threads** in the support channel can see
  every ticket thread anyway.
- Members without a linked game account can open tickets too.
- Each member has one open ticket at a time; `/support` links them to it.
- Make the support channel visible to members (they need **View Channel** to see
  their thread) but stop them posting in it directly: deny **Send Messages** and
  **Create Public Threads**, keep **Send Messages in Threads**. The bot needs **View
  Channel**, **Send Messages** (Discord requires it to start any thread, so give the
  bot's role an allow that beats the members' deny), **Create Private Threads**,
  **Send Messages in Threads**, **Embed Links** and **Manage Threads** (to lock
  closed tickets). It logs what is missing.

## 1. Create the bot in Discord

You can reuse the application you already use for Discord login
(`DISCORD_CLIENT_ID`), or create a new one at
<https://discord.com/developers/applications>.

1. **Bot** tab: click **Reset Token** and copy it. This is `DISCORD_BOT_TOKEN`.
   Treat it like a password.
2. On the same tab, under **Privileged Gateway Intents**, turn on **Server
   Members Intent** and save. Role sync can't list members without it.
3. Invite the bot with this URL, using your application ID. The permissions
   requested are **Manage Roles** and **Moderate Members** (for timeouts from the
   admin account page; leave it off and timeouts say what is missing):

   ```text
   https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=bot%20applications.commands&permissions=1099780063232
   ```

   An already-invited bot keeps its old permissions: add **Moderate Members** to
   its role in **Server Settings → Roles** instead.

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

# Game server only: optional local wake-up nudge to the bot.
DISCORD_BOT_PUSH_URL="http://127.0.0.1:3002/internal/wake"
DISCORD_BOT_PUSH_TIMEOUT_MS=2000

# Bot only
DISCORD_BOT_TOKEN="<bot token>"
DISCORD_CLIENT_ID="<application id>"
DISCORD_GUILD_ID="<server id>"
GAME_API_URL="http://127.0.0.1:3001"
DISCORD_BOT_LISTEN_HOST="127.0.0.1"
DISCORD_BOT_LISTEN_PORT=3002
FRONTEND_ORIGIN="https://streetsempire.dev"
DISCORD_SYNC_MINUTES=10
DISCORD_FORUM_GROUPS="Admin,Mod"
DISCORD_ROLE_SYNC_MODE="full"
DISCORD_NEWS_CHANNEL_ID="<channel id, or empty for no auto-posting>"
DISCORD_NEWS_MINUTES=1
DISCORD_RAID_FEED_CHANNEL_ID="<channel id, or empty for no raid feed>"
DISCORD_STAFF_CHANNEL_ID="<private staff channel id, or empty for no staff posts>"
DISCORD_SUPPORT_CHANNEL_ID="<text channel for /support ticket threads, or empty for no tickets>"
DISCORD_STATUS_CHANNEL_ID="<public status channel id, or empty for no status posts>"
DISCORD_OUTAGE_MINUTES=3
DISCORD_ALERTS_MINUTES=1
```

- `GAME_API_URL` is where the bot reaches the API, as an origin with no path.
  On the VPS, use the API's local address so traffic never leaves the machine.
- `DISCORD_BOT_PUSH_URL` is where the game API nudges the bot after news,
  combat alerts or role-resync work is queued. Keep it on localhost. The bot
  listens on `DISCORD_BOT_LISTEN_HOST` and `DISCORD_BOT_LISTEN_PORT`; set the
  port to `0` to disable the listener and rely on polling only.
- `FRONTEND_ORIGIN` is only used for links in replies.
- `DISCORD_FORUM_GROUPS` lists which forum groups get a "Forum <group>" role.
  Names match the forum's group names, ignoring case. Leave it empty for none.
  Forum roles need forum linking (`FORUM_LINK_SECRET`) turned on.
- `DISCORD_ROLE_SYNC_MODE` defaults to `full`, which manages the full game role
  set. Set it to `beta-tester-only` on beta to manage only the `Beta Tester`
  role; the game API grants that key to active beta accounts with Discord linked.
- `DISCORD_NEWS_CHANNEL_ID` is the channel for automatic news posts. Copy it by
  right-clicking the channel → **Copy Channel ID**, with Developer Mode on.
- `DISCORD_RAID_FEED_CHANNEL_ID` is the channel for public raid/combat results.
  Leave it empty to keep the feed off.
- `DISCORD_STAFF_CHANNEL_ID` is the private staff channel for bug reports, message reports and held
  patch notes. Leave it empty to keep staff posts off.
- `DISCORD_SUPPORT_CHANNEL_ID` is the text channel `/support` tickets are private
  threads in. Leave it empty to keep `/support` off.
- `DISCORD_STATUS_CHANNEL_ID` is the public channel for updates, maintenance and
  outages. Leave it empty to keep status posts off. `DISCORD_OUTAGE_MINUTES` is how
  long the game must be unreachable before it says so.

Restart the game API after setting `DISCORD_BOT_API_TOKEN`.

## 3. Run

Local development, with the game API already running:

```bash
npm run dev:bot
```

Production runs the bot as a systemd service next to the API, so it starts on
boot and restarts after a crash. Install it once with
`scripts/ops/install-bot-service.sh`; see [docs/DEPLOY.md](../../docs/DEPLOY.md).

Beta uses a separate bot process and should use a separate Discord application,
server and channel ids. From the beta checkout, set `GAME_API_URL` to
`http://127.0.0.1:3003`, set `DISCORD_BOT_LISTEN_PORT=3004`, point
`DISCORD_BOT_PUSH_URL` at `http://127.0.0.1:3004/internal/wake`, then install it
with `scripts/ops/install-beta-bot-service.sh`. Set
`DISCORD_ROLE_SYNC_MODE=beta-tester-only` so the bot manages only the
`Beta Tester` Discord role for beta accounts that linked Discord in the game.

On startup it logs `StreetsEmpire bot ready as …`. The slash commands appear in
your server immediately.

The bot keeps one connection to Discord and claims news and alerts, so run
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
| Commands reply "StreetsEmpire is not answering" | The API is down or unreachable at `GAME_API_URL`, or the two `DISCORD_BOT_API_TOKEN` values differ. The bot logs the error. |
| No news posts | **Admin → News** says why under each post, and the bot log says `News auto-post is off` with the reason. Fix it, then use **Resend to Discord** on a refused post. News that existed before auto-posting is never posted on its own. |
| No alert DMs | The member must opt in with `/alerts`. Turn and rank alerts require an active round and a joined player. They need DMs from server members allowed; failed DMs are logged. |
| No raid feed | Startup log says `Raid feed is off` and why: a wrong channel ID or missing channel permissions. Battles that existed before the feed was added are never posted. |
| `/profile` says your Discord isn't linked | Sign in with Discord or link it under Game → Account, then wait for the next sync. |
| No Forum roles | Forum linking must be on, the member's forum account linked, and the group listed in `DISCORD_FORUM_GROUPS` and visible on the forum. |

## Security notes

- The internal API (`/api/internal/discord/*`) accepts only the bearer token,
  compared in constant time. With no token set, it answers 404.
- The bot's local wake endpoint (`/internal/wake`) accepts the same bearer token
  and only tells the bot to claim pending work from the game API.
- It is exempt from the per-IP rate limit so role sync on a large server isn't
  throttled. The 64+ character token makes guessing impractical.
- It returns only public profile data except private `/stats`, which only shows
  the caller's own current-round dashboard numbers.
- Replies escape player-chosen text and disable all mentions, so a player name
  can't format a message or ping `@everyone`.
