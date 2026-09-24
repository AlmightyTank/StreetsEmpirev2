# StreetsEmpire 0.7.0-AA: Hideout & Jobs release

AA closes 0.7.0. It keeps the completed Hideout headquarters balance from G and ships the
full Jobs & Contacts arc on top: permanent unlocks, favors, rotating contracts, community
events, cosmetics, player-facing site themes and the Halloween/Christmas 2026 event jobs.

## What AA adds for players

- **The Hideout is headquarters.** Safe Room protection, Lookouts warnings, Workshop and
  Garage logistics, Back Office ledger visibility, Armory priorities, Infirmary support and
  permanent seasonal specializations all live in one connected headquarters surface.
- **Jobs & Contacts are the progression spine.** Mama, Pip, Tommy, Wheels, Vic and Blocks
  offer tracked work with event-driven and current-state objectives. Rewards grant contact
  reputation, cash, items and durable in-round access such as weapons and Pip products.
- **Favors became inventory.** Ordinary, timed, single-use and legendary favors can be earned,
  stored and consumed through the same job reward model instead of the old pinned-ruleset
  trader favor flow.
- **The board has repeatable work.** Daily, weekly, dynamic city, alliance and community jobs
  give the season a live rhythm without replacing the core street, product, travel and turf
  loops.
- **Cosmetics are permanent account rewards.** Contact finales grant titles, badges, profile
  frames and site accents. Phase Y-E adds player-facing site themes, and Phase Y-F awards the
  Halloween Moon and Winter Lights themes through 2026 event jobs.

## Automated gate

From the repository root:

```powershell
npm run qa:release
```

With PostgreSQL running:

```powershell
npm run qa:release -- --with-db
```

`qa:release` now runs the 0.7 Hideout gate after the product, travel and turf gates:

1. **Hideout contract validation.** Every 0.7 Hideout ruleset from A through G and the final
   AA ruleset must pass `hideoutV2Problems`.
2. **Pinned balance preservation.** Later 0.7 rulesets cannot change room prices or base buffs
   under the feature layers.
3. **Protected storage guardrails.** Safe Room product protection stays capped so wealthy
   stashes remain raidable.
4. **Connected-system guardrails.** Lookouts, Workshop, Garage, Back Office, Armory,
   Infirmary and specialization bonuses remain inside their release bounds.

Run just the Hideout gate with:

```powershell
npm run qa:hideout
```

## Live regression coverage

`--with-db` still runs the database-backed release suites one file at a time. The 0.7-specific
coverage is spread across the focused service and ruleset suites for Hideout v2, permanent
unlocks, favor inventory, timed favors, single-use favors, legendary favor effects, daily and
weekly contracts, secret and branching jobs, city and alliance contracts, community events,
quest cosmetics, site themes and holiday events.

## Deploying 0.7.0

Migrations since 0.6.0-F are already ordered under `prisma/migrations`. The final AA ruleset
adds no schema migration; holiday jobs are versioned ruleset content layered on top of the
Y-E cosmetic catalog.

Rounds keep the ruleset they were created with. Existing travel or turf rounds remain pinned;
create the next public season on `classic-og-v0.7-aa`.

The local seed now creates **Game #020 - Hideout** on `classic-og-v0.7-aa`.

## What to watch in the first AA round

- **Specialization choices.** No branch should feel mandatory. If one dominates, tune the
  capped specialization effect rather than the base room.
- **Contract pacing.** Daily, weekly, city, alliance and community jobs should create reasons
  to check in without making ordinary actions feel like chores.
- **Legendary favors.** These should feel like earned swings, not permanent economy pressure.
- **Seasonal event windows.** Normal players must respect the UTC holiday windows; non-production
  admin QA mode can bypass them for testing.
- **Theme rendering.** Winter Lights and Halloween Moon should decorate the global shell without
  obscuring action forms, mobile nav or receipts.
