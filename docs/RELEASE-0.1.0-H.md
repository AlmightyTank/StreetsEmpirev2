# StreetsEmpire 0.1.0-H — release candidate checklist

H freezes the 0.1.0 foundation before 0.2.0 starts adding PvP, travel and other
systems that multiply the cost of finding a core-state bug.

## Automated gate

Run from the repository root:

```powershell
npm run qa:release
```

With PostgreSQL running and the seeded active round available:

```powershell
npm run qa:release -- --with-db
```

For a deployment `.env`:

```powershell
npm run qa:release -- --with-db --production
```

The production-env checker never prints secret values.

## Load smoke

Start the production build/server, then:

```powershell
npm run qa:load
```

Defaults: 250 requests, concurrency 20, `/api/health`, p95 budget 1000ms.
Override when needed:

```powershell
node scripts/qa/load-smoke.mjs --url=http://127.0.0.1:3001/api/health --requests=1000 --concurrency=50 --p95=750
```

Also verify `/api/ready` returns 200. Unlike `/api/health`, readiness checks
PostgreSQL and the current round's pinned ruleset.

## Exploit/regression checks

- Mutable economy routes reject missing action ids.
- Duplicate requests with the same id execute once.
- One id cannot be reused for a different action (`ACTION_ID_REUSED`).
- Concurrent distinct actions cannot overspend turns, cash or inventory.
- Rejected actions roll back all player state and activity.
- A post-action invariant failure rolls back instead of storing negative or
  fractional inventory, negative cash/turns, invalid payout, or invalid fatigue.
- Store unlock access remains round-scoped.
- E read/community endpoints still work after a full action loop.

## Mobile/browser QA

Test at minimum:

- 360×800 Android-sized viewport
- 390×844 iPhone-sized viewport
- 768px tablet width
- desktop Chrome/Edge/Firefox

For each size: Home, Scout, Work, Produce, all four Stores, Rankings, Profile,
News, Status, Rules and Activity. Confirm the quick-resource strip can scroll
without moving the whole page sideways; buttons remain at least 44px tall; no
number input triggers accidental zoom; receipts wrap cleanly; offline banner is
visible; returning online refreshes authoritative state.

## Production deployment

- Back up PostgreSQL before deployment even though H has no migration.
- Set `NODE_ENV=production`.
- Replace the example session secret and database credentials.
- Set only the real browser origins in `CORS_ORIGINS`.
- Keep TLS at the reverse proxy and verify the session cookie is Secure.
- Route liveness to `/api/health` and readiness to `/api/ready`.
- Deploy one app instance unless/until the F in-memory rate limiter is replaced
  by a shared store such as Redis.
- Verify graceful SIGTERM shutdown from the process manager.
- Run a real login, one action, one store purchase and a reconnect after deploy.

## Exit condition

0.1.0-H is complete when automated checks pass, PostgreSQL integration passes,
the load smoke is within the chosen production budget, and the mobile/browser
matrix has no blocker. Then the 0.1.0 foundation is frozen and 0.2.0 work can
start without changing core economic invariants casually.
