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

Phase 1 is intentionally infrastructure-neutral. It must not change the live application, DNS, Caddy, database, authentication, or deployment.

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
- [x] Leave DNS, Caddy, auth, and databases unchanged.
- [x] Record the platform/domain and branching plan.
- [ ] Enable GitHub branch protection for `main` in repository settings.

## Phase 2 — Separate public website application

The public website now has its own workspace at `apps/site`. The playable game remains in
`apps/web`; Phase 2 does not move routes, authentication, API traffic, DNS, Caddy, or
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
- [x] Leave DNS, Caddy, authentication, databases, and deployment unchanged.

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

## Next phase

Phase 5 expands the public data model into real Games/season-history pages: the game
archive, individual completed-game pages, final standings, champions, and season
statistics.
