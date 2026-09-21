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

Phase 2 only establishes the independent application boundary. Public routes, the
website navigation system, public API integration, statistics, season history and
other content are added in later website-platform phases.
