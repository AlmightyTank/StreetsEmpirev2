# Turf Simulation - 0.6.0-C

Ruleset: `classic-og-v0.6-c`

0.6.0-C adds player-vs-player pushes on top of the 0.6.0-A/B turf economy. The C gate keeps the existing holding simulation and adds a deterministic combat pass so reinforcement matters without making a held corner untouchable.

## Push balance

The gate runs 4,000 seeded fights between equal 20-thug, pistol-armed crews at 85 thug happiness.

| Scenario | Attacker win rate |
| --- | ---: |
| No backup | **38.7%** |
| Alliance call | **23.2%** |

The alliance-call line uses the ruleset exactly: five potential helper thugs (25% of the 20-thug defender) and the configured 50% chance for help to show. In the seeded run, **48.7%** of calls showed.

Gate bands:

- No-backup attacker win rate: 30-47%.
- Reinforced attacker win rate: 14-32%.
- Backup must reduce attacker wins by at least 8 percentage points.
- Measured helper show rate must stay within 3 points of the configured chance.

The shipped C numbers pass all four checks.

## State and timing gates

C also keeps these server-side invariants:

- a push lands from the server poller even when nobody involved is online;
- only one pending push can target a block;
- successful capture applies the hold shield before another push can start;
- pending captures reserve crew and alliance turf-cap space;
- squads and guns stay in custody while a push or backup is pending, then return or become the new corner crew;
- a released block stays vacant for the configured six-hour reclaim window before locals return and continue growing back;
- turf revenge uses the normal retaliation duration but never bypasses a hold shield.

## Regression

The C verification run also passes the existing raid, drive-by, convoy, travel, product and holding test suites unchanged, plus `npm run qa:turf` and the production build.
