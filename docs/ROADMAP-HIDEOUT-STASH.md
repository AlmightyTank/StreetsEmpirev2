# Hideout, Stash, Scavenging, and Crafting Roadmap

## Product direction

Make scavenging and hideout progression create useful choices between going out, selling loot, storing upgrade parts, and spending turns on crafting. Items should have a clear purpose: a recipe, an upgrade requirement, a sale value, a tactical use, or a collection/cosmetic payoff. Avoid adding filler loot that only occupies space.

Selling scavenged parts is specified in [The Board](ROADMAP-THE-BOARD.md). That roadmap owns the player listings tab. This document keeps the stash, caches, crafting, and upgrades.

The stash should feel physical and readable: items have artwork, rarity, size, and a grid footprint. Capacity should grow through Storage upgrades. Cache reveals should make their possible rewards and odds legible, with a satisfying reveal animation and original StreetsEmpire item art.

## Current delivery: Slice A — stash foundation

Implemented on the feature branch:

- A 10×6 stash grid populated from current player item balances.
- 1×1 and 2×1 item footprints, with saved positions and overlap validation.
- Drag/drop, tap-to-select/place, and auto-sort interactions.
- Hideout stash API and UI entry point.

This is the foundation, not the complete economy integration. The first slice does not yet enforce stash capacity on purchases, scavenging rewards, or crafting outputs; those need to be connected when the item and capacity rules are finalized.

## Roadmap

| Slice | Focus | Player-facing result |
|---|---|---|
| A | Stash foundation | Inspect and arrange owned items in a saved grid. **Implemented in this change.** |
| B | Scouting, district supplies, and caches | Districts yield different weighted component pools; opening a cache previews its rarity odds and reveals illustrated items. |
| C | Power and generator fuel | The generator consumes fuel-can durability per turn while powered on, runs out predictably, and can be upgraded for capacity or efficiency. |
| D | Workshop, crafting, and skill | Recipes consume ingredients, turns, and power; outputs need stash space. Varied crafting improves Workshop skill. |
| E | Module upgrades and capacity | Every hideout module has levels, visible benefits, and escalating cash, turn, and component requirements. Storage levels expand the stash. |
| F | Economy balance and release polish | Tune spawn/recipe odds, add art and clear item descriptions, test edge cases, and monitor item sinks/sources. |

### Slice B — Scouting, components, and cache openings

Districts should favor relevant supplies without making any essential upgrade impossible to obtain elsewhere. Scouting can report clues about likely supply types before the player commits turns. Keep common materials broadly available and put specialist components in a few high-value districts or better caches.

| District theme | Common finds | Scarcer finds |
|---|---|---|
| Industrial | Scrap metal, wiring, tool kits | Motor assemblies, precision parts |
| Commercial | Bottles, labels, packaging | Radios, specialty containers |
| Residential | Lumber, fasteners, cloth | Medicine cabinets, repair supplies |
| Medical | Basic medicine, sterile supplies | Advanced medical components |
| Waterfront / shipping | Fuel cans, motor parts, sealed crates | High-capacity fuel cells, rare machinery |
| Downtown / offices | Electronics, control panels, intel | Specialist circuitry |

Cache quality improves the chance of higher rarity. Initial tuning proposal (Common / Uncommon / Rare / Epic / Legendary):

| Cache | Common | Uncommon | Rare | Epic | Legendary |
|---|---:|---:|---:|---:|---:|
| Street stash | 70% | 22% | 7% | 1% | 0% |
| Supply cache | 50% | 30% | 14% | 5% | 1% |
| Secured cache | 30% | 35% | 22% | 10% | 3% |
| Black-market cache | 15% | 30% | 30% | 18% | 7% |

These are starting balance targets, not final guarantees. The opening screen should show the eligible pool and odds before opening, use original item art, and avoid implying that a rare item is guaranteed. Caches should come from scouting, missions, and encounters; the progression does not depend on paid random drops.

### Slice C — Generator and fuel

- Add fuel cans as stackable stash items with a visible remaining-charge/durability value.
- Power is spent in game turns, not real-world elapsed time. Each powered turn consumes a tunable amount, including turns where the player leaves the generator on without crafting.
- At zero fuel the generator switches off. Show fuel remaining and estimated powered turns in the hideout.
- Generator upgrades can raise fuel capacity, reduce consumption, or improve output. Each level has a distinct benefit and component cost.
- Require power only for recipes that need it; do not make the whole hideout unusable when power is off.

### Slice D — Workshop and crafting skill

Recipes have explicit ingredients, turn cost, power requirement, output footprint, and unlock level. Crafting is transactional: either all inputs are present and output fits, or nothing is consumed. Show the full recipe and result before starting.

Starter recipe candidates:

| Product | Ingredients / station | Purpose |
|---|---|---|
| Premium condoms | Basic condoms, packaging, specialist material; Workshop | Higher-value trade item or a modest, clearly described gameplay bonus. |
| House Brew | Bottles, grain/sugar, labels; Brewery module and power | Trade good and optional crew morale benefit. |
| Field first-aid kit | Basic medicine, sterile cloth, packaging; Workshop | Useful recovery item for an outing. |
| Ammo bundle | Gunpowder and casing components; powered Workshop | Converts scavenged materials into a limited supply of bullets. |
| Vehicle repair kit | Metal parts, tools, wiring; Workshop | Repairs a vehicle or supports a Garage upgrade. |

Workshop skill should grow from crafting different recipes, with diminishing returns for repeating one cheap recipe. Skill can reduce turn cost slightly or unlock recipes, but ingredient and power needs remain meaningful.

### Slice E — Upgradeable hideout modules

Give every module levels with a concrete benefit, requirements, and clear next-level preview. Higher levels should require more turns and cash plus rarer components. Do not make a single rare drop a permanent progression gate: offer alternate district, cache, or trade routes for critical components.

| Module | Example benefits as it levels |
|---|---|
| Storage | More stash grid space; optional later sorting conveniences. |
| Generator | More fuel capacity, lower fuel use, or improved powered output. |
| Workshop | Unlock recipes, improve craft efficiency, enable larger recipes. |
| Clinic | Better recovery options and medical recipes. |
| Brewery | Unlock House Brew variants and improve batch output. |
| Intel room | Better district supply clues and scouting efficiency. |
| Garage | Vehicle maintenance, repair recipes, and vehicle-related benefits. |
| Crew quarters | Crew capacity or a modest recovery/morale benefit. |

Capacity upgrades should be the point at which purchases, loot rewards, and crafting outputs are checked against available stash space. Make overflow behavior explicit before enforcing it (for example, a recoverable delivery queue rather than silent item loss).

### Slice F — balance, usability, and release

- Add consistent item artwork, rarity styling, footprint previews, and concise item purpose text.
- Keep drop rates and recipes data-driven so tuning does not require UI rewrites.
- Track item sources and sinks, cache rarity outcomes, full-stash failures, fuel use, and recipe completion to find dead items and bottlenecks.
- Test placement persistence, grid boundaries, stack moves, full output space, insufficient ingredients, insufficient turns, power loss, and fuel exhaustion.
- Tune district weights and costs so each upgrade has multiple viable routes and no district becomes mandatory for basic progress.

## Design rules

1. Every item has at least one understandable use: craft, upgrade, consume, trade, or collect.
2. Rare components create planning and exploration choices, not unrecoverable progression locks.
3. A player can see the cost, time, power use, output size, and benefit before committing.
4. Stash capacity has value because of Storage upgrades, while early capacity remains forgiving.
5. Rarity communicates scarcity; it does not replace clear item utility or fair drop information.
