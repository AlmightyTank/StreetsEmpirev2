# StreetsEmpire Website Platform

This document tracks the migration from the current single-site deployment to the StreetsEmpire public website, live game, and beta game platform.

## Target domains

| Host | Purpose |
| --- | --- |
| `streetsempire.dev` | Public website, game information, statistics, history, news, guides, and community links |
| `play.streetsempire.dev` | Production/live StreetsEmpire game |
| `beta.streetsempire.dev` | Beta/test StreetsEmpire game |
| `forum.streetsempire.dev` | Community forum |

## Phase 1 — Protect the existing game

Phase 1 is intentionally infrastructure-neutral. It must not change the live application, DNS, Nginx, database, authentication, or deployment.

### Branch policy

- `main` remains the production source of truth.
- `website-platform` is the integration branch for the public website/platform migration.
- Website/platform work is developed and reviewed away from `main`.
- No DNS or production deployment changes occur until the new public site and live/beta split have been tested.
- Feature branches for this project should branch from `website-platform` while the platform work is in progress.
- The future `beta` deployment branch should be created when the beta environment is introduced, rather than pointing an unfinished branch at production infrastructure.

### Production safety rules

1. Never point a beta deployment at the production database.
2. Never change `streetsempire.dev` DNS as part of an application-code change.
3. Never share live and beta session cookie names.
4. Keep game APIs same-origin with their game host unless there is a concrete reason to split them.
5. Public website endpoints must expose only intentionally public game data. Information that requires in-game Recon must never become public through the website API.
6. Database migrations must be reviewed for both live and beta deployment behavior before production rollout.
7. The public website migration must preserve old game URLs with redirects when the final domain cutover happens.

### Intended development flow

```text
feature branch
      |
      v
website-platform
      |
      v
integration testing
      |
      v
main
      |
      v
play.streetsempire.dev
```

When the beta environment is introduced:

```text
feature branch
      |
      v
beta / beta deployment
      |
      v
validation
      |
      v
main
      |
      v
production
```

## Phase 1 completion checklist

- [x] Confirm current production source branch.
- [x] Create `website-platform` from `main`.
- [x] Leave production application code unchanged.
- [x] Leave DNS, Nginx, auth, and databases unchanged.
- [x] Record the platform/domain and branching plan.
- [ ] Enable GitHub branch protection for `main` in repository settings.

## Phase 2 — Separate public website application

The public website now has its own workspace at `apps/site`. The playable game remains in
`apps/web`; Phase 2 does not move routes, authentication, API traffic, DNS, Nginx, or
production data.

### Phase 2 completion checklist

- [x] Add `@streets/site` as a React + TypeScript + Vite workspace.
- [x] Reuse Bootstrap 5.3.8 and the repo's existing React/Vite dependency versions.
- [x] Run the public site locally on port `5174`.
- [x] Add a standalone HTML entry point and React application entry point.
- [x] Add an independent public-site stylesheet instead of coupling it to the game theme.
- [x] Add `npm run dev:site`.
- [x] Add `npm run build:site`.
- [x] Include the public site in the root production build command.
- [x] Update `package-lock.json` with the new workspace metadata.
- [x] Preserve `apps/web` without modification.
- [x] Leave DNS, Nginx, authentication, databases, and deployment unchanged.

### Local development

```bash
npm run dev:site
```

The public site runs at `http://localhost:5174`.

The existing game development flow remains unchanged:

```bash
npm run dev
```

The game remains at `http://localhost:5173` with its API at `http://localhost:3001`.

## Phase 3 — Public website shell

The public site now has its shared layout and permanent route structure. This phase is
still data-safe: pages are structural placeholders and do not query production game data.

### Phase 3 completion checklist

- [x] Add a shared public-site header and footer.
- [x] Add responsive desktop/mobile navigation.
- [x] Add route-aware active navigation and a public 404 page.
- [x] Build the new public homepage shell.
- [x] Reserve top-level pages for Game, Guide, Cities, Turf, Games, Rankings, Hall of Fame, Alliances, Stats, News, Roadmap, Community, Beta, Status, Support, and About.
- [x] Reserve detail routes for guides, cities, games, players, alliances, and news.
- [x] Keep Play Now pointed at `play.streetsempire.dev`.
- [x] Keep Beta pointed at `beta.streetsempire.dev`.
- [x] Keep the forum link pointed at `forum.streetsempire.dev`.
- [x] Preserve `apps/web` without modification.
- [x] Do not expose live database or Recon-gated information.

## Phase 4 — Live public overview

The public website now reads a deliberately narrow, read-only API contract. The first
two endpoints power the homepage and current-game dashboard:

```text
GET /api/public/overview
GET /api/public/current-game
```

### Phase 4 completion checklist

- [x] Add shared TypeScript contracts for the public website API.
- [x] Add a dedicated `PublicSiteService` with explicit safe-field selections.
- [x] Register public routes under `/api/public` without authentication.
- [x] Add current round/ruleset metadata and aggregate season statistics.
- [x] Add top-five public net-worth rankings without private player resources.
- [x] Add recent completed turf captures as the first public activity feed.
- [x] Add recent published news previews.
- [x] Add all-time completed-game and active-account counts to the overview.
- [x] Proxy `/api` from the local public-site Vite server to the game API.
- [x] Add loading, no-game, and API-unavailable states to the public site.
- [x] Replace the current-game placeholder with a real public dashboard.
- [x] Add an integration regression that verifies the endpoints work without a login.
- [x] Add a regression guard against exposing cash, crew, inventory, weapons, wounds, or protection state.

### Public-data boundary

The Phase 4 API may expose public identity, public ranks/net worth, season metadata,
published news, aggregate statistics, city names, alliance tags, and completed public
turf captures. It must not expose cash-on-hand, crew counts, supplies, weapons, wounds,
combat readiness, protection timers, Recon reports, convoy intelligence, or hidden
market/player state.

## Phase 5 — Completed game archive

The public website now has a permanent season archive backed by frozen ended/archived
round data.

### Public archive endpoints

```text
GET /api/public/games
GET /api/public/games/:gameId
```

The detail route accepts either the round id or its public slug.

### Phase 5 completion checklist

- [x] Replace the `/games` placeholder with a real current/past games page.
- [x] Replace `/games/:gameId` with a completed-season record page.
- [x] Show season champions and tied co-champions from frozen final ranks.
- [x] Show full public final national standings.
- [x] Show final alliance standings from end-of-season membership/net worth.
- [x] Show city champions from frozen local ranks.
- [x] Add final season totals for players, alliances, cities, economy, combat, travel, and turf.
- [x] Preserve early-round history when travel/city rules did not yet exist.
- [x] Batch archive summary aggregation so archive growth does not create per-season query storms.
- [x] Cache immutable completed-game details longer than live public data.
- [x] Keep round-local public pimp ids from linking to an ambiguous current-season profile.
- [x] Add an archived-round integration fixture and apply the public private-field guard to archive responses.

### Historical data boundary

Completed-game pages may expose frozen public ranks, public display names/pimp ids,
final public net worth, public alliance tags, public city results, and aggregate season
statistics. They still do not expose cash-on-hand, crew/inventory/weapon state, wounds,
Recon reports, protection clocks, convoy intelligence, or raw battle calculations.

## Phases 6–28 — Public platform completion

### Phase 6 — Rankings & player careers
- [x] Guest-readable current national rankings.
- [x] Current player public profiles with rank movement, city, alliance and public net worth.
- [x] Cross-season career history linked internally by account without exposing account ids.
- [x] Keep crew, weapons, inventory, cash and Recon state private.

### Phase 7 — Alliances
- [x] Public current alliance standings.
- [x] Combined public net worth, roster, leader and turf presence.
- [x] Public alliance detail routes.

### Phase 8 — Cities
- [x] Current city directory using the pinned ruleset's public city character.
- [x] Player/economy/turf aggregates.
- [x] City detail pages and public district controllers.

### Phase 9 — Turf
- [x] Current public turf board.
- [x] Public district holder/alliance identity only.
- [x] Recent completed capture feed without posted crew/weapons.

### Phase 10 — Hall of Fame
- [x] Season champion archive.
- [x] Cross-season career leader board.
- [x] Rankings based on frozen ended-round results.

### Phase 11 — Statistics
- [x] Current game public totals.
- [x] All-time completed-game economy, combat, travel and turf totals.

### Phase 12 — News
- [x] Public published-news feed.
- [x] Permanent article pages.
- [x] Scheduled/unpublished posts remain private.

### Phase 13 — Game overview
- [x] Replace the Game shell with an explanation of the real gameplay systems.

### Phase 14 — Guide hub
- [x] Add a structured guide directory.

### Phase 15 — Guide articles
- [x] Add getting started, economy, combat/Recon, travel, turf, alliances, hideouts and seasons guides.
- [x] Avoid publishing hidden live balance numbers.

### Phase 16 — Roadmap
- [x] Publish the 0.6 → 1.0 player-facing milestone path.

### Phase 17 — Community
- [x] Link the real forum, news and alliance resources.
- [x] Do not invent an unconfigured Discord invite.

### Phase 18 — Beta
- [x] Add permanent beta/data-reset warning and beta-game link.

### Phase 19 — Status
- [x] Add guest API/database health status.
- [x] Keep separate direct links for live game, forum and beta.

### Phase 20 — Support
- [x] Publish the no-pay-to-win support policy.
- [x] Document intended cosmetic/community benefits without inventing checkout.

### Phase 21 — About
- [x] Publish project, seasonal-design and information-boundary principles.

### Phase 22 — Public search
- [x] Search current players/alliances plus games, news and cities.
- [x] Add Search to global navigation.

### Phase 23 — SEO metadata
- [x] Route-aware titles, descriptions, Open Graph metadata and canonicals.
- [x] Noindex search and beta utility pages.

### Phase 24 — Sitemap & robots
- [x] Add `robots.txt`.
- [x] Add static public sitemap for permanent indexable routes.

### Phase 25 — Accessibility
- [x] Add skip navigation.
- [x] Add visible keyboard focus.
- [x] Respect reduced-motion preference.
- [x] Add accessible lazy-route loading status.

### Phase 26 — Performance
- [x] Route-split the public React application.
- [x] Use short caches for live public API data and longer caches for immutable history.
- [x] Document immutable caching for hashed Vite assets.

### Phase 27 — Nginx & deployment hardening
- [x] Validate API/game/site build artifacts in `deploy.sh`.
- [x] Add optional post-deploy public/live URL smoke checks.
- [x] Add Nginx root/play split reference using the actual VPS checkout path.
- [x] Block non-public game APIs on the root public hostname.
- [x] Document production origin/Discord callback changes.

### Phase 28 — Release readiness
- [x] Add GitHub validation workflow for typecheck, unit tests and all builds.
- [x] Extend guest/private-field integration regression through the new public endpoints.
- [x] Add post-cutover public-platform smoke test.
- [x] Add launch, verification and rollback checklist.
- [ ] Enable GitHub branch protection/ruleset for `main` in repository settings.
- [x] Run the final workflow successfully.
- [ ] Complete the VPS cutover checklist.

## Phase 28 release gate

Application work is now CI-green. Production launch is complete only after
`docs/WEBSITE-LAUNCH-CHECKLIST.md` is performed against the VPS and
`scripts/ops/check-public-platform.sh` passes on the real hostnames.
