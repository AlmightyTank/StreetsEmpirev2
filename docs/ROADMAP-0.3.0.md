# 0.3.0 roadmap - the season

Status: **in progress.** 0.3.0-A is built, 0.3.0-B is started, and 0.3.0-C alliances and 0.3.0-D playing together are built. 0.2.0 made the street dangerous; 0.3.0
makes a round a season with a finish line, and gives players a reason to play
together. Travel is deliberately held for 0.4.0.

0.3.0 follows the 0.2.0 pattern: lettered stages, each with a gate, each shipping
in its own pinned ruleset (`classic-og-v0.3-a`, `-b`, ...) so older rounds keep
the rules they started with.

## Where 0.2.0 leaves us

Already in place, and 0.3.0 builds on it rather than redoing it:

- **Combat:** cash raids, drive-bys, drug runs, ride theft, lure runs, recon,
  revenge windows, wounds and medicine treatment, battle reports.
- **Progression:** trader reputation and quests, the weapon ladder, public
  profiles, legacy rankings and the achievement gallery with raid trophies.
- **Accounts:** email/password, Discord login and linking, Resend-backed email
  verification, change and password recovery.
- **Community:** Flarum forum with verified profile links, forum profile badges,
  and a Discord bot API for roles, profile cards and rankings.

Gaps that shape this plan:

- **Rounds never end.** Nothing in the server ever sets a round to `ENDED`. The seed
  creates every round as `ACTIVE`, and `RoundService.getCurrent` simply picks the
  newest one, so Game #001 through #008 are all still "running". Everything that
  reads past rounds - profile legacy, round wins, best national rank, the Discord
  `national-1` and legacy roles, forum badges - reads `ENDED`/`ARCHIVED` rounds,
  so in real play it is always empty.
- **No admin tools.** `Account.isAdmin` exists but nothing uses it. News is only
  written by the seed, and rounds are only started by re-running the seed.
- **No way to play together.** No alliances, no in-game contacts, no shared intel.
  The forum and Discord now carry general chat, which changes what in-game
  messaging needs to be (see stage D).

## Closing 0.2.0 first

0.2.0 takes no new features. Before 0.3.0-A starts:

1. Commit the in-progress Discord bot work.
2. Settle the open 0.2.0-H items: tune drive-by, drug-run, ride-theft and
   lure-run rewards, and the special-raid balance simulation. Anything not
   worth doing moves to the 0.3.0-E balance pass instead of staying "started".
3. Move the forum URL into environment config (carried from G and H).
4. Mark F, G and H done in the README milestone table, and refresh its known
   gaps: Low-Riders now have uses (drive-bys, ride theft).

## Stages and gates

| Stage | Deliverable | Gate |
| --- | --- | --- |
| **0.3.0-A - Season end** | Rounds close on their end date, final standings are frozen, a round-over screen, a hall of fame, handoff to the next round. | A round past `endsAt` closes exactly once under concurrent requests; legacy, round wins, Discord roles and forum badges show real past-round data; no action can change a closed round. |
| **0.3.0-B - Admin** | Admin panel for rounds, news, accounts and dev bots. | Every admin route is `isAdmin`-gated server-side and audited; a round can be scheduled, opened and ended without re-running the seed. |
| **0.3.0-C - Alliances** | Create, invite, join, leave; size cap; alliance page and rankings; no friendly fire; shared revenge. | Membership changes are atomic and cannot bypass the cap; no attack form can target an ally; leaving mid-fight cannot dodge a revenge window. |
| **0.3.0-D - Playing together** | Alliance wire, contacts (the OG rolodex), shared recon; defense reinforcement simulated and moved to E. | Shared intel never leaks outside the alliance; reinforcement is simulated before it ships, like 0.2.0-A. |
| **0.3.0-E - Balance and release** | Alliance-round balance pass, carried 0.2.0-H tuning, release regression. | A 0.1.0-H-style regression suite passes against a public alliance round. |

## 0.3.0-A - Season end

Closing a round follows the same lazy pattern as turns and shelves: no cron job.

- **Close on first touch.** The first request that loads a round past `endsAt`
  closes it inside one transaction: lock the round, re-check status, settle and
  freeze every player's final net worth and ranks, set `ENDED`. A second request
  finds it already closed. A cheap scheduled job can be added later purely so
  closing does not wait for a visitor, never as the only path.
- **Frozen standings.** Final local and national ranks and final net worth are
  written once and never recalculated. Record who finished #1 nationally and in
  each city.
- **End-of-season awards.** Round wins, top-ten finishes and city bosses become
  legacy achievements. The Discord bot's `national-1` and legacy roles and the
  forum badges start meaning something as soon as this lands.
- **Round-over screen.** Players of a closed round see their final placement and
  a link to the next round, instead of a generic `ROUND_ENDED` error.
- **Hall of fame.** A public page of past rounds and their winners.
- **Handoff.** A new round can sit in `REGISTRATION` before it opens, so there is
  always somewhere to go next. Superseded seeded rounds are closed rather than
  left `ACTIVE` behind the newest one.

## 0.3.0-B - Admin

- **Rounds:** schedule, open registration, start, end early, archive.
- **News:** write, pin and unpin posts (today only the seed can); optionally
  mirror them to the forum announcements category (decided: included in B).
- **Accounts:** search, deactivate/reactivate (`isActive`), view a player's
  battle reports when handling a dispute.
- **Dev bots:** seed and remove local test bots from the panel instead of the CLI
  (carried from G). Still refused against production.
- Every admin action writes an audit record: who, what, when, before and after.

The panel grew past the original list. It ships in four phases, each its own commit:

1. **Moderation:** account search, deactivate/reactivate (signs the player out), sessions with device labels
   but no IP addresses, a read-only player inspector with battle reports, renames and profile resets, admin
   grants and removals (never yourself, never the last admin), and audit log filters.
2. **Round operations:** news with the forum announcements mirror, editing round details, round health
   stats, season checklist actions and a site banner.
3. **Integrations:** Discord resync and queue status, email verification tools, forum link tools, a
   ruleset viewer, and dev bots from the panel (still refused against production).
4. **Corrections:** voiding a battle by reversing its recorded changes (limited to what each side still
   has, and excluded from revenge, trophies and repeat-target limits), capped compensation grants, and
   multi-account signals that show matches without raw IPs.
5. **Closing the panel out:** a player lookup by pimp name or public id, so a dispute that names a pimp
   rather than an account still lands in the inspector; timed suspensions that sign a player out, tell
   them the reason and the end date, and lift themselves; an [admin runbook](ADMIN-RUNBOOK.md); and one
   shared dev-bot definition for the seed and the panel.
6. **Keeping the log:** a CSV export of whatever the audit filters show, and a retention window an
   admin purges by hand - never on a timer - with the purge itself recorded.

Admin comes before alliances because alliances and shared messaging need
moderation from day one.

## 0.3.0-C - Alliances

Alliances belong to a round and reset with it, like everything else in a season.

- **Membership:** create with a name and short tag, invite, accept, leave, kick,
  hand over leadership. A size cap set in the ruleset.
- **Alliance page and rankings:** members, combined net worth, alliance rank.
  The tag appears on profiles and ranking rows.
- **No friendly fire:** none of the attack forms (raid, drive-by, drug run, ride
  theft, lure run) or recon can target an ally.
- **Shared revenge:** a hit on one member opens a revenge window for all of them.
- **Leaving is not a shield:** a player who leaves cannot rejoin, or be attacked
  as a stranger by former allies, until a cooldown passes. That stops alliances
  dropping a member just to raid them.
- **Community hooks:** a forum recruitment category and a Discord role per
  alliance, both driven by the existing bot and forum link.

Decided for `classic-og-v0.3-c`: a cap of **5 members** and a **24-hour** leave
cooldown, matching the revenge window so dropping a member cannot outlast it.

How the gate is met in the core build:

- **Atomic membership.** Every change locks the alliance row, then its players in id
  order, and re-reads before writing. Accepting an invite counts members under that
  lock, so two players taking the last seat at once cannot both get in, and one player
  accepting two invites at once joins only one. Combat never locks alliances, so the two
  cannot deadlock.
- **No friendly fire.** Raids, drive-bys, drug runs, ride theft, lure runs and recon all
  refuse an ally, and revenge never overrides it. The raid page shows the reason.
- **Leaving is not a shield.** Leaving or being kicked records the old alliance and a
  cooldown. Until it passes the player cannot join or found an alliance, and they and
  that alliance cannot hit each other in either direction.
- **Shared revenge that survives leaving.** Each battle records the defender's alliance
  when it landed. A member may hit back for any hit on the alliance since they joined,
  so the victim leaving does not close the window, and a late joiner gets no payback
  for hits they never took.
- **Moderation.** Admins can rename or disband an alliance from the round page. Both are
  audited; disbanding puts every member on the normal cooldown.

Community hooks:

- **Discord.** The bot keeps an `Alliance [TAG]` role for every live alliance in the
  current round and gives it to linked members. Founding, joining, leaving and kicking
  queue a resync for that member; a disband or tag change queues a full sync, which
  deletes roles for alliances that are gone. Only roles named exactly `Alliance [TAG]`
  are ever deleted.
- **Forum.** Leaders post one recruitment thread each into a configured Recruitment
  tag (`FORUM_RECRUITMENT_TAG_ID`). The alliance row is claimed under its lock before
  the forum is called, so a double click cannot open two threads. Admin renames retitle
  the thread and disbands lock it. Forum failures are shown to the leader, never block
  the game, and can be retried.

## 0.3.0-D - Playing together

In-game messaging stays narrow on purpose. General chat already has the forum
and Discord, and open player-to-player DMs bring moderation work that is not
worth it yet.

- **Alliance wire:** short posts visible only to the alliance, with admin moderation.
- **Contacts (rolodex):** a private list of players you track, with notes and
  their last known public standing.
- **Shared recon:** fresh intel one member gathers is visible to allies until it
  expires. Private intel still never reaches anyone outside the alliance.
- **Defense reinforcement:** allies' fit thugs can help defend. This is the
  biggest balance risk in 0.3.0, so it is simulated first - squad caps, how many
  allies can reinforce, and whether reinforcements take wounds - before it goes
  into a ruleset.

Built so far, in the pinned `classic-og-v0.3-d` ruleset:

- **Shared recon.** Allies read each other's fresh recon on the raid page, marked with who
  gathered it; your own report wins when both exist. Membership is read live, so leaving or
  being kicked cuts access in both directions at once, and outsiders, including the target,
  never see it.
- **Alliance wire.** Posts of up to 280 characters, one per member every 15 seconds, readable
  only by current members. Authors and the leader remove posts; admins see removed posts too
  and remove with an audited reason.
- **Contacts.** A private rolodex of up to 100 players per round with notes and live public
  standing (rank, net worth, alliance, last seen) - never recon intel. Add from the Contacts
  page or a player's profile.

Defense reinforcement was simulated (`npm run qa:reinforcement`; findings in [COMBAT-0.3.0-D.md](COMBAT-0.3.0-D.md)) and **decided: held for 0.3.0-E**. Uncapped help makes alliance members near unraidable, and even capped help flattens outcomes, so it is tuned in the alliance-round balance pass with real alliance-round data instead of shipping on fixtures alone.

## 0.3.0-E - Balance and release

- Balance pass for alliance rounds: alliance size against solo players,
  reinforcement, and shared intel.
- **Defense reinforcement** (moved from D): choose between the simulated shapes in
  [COMBAT-0.3.0-D.md](COMBAT-0.3.0-D.md) - a small flat cap, or larger help that only
  sometimes shows up - using win rates from real alliance rounds.
- Any 0.2.0-H tuning carried forward.
- A release regression suite in the style of 0.1.0-H, against a public alliance
  round, plus load and exploit checks for membership and reinforcement.

## Not in 0.3.0

- **Travel (0.4.0).** The eight cities already exist, with scout, income and crack
  modifiers on `City`, but only New York City is enabled. Travel changes
  targeting (combat is same-city only), local rankings and the economy at once,
  so it gets its own milestone. Low-Riders are the natural transport.
- **Open player-to-player DMs.** Revisit once admin moderation is proven on the
  alliance wire.
- **Resource transfers between players,** including between allies. They are the
  multi-account feeding route. Revisit with detection in place.
- **Full forum SSO.** Verified linking is enough for 0.3.0.

## Decisions needed

1. **Alliance size cap.** Decided in 0.3.0-C: 5 members, with a 24-hour leave cooldown.
2. **Resource transfers between allies.** Recommendation: none in 0.3.0.
3. **What carries between seasons.** Recommendation: only legacy stats, awards
   and badges; each round starts fresh.
4. **Messaging scope.** Recommendation: alliance wire and contacts only, no open DMs.
5. **Season length and breaks.** Rounds default to 28 days. Is there a
   registration gap between seasons, and how long?
6. **Early end.** Decided in 0.3.0-B: an admin can end a round early with a required reason. It settles and freezes like a normal finish, so final awards still apply,
   and the reason is audited.
