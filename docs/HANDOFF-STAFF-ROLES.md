# Handoff - Staff roles

Read this first, then [BRAINSTORM-STAFF-ROLES.md](BRAINSTORM-STAFF-ROLES.md) (the plan and
every decision) and the "Getting in" section of [ADMIN-RUNBOOK.md](ADMIN-RUNBOOK.md).

## Where it stands

- **Stage A is built and on `beta`** (commits `1f145f7`, `d6ab77c`): game-side roles,
  permissions, the Staff page and the console script.
- **Stages B-E are not started.** B (Discord sync) is next.
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

## Next: stage B (Discord sync)

1. Add `staff:<role>` keys to `roleKeysFor` in `apps/server/src/services/discord-bot.service.ts`.
2. In the bot, add the staff roles to the managed roles, matched by **ID from config**
   (`DISCORD_STAFF_ROLE_IDS=founder:<id>,admin:<id>,mod:<id>,jr-mod:<id>,helper:<id>`)
   instead of by name. See `apps/discord-bot/src/roles.ts`, `sync.ts` and `config.ts`.
3. The Founder role is checked, never assigned. The bot can only assign roles below its
   own, so only report drift on it.
4. Queue `queueDiscordRoleResync` from `setStaffRole` so a demotion lands in seconds.
5. Keep staff forum groups out of the `Forum <group>` Discord mirror.
6. Post drift corrections to the staff channel. Run a one-time bootstrap report before
   enforcement, behind a flag.
7. The bot's staff buttons already use capabilities through the server
   (`support.service.ts`, `admin-moderation.service.ts`, `support-ticket.service.ts`).

Stage C (`/staff` command) should call `setStaffRole` with `source: 'DISCORD'`, so the
rank rules and the audit trail stay in one place.

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
