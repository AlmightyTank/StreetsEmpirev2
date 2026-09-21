# Turf full-round simulation - 0.6.0-F

Ruleset `classic-og-v0.6-f`. This is the release-level Turf strategy gate layered on the
existing 0.5.0-F full-round travel model. Street work, Produce, market movement, road risk,
runs and relocation are still scored by the travel simulation; Turf only adds the costs and
returns that 0.6.0 introduces.

## What is simulated

The gate covers **64 situations**: two play schedules, two starting crew sizes, all eight
cities, and both solo and alliance fields. Each situation scores five strategies:

- **Holder** - works the street and invests in profitable home corners up to the home cap.
- **Turf raider** - works the street but spends turns building presence and repeatedly
  pushing other corners, including the expected capped take from outpost captures.
- **Runner** - the existing travel-only runner from the 0.5.0-F model.
- **Mover** - the best mixed road/economy plan after relocating to the selected city.
- **Mixed empire** - the best street/Produce/run plan plus only Turf opportunities that add
  value after their complete setup and service cost.

That produces 320 strategy rows for one release pass.

## Turf costs the model includes

A corner is not treated as free passive income. The simulation prices:

- presence turns before a block can be contested;
- posting and push turns;
- the corner crew's lost home production and daily beer/product upkeep;
- capped street-tax income;
- expected time off a block after successful enemy pushes;
- the lower attacker win rate when alliance reinforcement is available;
- one away outpost, its weekly fill/collect transfers and remote upkeep;
- capped outpost cash exposed on a successful capture;
- the full Garage purchase price when a mixed empire can justify an away holding.

The Garage is optional. An away block is kept only when its hold value still beats setup,
service-turn opportunity cost and the Garage purchase price. This prevents the release
simulation from assuming that every successful crew must buy every new feature.

## World assumptions

Population behavior that cannot be derived from one player's rules is kept in
`TURF_ROUND_WORLD`:

- a visible holder draws 2 serious pushes per week;
- a turf-focused raider starts 4 pushes per week;
- mixed play considers 1 opportunistic push per week;
- a raider keeps a won block for 1.5 days before moving on;
- losing a corner costs a rational holder 1.5 useful hold-days before replacement/reclaim;
- an outpost is serviced once every 7 days with a fill and collect transfer;
- 25% of won raider targets are assumed to be outposts;
- a targeted outpost is assumed to average 40% of its cash capacity before the ruleset's
  exposed-share and hard loot cap are applied.

These are explicit tuning inputs, not hidden constants. Public-round data can replace them
without changing the rest of the economic model.

## Conservative alliance treatment

Alliance rows use the configured chance-to-show reinforcement result when pricing holder
uptime and contested pushes. The score deliberately does **not** add controlled-city
street-tax immunity. That benefit exists in the live game, but assuming the simulated
player's alliance controls the city would give alliance rows free upside. The release gate
therefore passes without needing that advantage.

## Release gate

The F gate requires, in every schedule/start/city/field combination:

1. mixed play beats pure holding;
2. mixed play beats pure Turf raiding;
3. mixed play beats pure running;
4. optional Turf never makes the same mixed move/road plan worse.

Verification on the `turf-0.6.0-f` branch passed TypeScript checking and
`npm run qa:turf -- --quiet` with all existing 40-block/push gates and the new full-round
gate enabled.

**Result: passes.** Mixed play remains the release target without making holding, raiding,
running, relocation, outposts or the Garage mandatory.
