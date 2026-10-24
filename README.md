# StreetsEmpire

StreetsEmpire is a TypeScript monorepo for a seasonal browser crime-strategy game inspired by the original Pimp War economic loop. The game runs on a Fastify API, Prisma/PostgreSQL, React/Vite clients, versioned rulesets, and optional Discord/desktop integrations.

**Desktop beta:** [Latest StreetsEmpire Desktop Beta](https://github.com/AlmightyTank/StreetsEmpirev2/releases/tag/desktop-beta) · [Desktop setup](desktop/README.md)

## Current repo state

- The local seed opens **Game #020 - Casino Games** on `LATEST_RULESET`, the final entry in the ruleset registry. Historical sample rounds remain pinned to their original rulesets.
- `LATEST_RULESET` and `DEFAULT_RULESET_ID` both follow the registry, so the seed and new-round defaults advance together as releases are added.
- Seeded cities: New York City, Detroit, Miami Beach, Seattle, San Francisco, Las Vegas, Los Angeles, Atlanta, Chicago, Tulsa, and Dallas. Beverly Hills remains only in older pinned rulesets.
- The current codebase includes core economy, products, combat, alliances, travel, boss trips, turf/businesses, hideouts, Jobs & Contacts, casino games, law/cases, factions, vehicles, crew roster, supply systems, loans, sportsbook work, events/random encounters, public site pages, admin tools, forum/Discord hooks, support flows, notifications, and operations tooling.
- Historical rounds stay pinned to their original rulesets; new ruleset behavior is loaded through `loadRulesetForRound()` from the round's stored ruleset id/version.

Useful current docs:

- [1.0 release notes](docs/RELEASE-1.0.0.md)
- [1.3 law release notes](docs/RELEASE-1.3.0.md)
- [1.6.5-G loan release gate](docs/RELEASE-1.6.5-G.md)
- [1.8.0 sportsbook release gate](docs/RELEASE-1.8.0.md)
- [1.8.5 event-system roadmap](docs/ROADMAP-1.8.5.md)
- [desktop client README](desktop/README.md)
- [admin runbook](docs/ADMIN-RUNBOOK.md)
- [recovery/backup notes](docs/RECOVERY.md)

## Running locally

Requires Node.js 20+ and Docker.

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Local services:

- API: <http://localhost:3001>
- Game client: <http://localhost:5173>
- Public site: <http://localhost:5174>

After seeding, register in the game client and join the current round. The default seed does **not** add active bot rivals. For local raid/combat testing, run:

```bash
npm run db:seed:dev-bots
```

## Common scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run API, game client, and public site together. |
| `npm run dev:server` | Run only the Fastify API. |
| `npm run dev:web` | Run only the game client. |
| `npm run dev:site` | Run only the public site. |
| `npm run dev:bot` | Run the Discord bot. |
| `npm run build` | Build server, web, site, and Discord bot workspaces. |
| `npm run typecheck` | Typecheck workspaces and ops scripts. |
| `npm test` | Run the reduced five-file Vitest smoke suite. Database-backed suites are opt-in through environment flags. |
| `npm run test:full` | Run the complete Vitest suite when full regression coverage is needed. |
| `npm run qa:release` | Run the release gate: typecheck, tests, build, and balance gates. |
| `npm run release:rc` | Run the release candidate gate with database/load checks. |
| `npm run db:up` / `npm run db:down` | Start/stop local PostgreSQL through Docker Compose. |
| `npm run db:migrate` | Apply Prisma migrations in development. |
| `npm run db:seed` | Seed cities, pinned rounds, current round, and release news. |
| `npm run db:reset` | Reset and re-seed the local database. |
| `npm run db:studio` | Open Prisma Studio. |
| `npm run admin -- <username-or-email>` | Grant admin access; add `--off` to remove or `--list` to list admins. |

Focused simulation/QA scripts include `qa:combat`, `qa:products`, `qa:travel`, `qa:trips`, `qa:turf`, `qa:casino`, `qa:sportsbook`, `qa:law`, `qa:factions`, `qa:vehicles`, `qa:crew-roster`, `qa:supply-*`, `qa:loans`, `qa:recipes`, `qa:business`, `qa:hideout`, `qa:ui`, and `qa:load-test`.

## Project layout

```text
apps/
  server/       Fastify API, auth, game/admin/public routes, services, operations hooks
  web/          React + Vite playable game client
  site/         React + Vite public website
  discord-bot/  Optional Discord bot and role/news/alert integrations

packages/
  rulesets/     Versioned game balance, feature gates, quest/event/catalog data
  rules-engine/ Ruleset loading and pure calculators
  shared/       Shared schemas, API types, formatting, platform constants

desktop/        Electron desktop wrapper around the live website
docs/           Roadmaps, release gates, operations notes, designs
integrations/   External integrations such as the Flarum profile bridge
prisma/         Prisma schema and seed script
scripts/        QA simulations, ops utilities, art/build helpers
```

## Main API surface

Routes are mounted under `/api` by the server. Current route modules include:

- health and readiness checks
- auth, sessions, Discord OAuth, account safety, email verification, two-factor flows
- current rounds, round info, aftermath, Hall of Fame/history
- game state, economy actions, stores, products, heat, travel, convoys, turf, businesses, law, casino, quests, contacts, players, activity
- combat, drive-bys, recon, treatment, reports
- alliances and alliance wire
- player console messaging, blocks, mutes, reports
- public site data, community/forum hooks, support, supporter/Stripe, notifications, surveys
- admin operations, moderation, monitoring, corrections, round controls, casino/feed controls
- internal Discord bot, ops, patch-note, and Stripe webhook endpoints

See `apps/server/src/routes/index.ts` and the individual files in `apps/server/src/routes/` for the authoritative route list.

## Conventions that matter

- **Money is integer cents.** Database values use integer/BigInt representations; formatting happens at the boundary.
- **Balance lives in rulesets.** Services read prices, thresholds, feature gates, rewards, and tuning from the loaded ruleset instead of hard-coding gameplay values.
- **Rounds pin rulesets.** A round stores `rulesetId` and `rulesetVersion`; old seasons keep playing by the numbers they were created with.
- **Season state is per round.** Accounts persist, but crew/cash/inventory/progress for a competitive season live on seasonal player records.
- **Actions are transactional and idempotent.** Writes use server-side validation, row locks, generated action ids, and replay handling to avoid double-spend or retry exploits.
- **Randomness is injected.** Roll-based logic accepts an RNG so tests and simulations can pin outcomes.
- **Sessions use HTTP-only cookies.** Auth tokens are signed, hashed at rest, and not stored in browser `localStorage`.

## Optional services

Most integrations are disabled until configured in `.env`:

- Discord OAuth and Discord bot role/news/alert sync
- Flarum profile linking and forum news mirroring
- Web Push browser/phone alerts
- Resend email for password recovery and verification
- Stripe supporter payments
- TheRundown sportsbook feed
- Production ops features such as metrics, maintenance mode, backups, restore tests, and launch checks

Use `.env.example` as the current source of truth for supported configuration keys.
