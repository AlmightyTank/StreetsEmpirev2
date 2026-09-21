# StreetsEmpire public site

This workspace is the standalone public website intended for `streetsempire.dev`.

It is intentionally separate from `apps/web`, which remains the playable StreetsEmpire
application.

## Development

From the repository root:

```bash
npm run dev:site
```

The site runs on <http://localhost:5174>.

## Build

```bash
npm run build:site
```

## Phase 3 routes

The public shell now reserves the main website structure:

```text
/
/game
/guide
/guide/:topic
/cities
/cities/:citySlug
/turf
/games
/games/current
/games/:gameId
/rankings
/hall-of-fame
/players/:playerId
/alliances
/alliances/:tag
/stats
/news
/news/:slug
/roadmap
/community
/beta
/status
/support
/about
```

These pages are public-site routes only. Phase 3 intentionally does not expose live
database information or private game intelligence. Public API data is added in a later
phase.
