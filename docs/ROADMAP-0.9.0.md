# StreetsEmpire v0.9.0 — The Streets Are Talking

## Player Community, Pimp Console & Notifications Roadmap

**Target base:** StreetsEmpire v0.8.0  
**Release theme:** Make StreetsEmpire feel populated, connected, and alive.

---

## Vision

0.9.0 completes the major pre-1.0 gameplay foundation by adding the social and information layer around the systems already built.

By this point StreetsEmpire has:

- Core street work and crew management
- Combat and recon
- Seasons and alliances
- Products and production
- Cities, travel and convoys
- Turf and city control
- Hideouts
- Dynamic stores and economy

What remains is making all of those systems feel like they are happening in a world populated by other players.

0.9.0 introduces the **Pimp Console**: the player's central place for communication, player discovery, attack history, contacts, alliance activity, notifications, and reputation on the streets.

---

## Core Goals

- Add private player-to-player communication.
- Create a proper player directory and discovery system.
- Centralize combat, turf, travel, economic and alliance events.
- Expand the Rolodex into a useful intelligence tool.
- Give alliances better communication without replacing Discord/forums.
- Expand public player profiles and seasonal statistics.
- Add configurable in-game and push notifications.
- Add the moderation and abuse protections required for public communication.
- Preserve competitive fairness and hidden-information rules.

---

## Existing Foundation Carried Forward

0.9.0 starts from the systems already shipped before this roadmap is implemented. It should extend them rather than rebuild them:

- **Activity** already provides a chronological player ledger.
- **Contacts** already provides a private round-only rolodex with notes.
- **Profiles** already provide public identity, cosmetics, awards and historical context.
- **Notifications** already provide the in-game bell/inbox plus mobile-friendly handling and browser push infrastructure.
- **Alliance Wire** already provides lightweight alliance communication.

Those foundations reduce duplication in C, D, E, F and G. Each milestone should focus on the missing 0.9.0 behavior and integration.

### 0.9.0-A implementation start

The first Player Directory slice adds an authenticated `/game/players` surface with:

- display-name and public pimp-number search;
- alliance-name/tag search;
- All, My City, Alliance, Near Rank and Active views;
- public profile links and one-click Contact adds;
- authoritative current-round rank/net-worth/city standing;
- coarse activity bands only: Online, Recently Active, Away and Offline.

The existing data model does **not** currently have a separate crew-name field, so crew-name search is deferred until that identity concept exists rather than inventing a duplicate field solely for this page. Exact last-active timestamps and recon-only information are intentionally excluded from the directory.

### 0.9.0-A completion slice

The follow-up directory slice finishes the discovery work before Pimp Console development begins:

- ordinary directory views use server-side filtering and 40-row pagination instead of loading the whole round into memory;
- **Encountered** is built from interactions the player legitimately knows about: direct raids, turf pushes, convoy tails and recon they personally performed;
- encounter history is capped and deduplicated so it remains cheap as a round grows;
- national ranks are calculated authoritatively with one window-rank query and returned only for the rows actually displayed;
- Near Rank uses the indexed round/net-worth ordering and stays intentionally small;
- encounter ordering is not exposed as an activity timestamp, and being secretly reconned never reveals the observer.

Communication-specific blocking remains part of the Pimp Console/moderation work because no private-message surface exists in A. The directory does not create a new communication channel by itself.

## Milestone Overview

| Version | Theme | Outcome |
|---|---|---|
| **0.9.0-A** | Player Directory | Find and inspect other players |
| **0.9.0-B** | Pimp Console | Inbox, sent messages and communication |
| **0.9.0-C** | Activity & Attack Console | One place for important game events |
| **0.9.0-D** | Rolodex & Intel | Contacts, enemies, notes and relationships |
| **0.9.0-E** | Alliance Communications | Better coordination between members |
| **0.9.0-F** | Profiles, Stats & Titles | Player identity and seasonal history |
| **0.9.0-G** | Notifications | In-game, browser/PWA and optional external alerts |
| **0.9.0-H** | Moderation & Release | Anti-spam, reporting, balance and QA |

---

## 0.9.0-A — Player Directory

### Objective

Make the other players in StreetsEmpire discoverable without exposing information they have not earned.

### Player-facing features

Add a new **Players** page with:

- Search by display name.
- Search by crew name.
- Search by player ID where appropriate.
- Players in your city.
- Alliance members.
- Recently encountered players.
- Players near your rank.
- Recently active players.
- Online players where privacy rules permit it.

Player cards can expose contextual actions:

- View Profile
- Message
- Add Contact
- Add Enemy
- Recon
- Raid
- View Alliance
- Block Player

Available actions should depend on existing rules.

### Activity privacy

Do not expose exact activity timestamps publicly.

Prefer status bands such as:

- Online
- Recently Active
- Away
- Offline

### Done when

- Players can reliably find each other.
- Hidden gameplay information remains hidden.
- Blocked players do not appear in unwanted communication surfaces.
- Player search remains fast with a large player population.

---

## 0.9.0-B — Pimp Console

### Objective

Create the old-school StreetsEmpire communication center.

Main sections:

- **Inbox**
- **Sent**
- **Alliance**
- **Attacks**
- **Notifications**

### Private messages

Messages include:

- Sender
- Recipient
- Timestamp
- Subject
- Message
- Read/unread state
- Reply
- Archive
- Delete/hide
- Report
- Block sender

Keep messaging asynchronous.

StreetsEmpire does not need to become a full real-time chat application.

### Unread indicators

Add notification counters to the main navigation.

Example:

`Console (4)`

Possible breakdown:

- 2 messages
- 1 attack report
- 1 turf notification

### 0.9.0-B1 — Durable private messaging foundation

The first Console slice builds the private-message core before folding the existing Alliance, Attacks, and Notifications surfaces into the Console:

- current-round Inbox, Sent, and Archived folders with 30-row pagination;
- subject/body limits and a compose flow that can be pre-addressed from the Player Directory;
- retry-safe sends backed by a unique sender/action id, not only client-side double-click prevention;
- read/unread state plus a lightweight Console summary endpoint for the main-nav unread badge;
- independent sender/recipient archiving so one player cannot erase the other player's copy;
- account-level blocking that survives round resets and prevents private messages in both directions;
- incoming blocks remain private: the other player only receives a neutral unavailable response;
- sender serialization plus a five-second send floor, 20-message/10-minute limit, and 60-second exact-duplicate suppression;
- durable message reports with resolution fields reserved for the admin moderation queue;
- mobile-first list/detail/compose layouts.

B1 intentionally does **not** duplicate Alliance Wire, attack history, or the existing notification bell. Those become Console integrations in later B/C slices. Per-side delete/hide beyond archive and the admin moderation queue are also follow-up work; report data is persisted now so moderation does not need a schema redesign.

### 0.9.0-B/C acceptance closure

Before continuing deeper into 0.9.0-D, the Console was brought back to the B/C acceptance shape:

- the top-level Console now includes Inbox, Sent, Alliance, Attacks, Notifications, Activity, Archived and Blocked lanes;
- Alliance reuses the existing member-only Alliance Wire instead of creating a parallel communication channel;
- Attacks is a dedicated combat-filtered activity lane, while Activity remains the broader grouped event history;
- Notifications reuses the durable in-game notification inbox, supports read and mark-all-read actions, and opens the same authoritative destinations as the notification bell;
- Console summary counts and the main navigation badge now include unread notification items as well as unread private mail.

### Done when

- Messages cannot be duplicated by retries.
- Unread counters remain accurate.
- Blocked users cannot continue messaging.
- Messages survive logout and server restart.
- Mobile inbox usage is comfortable.

---

## 0.9.0-C — Activity & Attack Console

### Objective

Combine important events from the existing game into one chronological history.

### Event examples

#### Combat

- You were raided.
- Your raid landed.
- Revenge became available.
- Revenge expires soon.
- A Drive-By occurred.
- Thugs returned wounded.

#### Turf

- A push started.
- Your block was captured.
- Your alliance gained city control.
- Your alliance lost city control.
- An outpost is undersupplied.

#### Travel

- A run reached its destination.
- A convoy was spotted.
- A run was attacked.
- Cargo was stolen.
- A vehicle was lost.

#### Economy

- A special order arrived.
- Trader stock arrived.
- Black Market inventory changed.
- An expensive reservation is expiring.

#### Hideout

- An upgrade requirement was completed.
- Medicine treatment finished.
- Protected storage is near capacity.

### Event details

Clicking an event should open the authoritative report or relevant page rather than duplicating all information.

### 0.9.0-C implementation start

The first Activity & Attack Console slice folds the existing private activity ledger into the Pimp Console:

- current-round activity is available from a paginated Console activity endpoint;
- events are grouped into Combat, Turf, Travel, Market, Progress, Street and System lanes;
- Console summary counts now include activity and attack/combat totals for the top-level Console view;
- the Console UI has a dedicated Activity tab with lane filters, event summaries and links back to the authoritative report or owning feature page;
- this slice intentionally does not create new event storage or duplicate full combat/turf/travel reports.

### Done when

A player can understand what happened to their operation while they were away without checking six different pages.

---

## 0.9.0-D — Rolodex & Street Intelligence

### Objective

Turn the existing contact concept into a useful player intelligence system.

### Categories

- Contacts
- Enemies
- Alliance Contacts
- Blocked Players

### Private notes

Players can attach private notes such as:

> Took my Detroit Casino block.

> Usually runs product through Chicago.

> Owes retaliation.

Notes are private to the account.

### Relationship history

Where legitimately known, show:

- Last battle
- Last recon
- Blocks won/lost against them
- Revenge status
- Shared alliance history
- Known city
- Last known strength band

Never expose live information simply because someone is in the Rolodex.

### 0.9.0-D implementation complete

The Rolodex & Street Intelligence slice expands the existing contacts system without creating a parallel intel store:

- rolodex entries now have an explicit player-chosen lane: Contact or Enemy;
- Alliance and Blocked lanes are derived from current alliance membership and account-level blocks;
- the Contacts page exposes category filters for All, Contacts, Enemies, Alliance and Blocked players;
- contact cards show private notes plus earned relationship context from battles, active recon, payback windows, current shared-alliance context and settled turf pushes the player participated in;
- recon is summarized as a strength band in the Rolodex instead of turning saved contacts into live free recon;
- blocked players in the current round are visible from the Rolodex, with block management remaining in the Console;
- player directory and profile actions can add either Contacts or Enemies, while Rolodex rows link back to Profile, Console messaging and Combat for authoritative actions;
- this slice intentionally does not store recon snapshots in contacts or reveal live hidden state merely because someone is tracked.

### Done when

The Rolodex saves information the player has legitimately learned without becoming permanent free recon.

---

## 0.9.0-E — Alliance Communications

### Objective

Make alliances easier to coordinate inside the game.

### Alliance Console

Include:

- Announcements
- Alliance messages
- Shared recon
- Turf activity
- Reinforcement requests
- Convoy sightings
- City-control changes
- Recruitment notices

### Leadership controls

Alliance leadership can:

- Pin one announcement.
- Set alliance description.
- Configure recruitment status.
- Remove inappropriate alliance messages.
- Assign simple leadership roles where appropriate.

### Reinforcement communication

Important requests should become actionable cards.

Example:

> **Detroit Casino under attack**  
> Push lands in 6 minutes.  
> 34 defenders committed.  
> `[Send Reinforcements]`

The existing combat/turf system remains authoritative.

### Done when

Alliance members can coordinate routine gameplay without requiring Discord.

### 0.9.0-E implementation complete

- Alliance profile now has leader-managed description and recruitment status.
- Alliance Wire is promoted to an in-game Alliance Console with leader announcements, one pinned announcement, message moderation, and admin visibility for announcement/pin state.
- Console payload now includes actionable coordination cards for shared recon, turf pushes/reinforcement calls, convoy calls, city-control changes, and recruitment notices while keeping combat/turf/convoy systems authoritative.
- Alliance page and public alliance detail surface recruitment posture and crew description.

---

## 0.9.0-F — Profiles, Statistics & Titles

### Objective

Give players an identity and visible history beyond current net worth.

### Public profile

Show appropriate public information such as:

- Display name
- Crew name
- Alliance
- Current city
- Rank
- Net worth
- Selected title
- Current-season accomplishments
- Previous Hall of Fame appearances
- Achievement showcase

Sensitive combat information remains hidden.

### Seasonal statistics

#### Street

- Turns worked
- Total street earnings
- Recruits found
- Peak crew size

#### Combat

- Raids won
- Raids lost
- Cash stolen
- Thugs defeated
- Biggest raid

#### Turf

- Blocks captured
- Blocks lost
- Total block-hours
- Cities controlled

#### Travel

- Runs completed
- Distance traveled
- Cargo moved
- Convoy attacks won

#### Economy

- Product produced
- Product sold
- Largest transaction
- Trader reputation earned

### Titles

Titles are cosmetic.

Examples:

- Block Boss
- Road Warrior
- Stick-Up King
- Street Pharmacist
- Kingpin
- Most Wanted
- High Roller
- Turf Veteran

Titles provide **no mechanical bonus**.

### Done when

Profiles celebrate how somebody played without creating permanent gameplay advantages.

### 0.9.0-F implementation complete

F extends the existing profile, career, achievement and title system rather than adding a parallel one:

- **Crew name.** An optional, account-level crew name (3–32 characters, same shape as an alliance name) set in Account Settings. It shows on the profile and in the Player Directory, and directory search matches it, which closes the crew-name gap left open in A. An admin **Reset profile** clears it, and the previous value is kept in the audit log.
- **Seasonal statistics.** Every stat is read back from history the game already keeps: the activity feed, battle receipts, turf pushes, hold segments and control events, runs, stops, cargo and trades, and reputation. Seasons that finished before F get full stat sheets too, and nothing on the action path keeps a second set of books. The only new counter is `RoundPlayer.peakCrew`. It is raised on every action and settle, and the migration backfills it with each existing player's current crew. Voided battles never count.

  | Section | Stats |
  |---|---|
  | Street | turns worked, street earnings, recruits found, peak crew |
  | Combat | raids won/lost, defenses held/lost, drive-bys landed, thugs defeated, cash stolen (raids + convoy hits), biggest raid |
  | Turf | blocks captured (pushes + claims), blocks lost, block-hours held, cities controlled (alliance took the city while you held a block there) |
  | Travel | runs completed, distance in real interstate drive hours, cargo moved (loaded + bought on the road), convoy hits won |
  | Economy | product produced, product sold (Pip, checkout, market and run sales), largest transaction, trader reputation |

- **Sealed live numbers.** Stats are history, not free intel. While a season is live, other players see `Sealed` for street earnings, recruits, peak crew, cash stolen, biggest raid, cargo moved, product produced/sold and largest transaction. Feat progress built on those numbers is hidden the same way. The owner always sees everything, and finished seasons show everything.
- **Titles.** Season feats unlock cosmetic titles: **Street Grinder**, **Stick-Up King**, **Most Wanted**, **Block Boss**, **Turf Veteran**, **Road Warrior**, **Street Pharmacist** and **High Roller**. A new legacy award, **Kingpin**, unlocks for a finished season on the national podium. Feats are earned in one season and kept for good. They are re-derived from each season's history (the oldest qualifying season gets the credit), so they survive round resets, show as permanent badges and stay selectable as titles in the off-season. Titles give no mechanical bonus. Feat targets are balance approximations for a 28-day round and should be revisited with real 0.9.0 season data.
- **Profile.** The profile adds a **Showcase** (the player's featured achievements in their chosen order), **This season** (the rarest achievements earned in the live season), a **Season stats** sheet with a picker for the live season and each finished season, and **Hall of Fame appearances** (every finished top-ten season, with podiums highlighted) above the career table.

`PROFILE_INTEGRATION=1` runs the PostgreSQL coverage for the stat aggregation, sealing, permanent titles, Hall of Fame appearances and crew names.

---

## 0.9.0-G — Notifications & Phone Alerts

### Objective

Allow players to know when something important happens without requiring StreetsEmpire to remain open.

### In-game notifications

Every player receives a notification center.

Individual categories can be enabled or disabled.

Suggested categories:

- Incoming raid
- Turf push
- Alliance reinforcement request
- Convoy danger
- Run completed
- Revenge expiring
- Special order ready
- Trader shipment arrived
- Alliance announcement
- Private message

### Browser/PWA push

Add opt-in browser notifications where supported.

Examples:

> StreetsEmpire: Your Detroit Casino block is being pushed.

> StreetsEmpire: Your Miami run made it home.

> StreetsEmpire: Tommy's special order has arrived.

### Discord

Optional Discord alerts may use the existing integration where appropriate.

### Critical rule

Notifications may only reveal information the player would already be entitled to see in-game.

A push notification cannot become free recon.

### Quiet controls

Allow:

- Master notification toggle
- Category toggles
- Push toggle
- Optional quiet hours

### Done when

A player can safely leave the game and receive useful alerts without receiving spam.

### 0.9.0-G implementation complete

G builds on the alert pipeline that already existed (collector → outbox → Discord DMs and Web Push, plus the in-game bell) instead of adding a second one.

**Categories.** There are fourteen, and each has its own outside-alert switch. They default to off, like the originals.

| Category | When | Bell | Rule that keeps it honest |
|---|---|---|---|
| Attacks on me | a raid or drive-by hits you | yes | unchanged |
| Block being pushed | your Lookouts spot a push on your block | yes | the turf page's own `headsUpMinutes(lookouts)` rule; never names the attacker, because the game doesn't; no Lookouts means no early warning |
| My turf | a block is taken | yes | unchanged |
| Backup calls | an ally in your city calls for help on turf or a run | yes | only after they call, only members in that city (the same people who can see and answer the call); no attacker names |
| Alliance control | your alliance gains or loses a city | — | unchanged |
| Convoy danger | your Lookouts spot a tail on your run | yes | ConvoyService's heads-up rule; never names the tailer |
| Runs home | a run makes it home | yes | runs are now settled on time by the alerts pass, exactly as the owner's next page load would |
| Revenge expiring | 2 hours before a revenge window closes | yes | skipped if they hit you again (the window moved) or you already hit back |
| Special orders | a trader order lands on the shelf | yes | scheduled inside the order's own transaction |
| Alliance announcements | a leader posts an announcement | — | current members who had joined by then, not the author |
| Private messages | someone messages you | — | sender name only; subject and body never go to a lock screen; skipped if already read |
| Turns full, rank drops, round news | as before | — | unchanged |

- **Clock events.** Pushes, tails, runs, revenge and orders happen by the clock, not by a write, so the alerts poller now runs on every server, with or without push keys or a Discord bot. Each source row carries its own "alerted" marker (`defenderAlertedAt`, `alliesAlertedAt`, `ownerAlertedAt`, `homeAlertedAt`, `revengeAlertedAt`, `alertsCollectedAt`, and `ScheduledAlert.firedAt`). A pass is therefore idempotent, and the outbox dedupe key is a second guard. The migration marks history as already alerted so deploying does not flood anyone. New activity types (`TURF_PUSH_INCOMING`, `ALLIANCE_CALL`, `REVENGE_EXPIRING`, `SPECIAL_ORDER_READY`, and the previously unused `CONVOY_TAILED`) put these events in the bell, Activity and the Console lanes.
- **Bell controls.** Every category with bell items can be muted there. Muting hides those items from the bell, the unread count, the Console badge and live toasts; the events stay in Activity. System events (quests, away bonus, admin grants) always show.
- **Quiet controls.** A master switch pauses every outside alert without losing category choices. Quiet hours take a start, an end and an IANA time zone, and may wrap past midnight. Nothing goes to phone or Discord inside the window, while the bell keeps recording. The existing push and Discord channel switches remain the push toggle.
- **Discord.** The six original `/alerts` types are unchanged. The new categories reach linked Discord accounts as already-worded `notices` in the alerts claim. An older bot ignores them, and the updated bot DMs them as simple embeds.
- **Settings.** Account → Alerts shows the categories grouped by Combat & turf, Alliance & messages, Travel & economy, and Round, each with a Bell column and a Phone & Discord column, plus the master switch and quiet hours.

`GAME_ALERTS_INTEGRATION=1` runs the PostgreSQL coverage: the Lookouts timing for pushes and tails, no attacker names, allies by city, revenge used or extended, special orders, messages without content, announcements, runs home, once-only delivery, pause, quiet hours and bell mutes.

---

## 0.9.0-H — Moderation, Abuse Prevention & Release

### Objective

Make player communication safe enough for a public game.

### Player controls

- Block
- Mute
- Report
- Archive
- Delete/hide conversation
- Notification controls

### Anti-spam

Add:

- Message rate limits
- Duplicate-message detection
- New-account restrictions where appropriate
- Recipient throttling
- Link filtering if needed
- Automated spam flags

### Admin tools

Admins should be able to inspect reported content and relevant context.

Add:

- Reports queue
- User communication restrictions
- Temporary mute
- Permanent communication mute
- Account moderation notes
- Audit log
- Report resolution history

Avoid unrestricted casual browsing of private conversations.

Admin access should be purpose-driven and auditable.

### QA

Test:

- Concurrent messaging
- Retry behavior
- Notification deduplication
- Blocking
- Account deletion
- Alliance leave/join
- Season ending
- Old-round profiles
- Push notification retries
- Mobile layouts
- Large inboxes

### 0.9.0-H implementation complete

H closes 0.9.0. See [RELEASE-0.9.0-H.md](RELEASE-0.9.0-H.md) for the full release notes and QA matrix.

- **Player controls.** Adds **mute** (the muted player's mail arrives quietly in Archived, with no unread count or alerts, and they are never told) and **delete conversation** (per side, permanent; report evidence is kept) to block, report and archive.
- **Anti-spam.** Accounts under 48 hours old get tighter limits and cannot send links. Cold outreach is capped per hour (3 for new accounts, 10 otherwise), and replies are never throttled. Outside links and copy-paste blasts open automated flags.
- **Communication mutes.** Admin mutes (1 hour to 30 days, or permanent) block DMs, Alliance Wire posts and forum recruitment threads. They are audited and shown to the player beside Compose.
- **Reports queue.** The queue is purpose-driven: no message text until an admin opens a report on purpose. Opening shows only that thread (5 messages before, 2 after) and is audited. Resolutions carry a note and keep a history. Resolving closes every report on the same message, and punishment stays a separate, audited account action.
- **Account moderation notes**, private and audited.
- **QA.** `MODERATION_INTEGRATION=1` covers concurrency, retries, blocks, mutes, deleted conversations, new-account limits, throttling, links, flags, communication mutes, the queue, notes, large inboxes and account deletion. `npm run qa:release -- --with-db` now includes every 0.9.0 suite.

---

## Design Guardrails

### Messaging is not Discord

The Console supports playing StreetsEmpire. It should not become a giant social network.

### No free intelligence

Messages, contacts and notifications never bypass:

- Recon
- Lookouts
- Turf visibility
- City knowledge
- Convoy spotting rules

### Seasonal fairness

Messages and account relationships may persist. Competitive gameplay advantages do not.

### Stats are history, not power

Titles, trophies and records are cosmetic.

### Communication requires moderation

Direct messaging does not ship publicly without:

- Blocking
- Reporting
- Rate limiting
- Admin moderation

---

## Release Gate

0.9.0 is complete when:

- Players can discover and contact each other.
- Inbox/Sent messaging works reliably.
- Important game events appear in one Console.
- Contacts and enemies can be tracked.
- Alliance coordination works in-game.
- Profiles reflect current and historical accomplishments.
- Notifications work without revealing hidden information.
- Players can block/report unwanted communication.
- Moderators have sufficient tooling.
- Mobile Console usage is comfortable.
- Full regression for 0.1–0.8 gameplay still passes.

---

## End State

By the end of 0.9.0, StreetsEmpire should no longer feel like a collection of systems being played independently.

A player should be able to log in and immediately see:

> Tony hit your convoy last night.

> Your alliance lost the Detroit Casino.

> Mike sent you a message.

> Your special order arrived.

> Revenge against Tony expires in 2 hours.

> Your crew is currently ranked #14.

At that point the game has the major gameplay and multiplayer systems required for the road to **StreetsEmpire 1.0.0**.
