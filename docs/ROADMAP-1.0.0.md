# StreetsEmpire v1.0.0 — Launch & Hardening

## Public Release Roadmap

**Target base:** StreetsEmpire v0.9.0  
**Release theme:** Stop adding major systems. Make the game ready to survive real players.

---

## Vision

1.0.0 is not another feature expansion.

The major gameplay foundation is complete.

The purpose of 1.0.0 is to take everything built from 0.1 through 0.9 and turn it into a stable, understandable, secure and maintainable public game.

The question changes from:

> What system should StreetsEmpire have next?

to:

> Can StreetsEmpire reliably run a complete public season?

---

## 1.0 Philosophy

No major new economy.

No new combat system.

No major new progression system.

No new map system.

Anything that can wait until 1.1 waits.

1.0 concentrates on:

- Reliability
- Security
- Balance
- Onboarding
- Administration
- Moderation
- Performance
- Mobile
- Operations
- Full-season testing

---

## Milestone Overview

| Version | Theme | Outcome |
|---|---|---|
| **1.0.0-A** | Launch Infrastructure | Production, beta and public site separated |
| **1.0.0-B** | Onboarding & Help | New players understand the game |
| **1.0.0-C** | Security & Exploit Hardening | Competitive systems resist abuse |
| **1.0.0-D** | Full-Game Balance | All major systems work together |
| **1.0.0-E** | Administration & Moderation | Game can be operated without DB surgery |
| **1.0.0-F** | Reliability & Recovery | Failures are observable and recoverable |
| **1.0.0-G** | Mobile, PWA & UX | Game is comfortable on modern devices |
| **1.0.0-H** | Release Candidate | Complete public-season launch gate |

---

## 1.0.0-A — Launch Infrastructure

### Objective

Separate development, beta and production clearly.

### Web structure

#### Main website

**streetsempire.dev**

Public landing site containing:

- Game overview
- Screenshots
- Current season
- Live statistics
- Hall of Fame
- News
- Updates
- Rules/help
- Community links
- Registration/play link

#### Production game

**play.streetsempire.dev**

The stable public game.

#### Beta game

**beta.streetsempire.dev**

Testing upcoming builds and balance changes.

### Environment separation

Production and beta must not share:

- Database
- Sessions
- Secrets
- Queues
- Uploaded data
- Ruleset state

### Version visibility

Every environment should clearly display:

- Application version
- Ruleset version
- Environment
- Current season

### Done when

Nobody can accidentally mistake beta for production or deploy beta data into the live game.

### 1.0.0-A implementation complete

The hosting split (public site, `play.`, `beta.`, separate databases, services and secrets) was already in place before 1.0.0-A; see [WEBSITE-PLATFORM.md](WEBSITE-PLATFORM.md) and [BETA-DEPLOY.md](BETA-DEPLOY.md). A adds the code-side guarantees on top:

- **One version.** `APP_VERSION` (`@streets/shared`) is the application release, separate from any round's ruleset version. The running commit is read from `BUILD_COMMIT` or git.
- **Version visibility.** Public `/api/meta` returns the environment, app version and commit, ruleset and season. The game shows `v1.0.0-A` next to the logo, an environment badge, and a full build line in the footer and on Status. The public site's status page shows the live build. Beta and dev show a ribbon and a `[BETA]`/`[DEV]` tab title. `/api/health` now reports the real version instead of a frozen `0.4.0`.
- **Environment identity.** Each server is `production`, `beta`, `development` or `test` (`APP_ENV`, or inferred without breaking existing servers). It refuses to start with settings that could pass beta off as production: a shared session cookie name, or an open beta.
- **Separate data.** Production and beta each claim their database on first boot and refuse the other's. Two servers racing to claim a fresh database cannot both win.
- **Deploy guards.** Both deploy scripts refuse the other environment's `.env`, and after restarting they confirm the environment and commit, locally and through the public hostname.

`PLATFORM_INTEGRATION=1` covers `/api/meta`, health/readiness/status identity and the database claim against PostgreSQL. `platform.test.ts` holds the plain-Node deploy check to exactly the server's rule.

---

## 1.0.0-B — Onboarding & Player Education

### Objective

A new player should understand StreetsEmpire without reading an external guide.

### First-login flow

Introduce:

1. Turns
2. Scout
3. Crew
4. Supplies
5. Stores
6. Products
7. Combat
8. Travel
9. Turf
10. Hideout
11. Alliance

Do not dump every system on the first screen.

### Early guidance

Add contextual goals such as:

> Scout the streets.

> Recruit your first thug.

> Restock condoms and beer.

> Produce your first product.

> Buy your first weapon.

These are instructional objectives, not mandatory quests.

### Help system

Every major page gets:

- What this page does
- Important terminology
- Key risks
- Link to full rules

### Returning players

Tutorials must be:

- Skippable
- Replayable
- Non-blocking

### Done when

A fresh account can reach normal gameplay without outside assistance.

### 1.0.0-B implementation complete

- **First login.** A three-card intro (Turns, Scout, Crew) opens once for accounts that have never finished a season, ending on "Go scout". Supplies are introduced on the Crew card; Stores, Products, Combat, Travel, Turf, Hideout and Alliance each get a one-time "New here" card the first time their page is opened, so nothing is dumped up front.
- **Getting started.** The dashboard shows five instructional goals (scout, recruit a thug, restock condoms and beer, produce, buy a weapon). They tick from this season's own ledger and crew (growth beyond the starting crew and guns, including checkout lines), never grant anything and never block an action. Hiding the list lasts for the current season.
- **Help on every major page.** "How this page works" explains what the page does, its terms and its key risks, and links to the matching section of the Rules page. All copy lives in `apps/web/src/help/catalog.ts`.
- **Returning players.** Everything is skippable (Skip or Escape), replayable (Rules page and Account settings reset the intro, page cards and guide) and non-blocking. Progress is stored per account (`AccountProfile.onboarding`), so it follows the player across devices and seasons; veterans are never interrupted.

`ONBOARDING_INTEGRATION=1` covers intro due-ness, veteran detection, goal progress from real activity and the replay/skip/dismiss actions against PostgreSQL. `catalog.test.ts` keeps every onboarding page, route and rules link covered.

---

## 1.0.0-C — Security & Exploit Hardening

### Objective

Assume players will deliberately try to break everything involving money, items or competition.

### Test areas

#### Money

- Double spend
- Negative cash
- Integer overflow
- Stale transactions
- Store duplication
- Special-order duplication

#### Inventory

- Negative quantities
- Duplicate purchases
- Duplicate loot
- Concurrent sale
- Outpost transfer duplication

#### Turns

- Double-spending turns
- Refresh exploits
- Concurrent actions
- Turn-generation manipulation

#### Combat

- Replay attacks
- Race-condition revenge
- Protection bypass
- Invalid targets
- Same-account farming

#### Turf

- Double ownership
- Reinforcement races
- Capture duplication
- Supply duplication
- Multi-account tax farming

#### Travel

- Cargo duplication
- Run duplication
- Duplicate arrival
- Convoy settlement races

### Account abuse

Continue strengthening detection around:

- Linked accounts
- Multi-account farming
- Self-feeding alliances
- Trade manipulation
- Automated spam
- API abuse

### Done when

No known supported request pattern creates money, inventory or competitive advantage from nothing.

### 1.0.0-C implementation complete

The game already locked each player row before an action, replayed action ids and checked player-state invariants before commit. 1.0.0-C attacked those guarantees deliberately and closed what got through.

**Fixed**

- **Lost update on turf work.** Scouting a rival's block settled the rival's corner upkeep inside the scout's transaction without the rival's lock, writing their cash and stock back whole. A holder buying something at that moment could have the purchase erased: goods for free. The worker now settles the holder only under the holder's lock (`SKIP LOCKED`: a busy holder is being settled by their own action), so it can neither overwrite nor deadlock.
- **Raids between linked accounts.** Turf pushes, turf tax and convoy hits already refused accounts seen on the same network; raids, drive-bys and special moves did not, so an alt could feed its main. All three now refuse with `LINKED_ACCOUNTS`.
- **Special-order duplication.** A second order for a shelf already being sourced charged again to pull the same delivery closer. One open special order per shelf; the store hides the offer while one is on its way.
- **Oversized numbers.** Order quantities are capped at 100,000,000 (`MAX_ORDER_QUANTITY`) and turns per action at 100,000, so no input can overflow a 32-bit inventory column or make price × quantity inexact. Scout turns had no upper bound at all.

**Defense in depth**

- The database refuses negative cash, supplies, weapons, crew, shelves, favors, outpost boxes and corner counts (`CHECK ... NOT VALID`: enforced for every new write; old rows are reported, never block a deploy). One pending push per block is a unique index.
- A refused write answers `409 STATE_CHANGED` (and is logged as an error, since a service should have caught it first); lock contention answers `409 TRY_AGAIN` instead of a 500.
- `npm run ops:exploit-audit` reports historical rows the new guards would refuse and settlement health; `-- --validate` validates each clean constraint.

**Account abuse**

Admin Signals now shows, per linked-account match, every way value moved between the accounts (raids, drive-bys, special moves, turf pushes, turf tax, convoy hits) and **paired market trades** (one sells a product on a city's high market and another buys it there within the hour), plus alliances holding two or more of them (**self-feeding alliances**). A new **Rate-limit refusals** panel lists accounts and networks that keep hitting the API limits (scripts, bots, stuck clients), without ever showing an address.

**Covered by `EXPLOIT_INTEGRATION=1`** (all through the real HTTP routes, each asserting what was actually credited and that nothing answers 500): double spend, concurrent replays, action-id reuse across actions, overflow and malformed numbers, special-order races, concurrent sales of goods and products, the database guard, turn overdraw, refresh turn minting, invalid combat targets (self, linked, other city, other round), raid replays and two rivals racing for one victim, two crews racing for one block, a rival's work overwriting a purchase, linked-account tax farming, one pending push per block, duplicate run launches, duplicate run arrival, the abuse signals and the rate-limit record. Existing suites already cover concurrent checkouts and shelves, combat replays and serialization, product-row spending and convoy settlement.

---

## 1.0.0-D — Whole-Game Balance

### Objective

Stop testing systems only in isolation.

Run full seasons where players use everything.

### Simulated strategies

Include:

- Street-focused
- Product producer
- Trader
- Raider
- Turf holder
- Traveler
- Convoy hunter
- Alliance specialist
- Hideout investor
- Store arbitrage player
- Mixed player

### Questions

- Does any single system dominate net worth?
- Can a player ignore combat entirely?
- Can a player ignore the economy entirely?
- Does controlling turf snowball uncontrollably?
- Can established players permanently lock new players out?
- Are travel profits worth travel risks?
- Are Hideout upgrades worth their cost?
- Can store arbitrage outperform every other activity?
- Do alliances create unbeatable defensive walls?

### Balance goal

There does not need to be perfect equality.

Different strategies should win under different circumstances.

Mixed skilled play should generally outperform blind single-system grinding.

### Done when

At least one complete simulated season passes agreed balance bands.

### 1.0.0-D implementation complete

`npm run qa:season` runs whole seasons with every strategy in one city at once (`packages/rules-engine/src/simulations/season.ts`), and judges them against balance bands, one per question (`season-bands.ts`). The full report is [BALANCE-1.0.0-D.md](BALANCE-1.0.0-D.md). The shipping ruleset, `classic-og-v0.8-h`, **passes all 11 bands** across five seeds, so no ruleset change was needed.

**The simulation.** 30 crews play 28 days on an hourly clock: each of the 11 strategies twice (four sessions a day and two), two alliances with their wings, a raider with no economy at all, and fresh crews joining on days 7, 14 and 21. Every action goes through the engine's own formulas, the ones the server calls: the street is `calculateScout` with a work-supply plan and the hour's hidden client capacities, the stove `calculateProduce`, fights `simulateRaid` (turf through `turfPushCombatModel`, hijacks through `convoyCombatModel` and `convoyLoot`), Heat `tripHeat`/`decayHeat`/`resolveBust`, runs the 0.5.0-F planner priced through the road-risk model, and net worth `calculateNetWorthCents`. Crews run into each other: raids hit real neighbours under the real target rules (protection, cooldown, minimum strength, revenge), blocks are claimed from locals and pushed, holders top up corners and answer pushes when online, allies back each other up, runs get tailed, and turf tax is minted to whoever holds the block. How people play (sessions, targets, thresholds, when a gun unlock is earned) lives in `SEASON_WORLD`, so real round data can replace it.

**The answers** (medians of five seasons):

| Question | Answer |
| --- | --- |
| Does any single system dominate? | No. Mixed play finishes top; nothing exceeds it. |
| Can you ignore combat? | Yes. The best crew that never fights (a traveler) reaches 0.79× the best crew. |
| Can you ignore the economy? | No. A crew that only raids never grows strong enough to hit anyone: ~$24k. |
| Does turf snowball? | No. Contested blocks change hands ~5 times a week; no group holds more than one at the end. |
| Can veterans lock new players out? | No. Crews joining on days 7, 14 and 21 make 0.73×+ of an opening crew's first week. |
| Are runs worth the risk? | Yes, for a crew with an economy: the traveler ends 1.23× the street grinder; hijackers take ~12% of run income. |
| Is the Hideout worth it? | Yes: the investor ends 1.11× the street grinder. |
| Can store arbitrage beat everything? | No. Counters sell far below what they charge; there is nothing to loop. |
| Are alliances walls? | No. 92% of pushes on allied blocks land; a specialist ends at 0.85× solo mixed play. |
| Does mixed beat blind grinding? | Yes: 1.41× the street grinder, in the worse play style. |

**The bands have teeth.** `season.test.ts` breaks the ruleset on purpose and checks the right bands fail: raids with no protection and unlimited loot fail dominance and combat-optional; hideout rooms at 20× cost fail hideout-pays; turf with a 3× hold bonus and uncapped tax locks late joiners out.

**Worth watching** (inside the bands, but closer to an edge, or a design question rather than a balance failure):

- **Turf is liquid.** A block is held for about a day on average before it changes hands. Holding pays mostly through the tax others' work mints, not the hold bonus. If holding should feel more durable, the push shield or corner defence is the lever.
- **Production as a focus is a trap.** The producer ends at 0.83× the street grinder: every recipe sells to Pip below its ingredient cost, so the stove only pays as supply security when Pip's shelf runs short, which is how mixed play uses it.
- **Trading needs an economy under it.** A pure runner ends at 0.27× the street grinder. Runs pay on top of a crew, not instead of one.
- **Only two strategies ever win a scenario** (turf holder and mixed player), the band's minimum. Different circumstances favour different strategies, but narrowly.
- **Being a target costs.** A street grinder is raided ~68 times in a season and loses ~8% of its street income to raids and ~12% to turf tax. Nothing locks it out, but it pays for staying still.
- **Casual play earns ~45% of engaged play** with half the sessions, so the turn cap is not punishing casual players beyond their time.

---

## 1.0.0-E — Administration & Moderation

### Objective

Routine game operations must not require manually editing PostgreSQL.

### Admin functionality

Admins should be able to manage:

#### Seasons

- Schedule
- Start
- Pause where appropriate
- End
- Archive
- Inspect ruleset

#### Accounts

- Search
- Inspect
- Suspend
- Ban
- Mute
- Review moderation history

#### Economy

- Inspect stores
- Inspect markets
- Inspect suspicious transactions
- Inspect shipments

#### Combat

- Inspect reports
- Void clearly broken results where supported
- Review exploit flags

#### Turf

- Inspect blocks
- Inspect ownership history
- Resolve corrupted state

#### Notifications

- Send game-wide announcements
- Schedule maintenance notices

### Audit requirements

Every destructive admin action records:

- Admin
- Action
- Target
- Timestamp
- Reason
- Previous state where practical

### Done when

Normal public administration can be performed from supported tools rather than direct DB edits.

### 1.0.0-E implementation complete

Much of this list already existed from earlier milestones (scheduling, starting, ending and archiving seasons; account search, suspensions, comms mutes, notes and reports; battle and convoy voids; news and banners; the audit log). 1.0.0-E fills the gaps so no routine operation needs SQL:

| Area | Now supported |
| --- | --- |
| Seasons | **Pause / resume** on the Rounds page. A paused season refuses every player action with the admin's reason (`ROUND_PAUSED`), shows a banner in the game and on the public status page, and lets runs, pushes and tails already in motion land on their own clocks. Resuming moves the end back by the paused time unless the admin opts out. Links from each round to its ruleset, economy, combat and turf views. |
| Accounts | **Ban / lift ban**: permanent until lifted, signs the player out everywhere, and shows the reason at sign-in (`ACCOUNT_BANNED`). Reactivation cannot slip around a ban. Moderation history stays on the account page (notes, admin history, full audit link). |
| Economy | **Economy** page: every city's high market and Pip counter priced as players see them now; money worth a second look (largest ledger lines, players whose net cash in a window is half their net worth or more, admin grants); special orders on their way and delivered. Each player's page gains **Shelves and shipments**, settled as the store would show them. |
| Combat | **Combat & exploits** page: every recent fight and tail in a season, with voids shown (voiding stays on the audited per-player action), and the **exploit flag** queue. The server now records a flag whenever the database refuses a write, a player-state invariant fails, a crew tries to hit a linked account, a request id is replayed, or an account or network crosses 30 rate-limit refusals in a day. One account doing the same thing on one route in one day folds into one flag with a count. Admins close flags as dismissed or actioned, with a note. |
| Turf | **Turf** page: every block with holder, corner, guns, locals, shield, outpost box and pushes in flight; ownership history per block; holders whose posted thugs do not match their corners. Three repairs: **release a block** (the corner, its guns and the outpost box's contents go home; the locals take it back), **re-sync posted thugs** (recomputed from the corners and boxes actually held), and **settle a stuck push** (only once past its landing time, exactly as the defender's next visit would). |
| Notifications | News posts can **broadcast**: when published, every player of the season gets it in the bell, and on their phone and Discord if they take announcements, exactly once. Banners gain a **maintenance** kind with its outage window: players see it counting down, then "in progress"; it can announce itself to every player as pinned broadcast news; the public status page shows it. |

**Audit.** Every new destructive action writes the admin, action, target, time, reason and the state before (and after): `round.pause`, `round.resume`, `account.ban`, `account.unban`, `exploit-flag.dismissed|actioned`, `turf.release-block`, `turf.sync-posted`, `turf.settle-push`, `maintenance.schedule`, `news.create`.

`ADMIN_OPS_INTEGRATION=1` covers all of it against PostgreSQL through the admin routes, including each audit row.

---

## 1.0.0-F — Reliability, Monitoring & Recovery

### Objective

Know when StreetsEmpire breaks and be able to recover it.

### Monitoring

Track:

- API health
- Database health
- Response latency
- Error rates
- Failed actions
- Authentication failures
- Background settlement errors
- Notification failures

### Structured logging

Important events should carry:

- Request ID
- Player ID
- Round ID
- Action ID
- Ruleset
- Error category

Do not log secrets.

### Backups

Establish:

- Automated database backups
- Backup retention
- Off-server backup copy
- Restore procedure

### Restore test

A backup that has never been restored is not a tested backup.

Perform an actual restoration into a non-production environment.

### Deployment recovery

Document:

- Rollback procedure
- Database migration rollback strategy
- Failed-deploy procedure
- Maintenance-mode procedure

### Done when

A server failure is an operational incident rather than a potential permanent loss of the game.

### 1.0.0-F implementation complete

The runbook is [RECOVERY.md](RECOVERY.md).

| Area | Now in place |
| --- | --- |
| Monitoring | **Admin → Monitoring** shows the status (`ok` / `degraded` / `critical`) with the alerts that make it up. It covers: database health and latency; requests, server errors, error rate and p50/p95/p99 latency over 5 minutes and an hour; refused game actions and failed sign-ins by code; errors by category; each background job's runs, failures in a row, last success and last error; the alert backlog and push failures; and the last backup, off-server copy and restore test. The alert thresholds are in `MONITORING_LINES`. `/api/ready` works for uptime checks. `GET /api/metrics` gives Prometheus text behind `METRICS_TOKEN` and does not exist without the token. |
| Structured logging | Every log line in a request carries `requestId` (also returned as `x-request-id`; a safe incoming id is kept), `accountId`, `roundPlayerId`, `roundId`, `actionId`, `action`, `ruleset` and, on failure, `errorCategory`. Background jobs carry `job`. Cookies, authorization headers, passwords, tokens, secrets, API keys and push keys are redacted. |
| Backups | `npm run ops:backup` takes a `pg_dump` custom-format file and a manifest: the checksum, and the exact row count of every table taken in the dump's own snapshot. It then verifies the dump, copies it off-server (`BACKUP_OFFSITE`: rclone, rsync or S3), applies retention (14 daily, 8 weekly, 5 labelled; the newest is never deleted) and writes the status monitoring reads. `install-backup-timer.sh` schedules it daily. Every deploy takes a `predeploy` backup before migrating and stops if that backup fails. |
| Restore test | `npm run ops:restore-test` runs weekly on a timer. It restores the newest backup into a scratch database, compares every table's count against the manifest, applies the current migrations on top, and drops the scratch database. Done for real in development: every count matched. A second restore into a fresh database served the API, with sessions intact. A damaged dump was refused. |
| Recovery | `ops:restore` restores into another database, or, with `--confirm <name>`, over the live one. It takes a `prerestore` safety backup first and replaces the schema in one transaction. `rollback.sh` returns to the previous recorded good deploy. `maintenance.sh on/off` turns maintenance mode on or off: players get a 503 with a message and a maintenance screen, while admins, sign-in, health checks and the status page stay open. RECOVERY.md covers failed deploys step by step, forward-only additive migrations with the pre-deploy backup as the way back, what to do when a migration broke data, and losing the database or the whole server. |

New settings are all optional: `METRICS_TOKEN`, `MAINTENANCE_MODE`, `MAINTENANCE_MESSAGE`, `BACKUP_DIR`, `BACKUP_STATUS_FILE`, `BACKUP_OFFSITE`, `BACKUP_KEEP_*`, `BACKUP_MAX_AGE_HOURS`, `RESTORE_TEST_MAX_AGE_DAYS` and `RESTORE_TEST_DATABASE_URL`. See `.env.example`.

---

## 1.0.0-G — Mobile, PWA, Accessibility & UX

### Objective

Make StreetsEmpire comfortable enough that mobile can be a primary way to play.

### Mobile review

Test every major page at common phone widths.

Focus on:

- Navigation
- Quick Resources
- Tables
- Store checkout
- Combat forms
- Turf blocks
- Travel
- Hideout
- Console
- Admin screens

### PWA

Where practical:

- Installable web app
- App icons
- Push notifications
- Offline shell/error state
- Update notification

Do not pretend gameplay works offline.

### Accessibility

Review:

- Keyboard navigation
- Form labels
- Contrast
- Status indicators
- Touch target size
- Screen-reader semantics
- Error messages

### UX consistency

Standardize:

- Buttons
- Confirmation dialogs
- Receipts
- Warning boxes
- Timers
- Currency formatting
- Quantity controls

### Done when

Important gameplay does not require desktop mode or precision tapping.

### 1.0.0-G implementation complete

Much of this list was already in place from earlier milestones: the phone tab bar and "More" menu, compact status bar, responsive card tables, the install banner (Android prompt and iPhone steps), Web Push, the offline banner, `QuantitySteps`, `Button` with a stated reason whenever it is off, and `ActionResult` receipts. 1.0.0-G measured what was left and closed it.

**Audit.** `npm run qa:ui` (scripts/qa/ui-audit.mjs, with `playwright-core` and `axe-core`) opens every major page in a real browser: 4 public pages, 28 player pages and 15 admin pages, each at 360 px, 390 px and desktop width. It records:

- sideways scrolling;
- tap targets under 24 px, which fail WCAG 2.2 2.5.8 (text links inside a sentence are exempt), and targets under 44 px, which are noted;
- whether the first Tab stop is a skip link, and whether every stop shows visible focus;
- axe-core's WCAG 2.2 A/AA rules;
- script errors.

`qa:release -- --with-ui` runs it with `--strict`.

| | Before | After |
| --- | --- | --- |
| Pages that scroll sideways on a phone | 4 (sign-in, register) | 0 |
| Tap targets under 24 px | 528 | 0 |
| axe WCAG 2.2 AA findings | 128 in 5 rules (contrast, unfocusable scrolling tables, invalid ARIA, target size, autocomplete) | 0 |
| Skip link | none | first Tab stop on every page |

| Area | Now in place |
| --- | --- |
| Mobile | **Decorative shapes.** The sign-in, register and join pages no longer overflow on phones. **Touch sizes.** Everything a thumb must hit is at least 24 px. Buttons and segmented tabs are 40 px, and the brand, status-bar numbers, footer links, checkboxes and page-guide toggles are enlarged on touch screens. **Help tips.** The "?" used to rely on a hover `title`, which phones never show. It is now a button that opens its text on tap, stays on-screen near edges, and closes on Escape or a tap elsewhere. **Number pad.** Number fields open the phone's number pad unless they take negatives. |
| PWA | **Offline page.** The service worker is registered for everyone (browsers need one before offering "Install app") and serves an offline page when a page load cannot reach the server. That page says plainly that nothing can be played offline and reloads itself when the connection returns. The only thing it caches is that page and its icon. **Update notice.** An open tab or installed app checks whether the build being served has changed (on focus, when back online, and every 10 minutes) and offers "Reload". Push and install were already in place. |
| Accessibility | **Contrast.** Muted text now meets 4.5:1 on every panel (`--se-muted` #768291 → #8a96a5), and so does every cosmetic site theme; dimmed tags no longer use 50% opacity. **Keyboard.** "Skip to content" and a focusable `main`, and any table wide enough to scroll sideways becomes a named, focusable region. **Screen readers.** Progress bars and meters are exposed properly, the login autocomplete is fixed, inline action errors (`se-error`) are announced, and `Alert` announces problems (error, warning) at once and news (info, success) politely, with a text label so tone is never colour alone. |
| UX consistency | **Confirmations.** `confirmAction()` and one `ConfirmDialog` replace every `window.confirm`: a named action button, Cancel focused first for anything destructive, big stacked buttons on phones, Escape to cancel, and Tab kept inside the dialog. **Dates and times.** They all go through `formatWhen`, `formatWeekdayTime`, `formatClockTime`, `formatDate`, `formatElapsed` and `formatAgo` (about 50 call sites), in the player's own locale and never with seconds. **Countdowns.** They show hours once there are hours (`1:04:18`, not `64:18`). **Money.** Currency goes through the shared formatters everywhere. **Alerts.** `Alert` gains warning and success tones. |

---

## 1.0.0-H — Release Candidate & Season One

### Objective

Prove the finished game works before labeling it 1.0.

### Release Candidate

Create a dedicated release candidate build.

No feature work after RC unless required to resolve a release blocker.

### Full regression

Regression includes:

- Registration
- Login
- Turns
- Scout
- Produce
- Stores
- Reputation
- Combat
- Recon
- Recovery
- Alliances
- Products
- Travel
- Convoys
- Turf
- Hideout
- Dynamic economy
- Messaging
- Notifications
- Season ending

### Load test

Test expected public concurrency plus safety margin.

Include:

- Login spikes
- Dashboard polling
- Store purchases
- Scout/Produce
- Mass season ending
- Notification bursts

### Season lifecycle test

Run:

**Create → Join → Play → End → Freeze standings → Hall of Fame → Archive → Create next season**

without manually fixing the database.

### Launch checklist

Before release:

- Production backups verified
- Restore verified
- Admin accounts configured
- Moderation process documented
- Privacy/terms pages prepared
- Rules available
- Status/maintenance mechanism available
- Beta environment separated
- Production secrets rotated
- Release notes published

### 1.0.0-H implementation complete

The candidate is **1.0.0-rc.1**. [RELEASE-CANDIDATE-1.0.0.md](RELEASE-CANDIDATE-1.0.0.md) has the build, the freeze, every gate, the regression matrix, the launch checklist and the rc.1 results. `npm run release:rc` runs every gate.

| Area | Now in place |
| --- | --- |
| Release candidate | `APP_VERSION` `1.0.0-rc.1`. From rc.1 on, only release blockers change, each with a regression test and a new rc number after the whole gate passes again. **Result:** every gate passes on rc.1. **Blocker caught:** the beta-tester cosmetic was switched on by `BETA_TESTER_DISCORD_LINKED=false`, because a coerced boolean reads "false" as true; it is fixed, with a regression test. |
| Full regression | Every area in the list maps to suites, in the matrix in the RC document. **Suites no gate ran:** eleven existing suites never ran in the release gate (admin, password recovery, bot API, forum links, phone alerts); they now do, the last three with throwaway secrets generated for the run. **Stale tests:** six tests failing across several milestones were all stale tests, not game bugs, and are fixed; the regression has no known failures. |
| Season lifecycle | `npm run qa:season-one` runs Create → Join → Play → End → Freeze standings → Hall of Fame → Archive → Create next season on a scratch database, through the HTTP API only (plus making the first admin, as `npm run admin` does). Inside "Play" is the 1.0 release definition: register, learn, build a crew, trade, fight (recon and a raid the defender sees), travel (a run), control turf (presence, then a claim), build a Hideout, form an alliance, message another player, finish the season, and appear in the Hall of Fame and the player's career. |
| Load test | `npm run qa:load-test`: 300 players on a scratch server, each with its own address. It covers the login spike, sustained play (3× the game's real polling, plus an action every 15 s each), both bursts, the notification burst and a mass season end. **Bursts:** they failed with 500s when the connection pool ran dry; transactions now wait up to 10 s and anything still starved gets a retryable `503 SERVER_BUSY`. **Season close:** its timeout grows with the season, where a fixed 30 s would have stopped a season of about 640 or more players from ever closing. All scenarios now pass with zero errors ([LOAD-1.0.0-H.md](LOAD-1.0.0-H.md)). |
| rc.2 | **Sign-up:** players verify their email or use Discord before they play; accounts that already existed were grandfathered in; everyone accepts the rules once, in a dialog. **Admins:** admin tools answer only a Discord sign-in (`REQUIRE_ADMIN_DISCORD`), so Discord's two-factor sign-in guards them. **Players:** Report a bug (to Admin → Bug reports) and closing your own account. **Abuse:** at most 5 new accounts per network a day, flagged past that. **Seed:** the development seed uses the current ruleset (0.8-H). Details and results are in [RELEASE-CANDIDATE-1.0.0.md](RELEASE-CANDIDATE-1.0.0.md#rc2). |
| rc.3 | **Two-step sign-in:** any player or admin can add an authenticator app (TOTP, with a QR code and ten recovery codes). It is then asked for at every sign-in: password, Discord or reset link. Admin tools accept an authenticator sign-in as their second factor, alongside Discord (`REQUIRE_ADMIN_2FA`). Staff and the console can turn it off for a lost phone. Details are in [RELEASE-CANDIDATE-1.0.0.md](RELEASE-CANDIDATE-1.0.0.md#rc3). |
| Launch checklist | `npm run ops:launch-check` checks every item it can on the production server: backups, restore test, admins, beta separation, secrets (no placeholders, rotation date), live API, status and maintenance, rules, privacy and terms pages, moderation process and release notes. **Privacy and terms:** new pages, written from what the code actually stores, linked from the site footer, the game footer and registration. **Moderation:** a "Moderation process (1.0)" ladder in the admin runbook. **Release notes:** [RELEASE-1.0.0.md](RELEASE-1.0.0.md). |

---

## 1.0 Release Definition

StreetsEmpire 1.0 is ready when a real player can:

> Register → learn the game → build a crew → trade → fight → travel → control turf → build a Hideout → participate in an alliance → interact with players → finish a season → appear in permanent history.

And the operator can run that entire process without manually repairing normal game state.

---

## Explicitly Out of Scope for 1.0

Do **not** delay launch for:

- Businesses and fronts
- Expanded casino gameplay
- Loansharking
- More cities
- New vehicle classes
- Major new product categories
- NPC factions
- Player-owned businesses
- Deep police systems
- New combat modes
- Large crafting systems
- Permanent prestige power
- Native mobile apps

Those belong after launch.

---

## Final 1.0 Rule

**If it isn't required for the existing game to work safely, clearly and reliably, it waits until after 1.0.**

That is what keeps StreetsEmpire from spending forever at version 0.x.
