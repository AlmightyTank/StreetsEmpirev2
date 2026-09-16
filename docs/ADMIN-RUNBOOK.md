# Admin runbook (0.3.0-B)

Everything an admin does lives at `/game/admin` and is written to the audit log
with who, what, when, why, and the before and after snapshots. Nothing here
needs the seed script, a database client, or a deploy.

---

## Getting in

Admin is a flag on an account. The first one has to be set from the console,
and so does the one you set after locking yourself out:

```bash
npm run admin -- <username or email>
```

`--off` removes the flag, `--list` shows who has it, `--reason "why"` is saved
to the audit log with the change. Lookups take a pimp name or an email. Sign out
and back in for the admin menu to appear.

After that, admins make other admins from **Accounts → the account →
Make admin**. An admin cannot change their own role, and the last active admin
cannot be removed from the panel — the console command is the way back.

---

## Running a season

A season moves through five states. Each step is a button on **Rounds**, and
each one is audited.

| Step | What it does | When |
| --- | --- | --- |
| **Schedule round** | Creates the round `SCHEDULED` with a name, ruleset, start, end and optional registration date. | Whenever the next season is decided. |
| **Open registration** | `REGISTRATION`: players can join and build, the clock has not started. | A day or two before the start. |
| **Start** | `ACTIVE`: the season is live. | At the start time. |
| **End early** | Closes the round now: final net worth and ranks are frozen and awards apply. Needs a reason. | Only when a season has to stop ahead of its end date. |
| **Archive** | `ARCHIVED`: it leaves the current-round lookups and stays in the hall of fame. | Once the next season is live. |

Notes that matter:

- **Rounds close themselves.** The first request after `endsAt` closes the round
  inside one transaction. **Close expired rounds now** on the panel does the same
  thing without waiting for a visitor.
- **Starting behind a live round is refused.** If a newer round is already live,
  the panel says so instead of starting a second one. If the round you are
  starting would replace the live one, it asks you to confirm the handoff — that
  checkbox is the whole safety net, so read the warning.
- **Editing details.** Name, start, end and registration date can be changed from
  the round page while the round is unfinished. A finished round is frozen.
- **Round health** on the round page shows joins, active players, battles and
  the richest players, which is usually enough to tell a quiet round from a
  broken one.

---

## Moderation

All of this is on **Accounts**, then the account.

- **Sign out everywhere** ends every session. They can log straight back in.
  Use it for a shared or stolen session.
- **Suspend** is the cool-off: pick a length, give a reason. They are signed out
  now, refused at login until it passes, and shown the reason and the end date.
  It lifts itself, so nobody has to remember. **Lift suspension** ends it early.
  Admins cannot be suspended — remove the role first.
- **Deactivate** is the permanent one: signs them out, blocks login, and hides
  them from rankings and raid lists until an admin reactivates them.
- **Rename** changes their pimp name everywhere, archived rounds included.
- **Reset profile** clears a title, featured badges and accent that broke the
  rules, without touching anything they earned.

Every one of these needs a reason of at least five characters. Suspension
reasons are shown to the player; the rest are for the audit log.

---

## Handling a dispute

1. **Find the player.** Accounts → **Find a player** takes a pimp name or a
   public id (`#1042`) and opens the inspector. You do not need the account.
2. **Read the inspector.** It shows stored state — cash, crew, supplies,
   weapons, timers, hideout, reputation — plus the last 50 activity entries and
   every battle. It never settles the player, so opening it cannot regenerate
   turns or change what they see.
3. **Void the battle** if a fight should not have counted. It reverses what the
   report recorded, limited to what the side that gained it still has (a
   shortfall is reported rather than pushing anyone negative), takes back that
   battle's wounds that are still healing, refunds the attacker's turns up to the
   cap, rewrites ranks, and stops the battle counting for revenge, trophies,
   repeat-target limits, stats and the raid feed. Both players see it in their
   feed. You cannot void a battle you were in, and finished rounds are refused.
   **This cannot be undone.**
4. **Grant compensation** for something a void cannot fix — a bug that ate a
   purchase, say. Turns never go past the round's cap, cash and items have fixed
   ceilings, and weapons are refused until the player has unlocked them. The
   player sees the reason in their activity feed.

Voids and grants only work while a round is live. Once standings are frozen,
both are refused on purpose.

---

## Multi-account signals

**Signals** groups accounts that shared a network in the last 30 days, from
session, verification and reset records. It shows an opaque per-server key, a
coarse device label ("Chrome on Windows") and why the group formed: same
network, same browser, or created within 30 minutes of each other.

It never shows an IP address or a raw browser string, and a match is not proof —
households, schools and phone carriers share networks. Treat it as a reason to
look at the players' behaviour, never as a verdict on its own.

---

## News, banners and integrations

- **News & banner**: write, pin, edit and delete news; optionally mirror a post
  to the forum announcements category (needs `FORUM_API_KEY` and
  `FORUM_NEWS_TAG_ID`), with a retry button when the forum call failed. A site
  banner takes a message, a tone and an end date, and shows on every page until
  it ends or you end it.
- **Integrations**: Discord queue status and a role resync request (needs
  `DISCORD_BOT_API_TOKEN` on both the server and the bot), email verification
  tools, forum link tools, and dev bots for local testing. Dev bots are refused
  in production and against a non-local database, with no override in the panel.
- **Rulesets**: a read-only view of any pinned ruleset, with a compare mode that
  shows only what changed between two of them.

---

## Audit log

**Audit log** filters by actor, action, target and date range. Every entry keeps
the reason and the full before and after snapshots, so "who changed this and
why" is always answerable. Console actions appear as `console:<os user>`.

**Download CSV** saves exactly the rows the filters are showing, newest first,
up to 10,000 of them, with the before and after snapshots as JSON columns. It
opens in a spreadsheet: cells that start with `=`, `+`, `-` or `@` are quoted so
nothing is treated as a formula.

**Retention** is `ADMIN_AUDIT_RETENTION_DAYS` on the server, a year by default,
and `0` keeps everything forever. Nothing is deleted on a timer: the panel shows
how many entries are past the window and an admin presses **Purge**, which needs
a reason and writes its own record of how many rows went and where the cutoff
was. Purge records are never purged, so a gap in the history always has an entry
explaining it. Export before purging if the rows still matter.

---

## Local commands

| Command | What it does |
| --- | --- |
| `npm run admin -- <username or email>` | Grant admin (`--off`, `--list`, `--reason`). |
| `npm run db:seed` | Idempotent seed. **It creates its own current round**, so do not run it against a database with a live season you care about. |
| `npm run db:seed:dev-bots` | Add local dev bots to the current round (`SEED_DEV_BOTS=1`). |
| `npm run db:dev-bots:status` | Show dev bot accounts and whether they are in the current round. |
| `npm run db:cleanup:seed-rivals` | Remove every dev bot account. |

The seed and the panel create dev bots from the same definition
(`apps/server/src/services/dev-bots.service.ts`), so the two cannot drift.
