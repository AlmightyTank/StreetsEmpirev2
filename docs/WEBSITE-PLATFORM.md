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

## Next phase

Phase 2 adds a separate `apps/site` React/Vite application for `streetsempire.dev` while preserving `apps/web` as the actual game application.
