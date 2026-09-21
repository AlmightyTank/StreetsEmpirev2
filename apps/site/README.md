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


## Phase 4 public API

During local development, `apps/site` proxies `/api` to the Fastify server on port
`3001`.

```text
GET /api/public/overview
GET /api/public/current-game
```

These endpoints are guest-readable by design and return only explicitly selected public
fields. Recon-gated and private player state is not part of the public website contract.


## Phase 5 season archive

Completed seasons are now available through:

```text
GET /api/public/games
GET /api/public/games/:gameId
```

The public site uses these endpoints for `/games` and `/games/:gameId`. Historical
identity-linked data comes only from frozen public ranks; private game resources and
Recon-gated state remain outside the contract.
