# StreetsEmpire 0.9.0-H — The Streets Are Talking: Release

> **0.9.0 implementation closeout — September 26, 2026**
>
> Feature development for 0.9.0 is closed on `beta` with H: moderation, abuse
> prevention and the release QA pass.
>
> **Promotion is still an operator gate, not a checked box in Git history.** Before
> calling the deployed build released, run the automated QA commands below
> (including the PostgreSQL pass) and complete the phone/desktop browser checklist.
> Do not infer those results from merged commits.

0.9.0 adds the social and information layer around the systems built through
0.8.0: the Player Directory (A), Pimp Console messaging (B), the Activity &
Attack Console (C), the Rolodex (D), Alliance Communications (E), Profiles,
Statistics & Titles (F), Notifications & Phone Alerts (G), and Moderation (H).
It adds no ruleset changes; 0.8.0-H balance is unchanged.

## What H ships

### Player controls

| Control | Behaviour |
|---|---|
| Block | No private messages either way. The other side only ever sees "not available". |
| Mute | New. The muted player's messages still arrive, straight into Archived, with no unread count and no alerts. They are never told. |
| Report | Unchanged from B1. Reports now feed a real admin queue. |
| Archive | Unchanged. |
| Delete conversation | New. Removes every message with that player from your folders for good. Their copy stays, and reports keep the evidence. |
| Notification controls | From G: per-category bell and phone switches, a master pause and quiet hours. |

### Anti-spam

| Rule | Limit |
|---|---|
| Send floor, window, duplicates | B1: 5 s between messages, 20 per 10 minutes, the same message to the same player blocked for 60 s. |
| New accounts (under 48 h) | 5 messages per 10 minutes, 3 cold recipients per hour, no links. |
| Cold recipients | 10 players per hour who have never written to you. Replies to someone who wrote first are never throttled. |
| Links | Outside links are refused from new accounts and flagged from everyone else. The game's own site and forum are exempt. |
| Automated flags | Outside links, and the same text sent to 3+ players within an hour, open an AUTO flag in the reports queue. |
| Communication mute | An admin mute stops DMs, Alliance Wire posts and forum recruitment threads. |

All the limits are constants in `apps/server/src/services/communication-guard.ts`.
Treat them as starting values and tune them with real traffic.

### Admin tools

- **Reports queue** (`/game/admin/reports`) holds player reports and automated
  flags. It never shows message text. Opening a report shows the reported message
  and at most 5 messages before and 2 after it in that one thread, and every open
  is audited (`report.view`).
- **Resolve** as action taken or dismissed, with a note. This closes every open
  report on the same message, and the **Resolved** tab keeps the resolution history.
- **Communication mutes**: 1 hour, 1, 3, 7 or 30 days, or permanent. They are audited
  and shown to the player beside Compose.
- **Account moderation notes**: private and audited.
- **Audit log**: unchanged; every H admin action writes to it.

## Release QA

Run:

```bash
npm run qa:release
npm run qa:release -- --with-db
```

`--with-db` now also runs the three 0.9.0 PostgreSQL suites: `PROFILE_INTEGRATION`,
`GAME_ALERTS_INTEGRATION` and `MODERATION_INTEGRATION`.

### Roadmap QA list → where it is covered

| QA item | Coverage |
|---|---|
| Concurrent messaging | `moderation.integration`: 6 concurrent retries of one send write one row; 4 different sends at one instant let exactly one through the floor. |
| Retry behavior | Same test plus `pimp-console.service` unit tests (replay without a second write). |
| Notification deduplication | `game-alerts.integration`: repeated collection passes deliver once; per-source markers plus outbox dedupe keys. |
| Blocking | `moderation.integration` (both directions, neutral error), `pimp-console.service` unit tests. |
| Account deletion | `moderation.integration`: deleting a sender keeps the recipient's 125-message inbox intact; `admin-accounts.integration`. |
| Alliance leave/join | `alliance.integration`, `playing-together.integration`; announcements alert only members who had joined by then (`game-alerts.integration`). |
| Season ending | `release.integration`, `release-0.3.integration`; permanent titles and Hall of Fame across seasons (`profiles-stats.integration`). |
| Old-round profiles | `profiles-stats.integration`: finished-season stat sheets are never sealed and titles persist. |
| Push notification retries | `notifications.integration` (needs test VAPID keys and a bot token) and `push.service` unit tests. |
| Mobile layouts | Manual pass below. The Alerts settings, Reports queue and Console controls were screenshot-checked at 390 px with no horizontal scroll. |
| Large inboxes | `moderation.integration`: 125 messages page at 30 per page (5 pages) under 2 s, with correct unread count. |

### Known failing suites (pre-existing, not 0.9.0)

A full sequential run with every integration flag on, plus test VAPID keys, a
test bot token and a test forum secret, passes everything except these. Each one
also fails on the commit before 0.9.0-F:

- `GameEventToasts` web unit tests (2): quest toast copy drifted.
- `release-0.4.integration`: product counts off by one at random (unseeded roll).
- `drive-by.integration`: expects `QUEST_INCOMPLETE`, gets `NOT_FOUND`.
- `product-economy.integration`: Hideout armory medicine expectation.
- `relocation.integration`: Garage relocation fee expectation.

`notifications`, `discord-bot` and `forum-link` integration suites only run when
their test secrets are set. They pass when you set them.

## Manual browser pass

At phone width (about 390 px) and desktop width:

1. Console: send a message, reply, archive, restore, report, block and unblock.
2. Mute a player from a message and confirm their next message lands in Archived
   with no unread badge. Unmute from **Blocked & muted**.
3. Delete a conversation and confirm it is gone from your folders but not from the
   other player's.
4. As an admin, mute a test account's messaging. That account sees the notice by
   Compose and cannot send or post on the wire. Lift the mute.
5. Reports: open a report, check the thread and the `report.view` audit entry,
   and resolve with a note. Check the Resolved tab.
6. Account → Alerts: switch categories, bell mutes, the pause and quiet hours, and
   check nothing scrolls sideways.

## Release boundary

H is a hardening slice. The limits above are deliberately simple constants so
they can be tuned after launch traffic, without a schema change.
