# Brainstorm - Staff roles synced across game, Discord and forum

Status: **Brainstorm with decisions recorded. Nothing built yet.**

Five staff roles - **Founder, Admin, Mod, JR Mod, Helper** - set in one place and
mirrored to the game, Discord and the Flarum forum.

## Decided

- **The game is the source of truth.** Roles are only set from the game (Admin → Staff, or
  the `/staff` Discord command, which calls the game). Discord and the forum are pushed to
  match. A staff role added by hand on either platform is removed on the next sync and
  reported in the staff channel.
- **One Founder.** The Founder role belongs to the owner's account only. It cannot be
  granted from any tool; it is set once by migration/seed and can never be removed through
  the admin UI or `/staff`.
- **Private account data is Admin+ only.** Email, registration IP, devices and sessions
  stay hidden from Mod, JR Mod and Helper.
- **Staff accounts are marked.** Staff can play, but every staff account shows a staff
  badge on its profile, leaderboards, wire posts and messages. There is no hidden staff.
- **Helper exists on all three platforms.**
- **A `/staff` Discord command** manages roles from Discord, with the same checks and audit
  trail as the game UI.

## What exists today

- `Account.isAdmin` is the only staff flag (`prisma/schema.prisma`). `requireAdmin` in
  `apps/server/src/plugins/auth.ts` gates admin routes and requires a second factor.
- The bot already syncs roles: the game computes role keys per linked account
  (`roleKeysFor` in `apps/server/src/services/discord-bot.service.ts`) and the bot adds or
  removes only roles it manages (`apps/discord-bot/src/roles.ts`, `sync.ts`).
  `queueDiscordRoleResync` asks for an immediate refresh.
- The game reads linked players' visible Flarum groups (`forum-groups.service.ts`) and
  already writes to Flarum with an admin API key (`forum-moderation.service.ts`).
- Visible forum groups are mirrored into Discord as `Forum <group>` roles. Staff groups must
  be excluded from that mirror, or staff end up with both `Forum Mod` and `Mod`.

## Data model

- `enum StaffRole { FOUNDER ADMIN MOD JR_MOD HELPER }` and `Account.staffRole StaffRole?`.
- `isAdmin` stays during the migration as "staffRole is ADMIN or FOUNDER" so its ~97 call
  sites move gradually. Existing admins become `ADMIN`; the owner becomes `FOUNDER`.
- `StaffRoleChange` history: account, from, to, actor, reason, source (`GAME` / `DISCORD`),
  created at. Every change also writes an `AdminAuditLog` entry `staff.role-change`.
- Per-platform sync state for the Staff page: last synced at, last error, per platform.

## Permissions

Rank comparisons are not spread through the code. A capability map in `packages/shared`
(`can(role, 'accounts.ban')`) is shared by the server, the web admin UI and the bot.
`requireAdmin` becomes `requireStaff(capability)`.

| Capability | Founder | Admin | Mod | JR Mod | Helper |
|---|---|---|---|---|---|
| Rounds, rulesets, deploys, maintenance | ✅ | ✅ | | | |
| Economy grants and corrections, Crowns, loans | ✅ | ✅ | | | |
| Email, IP, devices, sessions | ✅ | ✅ | | | |
| Grant/revoke Admin | ✅ | | | | |
| Grant/revoke Mod, JR Mod, Helper | ✅ | ✅ | | | |
| Ban, long suspension | ✅ | ✅ | ✅ | | |
| Mute, Discord timeout, forum suspend | ✅ | ✅ | ✅ | up to 24h, reviewed by a Mod | |
| Message reports, mod notes | ✅ | ✅ | ✅ | ✅ | |
| Renames | ✅ | ✅ | ✅ | needs Mod sign-off | |
| Support tickets, bug report triage | ✅ | ✅ | ✅ | ✅ | ✅ |
| Player lookup (public info only) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Second factor required | ✅ | ✅ | ✅ | ✅ | ✅ |

Guards on every role change and moderation action:

- Nobody changes their own role.
- Nobody acts on an account at their own rank or above (a Mod cannot mute an Admin).
- Founder cannot be granted, removed or targeted by anyone else.
- A demotion ends the account's staff sessions at once; the next admin request needs a
  fresh second factor.
- A ban, deactivation or account closure removes the staff role everywhere.

## Discord

- Staff roles are matched by **ID from config**, not by name:
  `DISCORD_STAFF_ROLE_IDS=founder:<id>,admin:<id>,mod:<id>,jr-mod:<id>,helper:<id>`.
  Name matching is fine for `Top 10`, but anyone who can create roles could make a fake
  `Admin`.
- The game adds `staff:<role>` keys in `roleKeysFor`; the bot manages exactly those roles.
- Discord only lets the bot assign roles below its own. Place the bot role above Admin. The
  Founder role sits above the bot and is **checked, not assigned**: drift is reported, never
  auto-fixed.
- The bot manages membership only. What each role can do (kick, timeout, channel access)
  stays in Discord's server settings.
- The staff-channel buttons check capabilities instead of "linked admin", so a Helper can
  triage a bug but not mute anyone.

### `/staff` command

- `/staff set user:@member role:<Admin|Mod|JR Mod|Helper> reason:<text>`
- `/staff remove user:@member reason:<text>`
- `/staff list` - every staff member with ✅/⚠️ per platform.
- `/staff sync user:@member` - force a resync.

The bot only relays: the game checks that the caller is a linked staff member with the
capability, applies the guards above and writes the audit entry with `source: DISCORD`.
Founder is never an option in the role list. Replies are ephemeral; a public line goes to
the staff channel.

## Forum (Flarum)

- Staff groups are matched by ID: `FORUM_STAFF_GROUP_IDS=founder:<id>,admin:<id>,...`.
- The game reads the user's current groups, swaps only the staff groups, writes them back
  with the existing API key, then reads back to confirm, like forum suspensions today.
  Non-staff groups such as Beta Tester are left alone.
- Flarum's built-in Admin group (id 1) gives full control of the forum, so only the Founder
  gets it. Admin and below get custom groups with moderator permissions set in Flarum.
- Staff groups are marked visible, so `ForumGroupsService` shows them on game profiles for
  free. They are excluded from the `Forum <group>` Discord mirror.

## Marking staff accounts

- A staff badge (role name and colour) on the game profile, leaderboards, wire posts,
  messages and alliance rosters.
- A public staff page on the site listing current staff and their roles.
- The Discord and forum roles carry the same names and colours.

## Sync

- **Desired state, not events:** each pass computes the roles everyone should hold and
  fixes any difference. A pass runs right after any change and every few minutes.
- **Staff must link Discord and the forum.** Unlinked platforms show ⚠️ on the Staff page
  and in `/staff list`, and nothing is pushed there.
- **Drift** (a staff role held without the game role, or the reverse) is corrected and
  posted in the staff channel. Founder drift is only reported.
- **Staff page:** one row per staff member with Game / Discord / Forum status, last sync
  time, last error and a Resync button.
- **Bootstrap:** before enforcement is switched on, a one-time report compares who holds
  staff roles in Discord and the forum with the game. An admin confirms each person, so
  nobody is stripped by surprise. Enforcement is behind a flag until then.

## Stages

- **A - Game roles.** `StaffRole`, capability map, `requireStaff`, `isAdmin` migration,
  guards, Admin → Staff page, `StaffRoleChange` history and audit entries.
- **B - Discord.** `staff:*` role keys, role IDs from config, capability-checked staff
  buttons, drift alerts, bootstrap report.
- **C - `/staff` command.** set, remove, list and sync through the game API.
- **D - Forum.** Flarum group sync with read-back, Founder-only Flarum Admin, exclusion from
  the `Forum <group>` mirror.
- **E - Marking and review.** Staff badges everywhere, public staff page, JR Mod review queue.
