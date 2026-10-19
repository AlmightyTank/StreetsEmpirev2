# Handoff - Staff roles

Read this first, then [BRAINSTORM-STAFF-ROLES.md](BRAINSTORM-STAFF-ROLES.md) (the plan and
every decision) and the "Getting in" section of [ADMIN-RUNBOOK.md](ADMIN-RUNBOOK.md).

## Where it stands

- **Stage A is built and on `beta`** (commits `1f145f7`, `d6ab77c`): game-side roles,
  permissions, the Staff page and the console script.
- **Stage B is built**: Discord staff roles follow the game (see below). It ships switched
  off: set `DISCORD_STAFF_ROLE_IDS` and `DISCORD_STAFF_SYNC` as the runbook says.
- **Stage C is built**: the `/staff` Discord command (see below).
- **Stages D-E are not started.** D (forum group sync) is next.
- **One manual step after deploy:** `npm run admin -- <owner> --founder` on the server.
  Until then every former admin is a plain Admin, and Admins cannot change each other.

## Decisions already made (do not re-ask)

- The game is the source of truth. Discord and the forum are pushed to match it.
- Roles: FOUNDER, ADMIN, MOD, JR_MOD, HELPER. Exactly one Founder, the owner, set only
  from the console and never grantable from the panel or Discord.
- Private account data (email, sessions, devices, audit snapshots) is Admin and up.
- Staff accounts are marked publicly (stage E). There is no hidden staff.
- Helper exists on the game, Discord and the forum.
- A `/staff` Discord command is wanted (stage C).
- Nobody acts on their own account or on staff at or above their rank. Only the Founder
  makes or removes Admins. JR Mods mute and time out for up to a day.

## How stage A works

| Piece | Where |
|---|---|
| Roles, capability map, rank rules | `packages/shared/src/staff.ts` (unit tests in `packages/shared/src/__tests__/staff.test.ts`) |
| Schema: `Account.staffRole`, `StaffRoleChange` history | `prisma/schema.prisma`, `prisma/migrations/20261112000000_staff_roles/` |
| `isAdmin` kept equal to Founder-or-Admin | Trigger `Account_sync_staff_role` and CHECK in that migration. Legacy `isAdmin` writes still work. |
| Route guard | `requireStaff(capability)` in `apps/server/src/plugins/auth.ts`; `STAFF_ROUTE_CAPABILITIES` in `apps/server/src/routes/admin.routes.ts`. Unlisted routes are admin-only. |
| Actor and rank checks inside services | `apps/server/src/services/staff-guard.ts`; `ACTION_CAPABILITY` in `admin-account.service.ts` |
| Role changes | `AdminAccountService.setStaffRole` (takes a `source`: GAME, DISCORD or CONSOLE) and `POST /api/admin/accounts/:id/staff-role` |
| Staff list | `apps/server/src/services/staff.service.ts`, `GET /api/admin/staff` |
| Web | `apps/web/src/utils/staff.ts` (`useStaff`), `gameNav.ts` (`adminSectionsFor`), `pages/AdminStaffPage.tsx`, `pages/AdminAccountPage.tsx` |
| Console | `scripts/ops/set-admin.ts` (`--role`, `--founder`, `--off`, `--list`) |
| Integration tests | `apps/server/src/services/__tests__/staff-roles.integration.test.ts` |

## Stage B (built): Discord sync

| Piece | Where |
|---|---|
| Staff role keys (`staff:founder`, `staff:jr-mod`...) | `staffRoleKey` in `packages/shared/src/staff.ts`; `roleKeysFor` / `rolesFor` in `apps/server/src/services/discord-bot.service.ts` |
| Resync within a minute of a role change | `setStaffRole` queues `queueDiscordRoleResync` and wakes the bot; the console script queues one too |
| Roles by ID, Founder check-only | `staffRoles` in `apps/discord-bot/src/roles.ts` |
| off / report / enforce, change and difference events | `RoleSync` in `apps/discord-bot/src/sync.ts`; types and staff channel text in `apps/discord-bot/src/staff-sync.ts` |
| Config | `DISCORD_STAFF_SYNC`, `DISCORD_STAFF_ROLE_IDS` in `apps/discord-bot/src/config.ts` |
| Forum mirror excludes staff-named groups | `withoutStaffForumGroups` in `roles.ts`, applied in `index.ts` |
| Tests | `apps/discord-bot/src/__tests__/staff-sync.test.ts` (fake guild) |

Not done in B: the Staff page shows only whether Discord is linked, not whether the bot
has applied the role. The bot reports to the staff channel instead.

## Stage C (built): `/staff`

| Piece | Where |
|---|---|
| Command, subcommands `set`, `remove`, `list`, `sync` | `apps/discord-bot/src/commands.ts` (`staffCommand`) |
| Reply, staff channel line, roster embed | `apps/discord-bot/src/staff-command.ts` |
| Game endpoints (bot token) | `POST` and `GET /api/internal/discord/staff-roles` in `apps/server/src/routes/discord-bot.routes.ts` |
| Rules | `StaffService.setFromDiscord` calls `AdminAccountService.setStaffRole(..., 'DISCORD')`; `listForDiscord` needs `staff.view` |
| Tests | `apps/discord-bot/src/__tests__/staff-command.test.ts`; Discord cases in `staff-roles.integration.test.ts` |

`/staff sync` checks the caller with the existing `isStaff` call (Helper and up) and resyncs
the member in the bot. Refusals from the game (400, 403, 409) are now shown to the member
for every command, instead of "not answering".

## Next: stage D (forum groups)

1. Config `FORUM_STAFF_GROUP_IDS=founder:<id>,admin:<id>,...` (Flarum group IDs).
2. On `setStaffRole` (and a periodic pass), read the linked forum user's groups, swap only
   the staff groups, write them back with the existing API key (`forum-moderation.service.ts`
   shows the auth and the read-back pattern), then read back to confirm.
3. Only the Founder gets Flarum's built-in Admin group (id 1). Admin and below get custom
   groups with moderator permissions set in Flarum.
4. Unlinked staff: nothing to push; the Staff page already flags them.

## Working in this repo

- **A push to `beta` or `main` runs CI and then deploys** (see `docs/AUTO-DEPLOY.md`).
  Verify before pushing.
- Checks: `npm run typecheck` and `npx vitest run`.
- Database tests: `docker compose up -d postgres`, `cp .env.example .env`,
  `npx prisma migrate deploy`, then for example
  `ADMIN_INTEGRATION=1 npx vitest run --no-file-parallelism staff-roles.integration`.
- **Database failures that are not from staff roles:** on 2026-10-19, about 60 integration
  tests already failed on `beta` without the staff changes (store, exploit, heat, law,
  work-supply and others). Before calling a failure yours, compare it against plain `beta`.
  The combat suite has one flaky test.
- Prisma does not model the partial unique index `Account_one_founder` or the trigger. If
  `prisma migrate dev` ever offers to drop them, keep them.
