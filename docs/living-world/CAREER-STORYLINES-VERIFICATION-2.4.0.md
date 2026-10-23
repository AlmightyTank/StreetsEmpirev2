# Career Storylines 2.4.0 — Release Evidence

## Verified locally

- `npm run typecheck` — passed for all workspaces and operations scripts.
- `npm run build` — passed for server, web, public site, and Discord bot.
- `npx prisma validate` — passed.
- Focused career-story suite — 10 files, 37 tests passed, including catalog
  validation, five-career balance, source privacy/idempotency, crossover
  filtering, reward provenance, migration inspection, admin dry-run, and
  choice eligibility.
- The production web build reports the existing large-bundle advisory; it is
  non-fatal and does not block output.

The activity hook remains the sole progression entry point. Story reads and
admin previews do not synthesize claims, grant rewards, or mutate live progress.
Database migration execution requires the deployment database credentials and
is intentionally not run against a developer database during this verification.
