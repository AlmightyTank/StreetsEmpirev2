# StreetsEmpire — Ammo & Parts Roadmap

Status: **Slices A–E implemented; Slice F planned** · Target: **beta** · Scope: Combat, armed escorts, encounters, turf defense, gun store, garage service, Territory Rewards.

## Vision
Guns stop being a one-time purchase. Every gun burns ammo every time it fires, and bigger guns burn a lot more of it. Ammo is cheap per round and sold in bulk, because players go through so much of it. Vehicles scale the same way: every run costs cash, bigger vehicles cost more, and **parts** are used for repairs and upgrades.

Both apply only to new, versioned rulesets. Rounds pinned before them keep free-firing guns and cash-only repairs.

All numbers below are proposals to be tuned in simulation, not approved values.

## Ammo

### One ammo, many rounds
- One generic stock: `ammo`, counted in rounds. No separate types per gun; one number on screen is enough.
- Bigger guns fire more rounds per fight:

| Gun | Gun price | Rounds per fight | Ammo cost per fight at $0.30 | Cost per fight / gun price |
| --- | --- | --- | --- | --- |
| Pistol | $50 | 12 | $3.60 | 7% |
| Shotgun | $450 | 30 | $9 | 2% |
| TEC-9 | $1,250 | 90 | $27 | 2% |
| AK-47 | $3,500 | 180 | $54 | 1.5% |

The AK fights at ~2.85 pistols of strength but burns 15× the ammo, so top guns hit harder and cost the most to keep firing.

### Cheap, in bulk
Sold at the gun store, in boxes, with a bulk discount:

| Pack | Rounds | Price | Per round |
| --- | --- | --- | --- |
| Box | 100 | $40 | $0.40 |
| Case | 1,000 | $300 | $0.30 |
| Crate | 10,000 | $2,500 | $0.25 |

- The store keeps a large daily stock on the existing stock + timestamp restock clock (proposal: 25,000 rounds), so buying is never the bottleneck. Paying for and hauling it is.
- Ammo can be sold back at a steep loss (proposal: 25%) so it isn't a place to park cash.

### Example raids
| Attack | Rounds | Cost |
| --- | --- | --- |
| 25 pistol fighters | 300 | ~$90 |
| 20 shotgun fighters | 600 | ~$180 |
| 20 AK-47 fighters | 3,600 | ~$1,080 |
| Mixed 40 (10 of each) | 3,120 | ~$940 |

A heavy raider burning several thousand rounds a day spends real money, which slows runaway attackers and pulls cash out of the economy.

### Where ammo is spent
Ammo is used everywhere guns fire, not just raids:
- **Attacks** — every armed attacker, every fight.
- **Defense** — armed defenders fire too and burn rounds when they have them.
- **Armed escorts** on runs and boss trips — rounds spent when trouble happens on the road.
- **Turf defense and outposts** — posted thugs who fight spend from the stock.
- **Encounters** — gunfights in random encounters and territory events.

### Running dry
Running out has to hurt, without making an offline player helpless:
- Rounds go to the **biggest guns first**, down the ladder, until the stock runs out. A gun with no rounds fights **pistol-whipped**: it counts as an unarmed fighter (thug strength only, no gun bonus).
- **Defender floor:** defenders always get enough free rounds to arm their best N fighters (proposal: 10), so a player who logs off empty is never wiped for free.
- Attackers can set an **ammo cap** per attack to stop one raid burning the whole stock.
- Low-ammo warning in the combat preview and as a notification when the stock drops below one average fight's worth.

### Ammo as loot and yield
- Winning attackers take a share of the defender's ammo (proposal: 15%).
- Encounters and boss trips can drop ammo.
- Territory: transit districts and Chicago yield ammo into caches (see `ROADMAP-TERRITORY-PERKS.md`).

## Parts

Vehicles scale like guns: **bigger vehicles cost more** on the road and in the garage. Runs cost **cash only**; parts are used for repairs and upgrades.

### One parts stock, bigger vehicles use more
- One generic stock: `parts`. No per-model parts.
- Size follows cargo: sedan (65% cargo, 4 crew seats) < low-rider (100%) < van (150%).

### Running cost per run
Every vehicle that leaves on a run or boss trip pays a cash fee (fuel and upkeep) when it departs. No parts are spent on runs.

| Vehicle | Price | Cargo | Cash per run |
| --- | --- | --- | --- |
| Sedan | $3,500 | 65% | $35 |
| Low-rider | $5,000 | 100% | $65 |
| Van | $8,500 | 150% | $130 |

A run with too little cash for its fleet fee is refused at launch, like any other unaffordable action; a run already out is never stranded. The run preview shows the fee per vehicle and the fleet total.

A van carries the most but costs 4× a sedan to run, so fleet choice is a real trade-off.

### Repairs
Today repairs are cash only (damaged: sedan $500, low-rider $750, van $1,250; disabled: $1,400 / $2,000 / $3,400). With parts:

| Vehicle | Damaged | Disabled |
| --- | --- | --- |
| Sedan | 5 parts + $250 | 20 parts + $700 |
| Low-rider | 10 parts + $400 | 40 parts + $1,000 |
| Van | 20 parts + $700 | 80 parts + $1,700 |

- With parts, a repair costs less than today's cash price (a damaged van: 20 × $8 + $700 = $860 vs $1,250).
- **Without parts** a repair still works at 1.5× today's cash price and takes longer. Nobody is ever stuck in the garage.
- Existing garage discounts (Auto Garage, Road Saints MC) apply to the cash part only.

### Upgrades
Parts also pay for upgrades. Guns and vehicles become individual items with their own mod slots; see [Armory & Garage](ROADMAP-ARMORY-GARAGE.md) for mods, tiers and costs.

### Buying parts
Sold at Charlie's alongside vehicles, in bulk:

| Pack | Parts | Price | Per part |
| --- | --- | --- | --- |
| Box | 10 | $100 | $10 |
| Crate | 100 | $800 | $8 |
| Pallet | 1,000 | $7,000 | $7 |

Daily stock on the existing restock clock (proposal: 2,000 parts).

### Other sources
The chop shop (strip your own disabled vehicles: sedan 10, low-rider 15, van 30 parts), encounters, and territory yields (industrial districts, Detroit).

## Slices

### Slice A — Data and catalog (implemented)
- `ammo` and `vehicleParts` on `RoundPlayer`, plus store stock/timestamp columns on the existing restock pattern.
- Ruleset catalog: rounds per gun, pack sizes and prices, defender floor, loot share, parts per repair.
- The foundation ruleset keeps the feature disabled; the next version enables inventory and storefront behavior. Combat and garage use arrive in later slices. Older pinned rulesets are unchanged.

### Slice B — Buying, selling, display (implemented)
- Tommy's ammo packs, 25% sell-back, and a 25,000-round daily shelf using the existing restock clock.
- Ammo and parts shown in the inventory and header. Charlie's parts packs remain in Slice E with garage service.

### Slice C — Combat (implemented)
- Standard raids in the new 2.4.0-D ruleset spend ammo. The 2.4.0-C store ruleset stays store-only, preserving its free-firing combat behavior.
- Ammo allocation funds the strongest guns first; unfunded fighters contribute thug strength only. Defenders receive the free round floor, while attackers can cap paid ammo per raid.
- A winning attacker takes the configured share of the defender's post-fight ammo. Ammo balances, spend, loot, and losses are persisted with the raid result and action idempotency.
- The raid planner uses the same allocator as combat to show expected rounds and strength with available, full, and zero ammo. Raid receipts show rounds spent, defender-floor rounds, ammo looted, and inventory remaining.
- Engine tests cover allocation, floor, cap, loot, and preview consistency. `npm run qa:ammo-combat` runs repeatable 2.4.0-D ammo cases and reports win rate, ammo spend, and loot; the configured rates remain proposals for further beta tuning.

### Slice D — Everywhere else guns fire (implemented)
- Drive-bys and special raids, convoy escort encounters, local turf claims, outpost establishment, turf pushes, and street-gang fight-back choices use the shared ammo allocator.
- Block-war fights allocate each participating player's ammo independently, including the holder's posted corner crew and the defender floor; rounds spent are stored with the fight result.
- Boss-trip hits fund the attacker when dispatched, consume the trip owner's ammo for the bodyguard side when a fight lands, and refund the attacker if the boss has escaped or no bodyguard fight occurs.

### Slice E — Parts and garage (implemented)
- 2.4.0-E charges a per-run cash fee at launch ($35 sedan, $65 low-rider, $130 van); fleet fee is previewed separately from run cash and market purchases.
- Repairs/recovery can spend parts plus discounted cash, or cost 1.5× the existing cash price and one turn per vehicle. Disabled vehicles can be stripped for parts.
- Charlie sells parts boxes, crates, and pallets from a 2,000-part daily shelf.
- `npm run qa:vehicles -- --ruleset classic-og-v2.4-e` simulates fleet viability with the new fee included.

### Slice F — Territory, balance and rollout (implemented)
- 2.4.0-F adds Chicago ammo and Detroit parts to territory caches, plus optional ammo/parts access tolls deposited into the holder's cache. Collection respects player inventory capacity; overflow remains cached.
- `/rounds/:roundId/ammo-parts` reports round inventory totals, empty stocks, players below one armed-squad reserve, and recent combat ammo consumption.
- Low-ammo notices are emitted once when an action or logged combat receipt crosses below the currently armed squad's one-fight reserve, and follow the player's Orders notification preference.
- `npm run qa:ammo-season` produces a reproducible month projection for attacker and defender ammo budgets from sampled combat spend, calls out the free new-player defender floor, and states the activity-rate assumptions. Tune with `--attacks-per-day`, `--defenses-per-day`, `--days`, and `--seed`.
- New rounds use the F ruleset by default, while existing rounds remain pinned to their current ruleset. Territory perks/yields remain controlled by each round's existing `territoryPerksEnabled` rollout flag.

### Slice G — Balance, abuse hardening and release checks (implemented)
- `npm run qa:ammo-release -- 25000` stress-simulates 100,000 fights across the ammo fixtures and fails on ammo creation/loss, negative balances, stock overspend, attacker-cap violations, nondeterministic replay, a broken empty-player defender floor, or incorrect historical/default ruleset pins.
- `npm run qa:ammo-season -- --samples 10000 --quiet` is part of the standard release checks, alongside the existing vehicle balance gate, so ammo replacement costs and parts-enabled fleet choices are checked together before release.
- The standard `qa:release` gate now runs both ammo/parts checks. Database transaction retry behavior remains covered by the combat and territory integration suites when run with `--with-db`.
- Slice G adds QA only. It does not change balances, inventory, or already pinned rounds.

## Guardrails
- Ammo is never needed to finish the tutorial or a story quest.
- No purchased ammo or parts with Crowns or Supporter perks.
- Combat math stays deterministic; ammo spend is idempotent on retry.
- Old rounds are never changed.
