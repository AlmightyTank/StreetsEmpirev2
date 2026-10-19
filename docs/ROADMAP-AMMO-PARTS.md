# StreetsEmpire — Ammo & Parts Roadmap

Status: **Planned** · Target: **beta** · Scope: Combat, armed escorts, encounters, turf defense, gun store, garage service, Territory Rewards.

## Vision
Guns stop being a one-time purchase. Every gun burns ammo every time it fires, and bigger guns burn a lot more of it. Ammo is cheap per round and sold in bulk, because players go through so much of it. Vehicles get a matching material, **parts**, for repairs.

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

- One generic stock, `parts`, used by the garage.
- **Repairs** take parts plus a reduced cash fee. Without parts a repair still works, at higher cash and longer time, so nobody is ever stuck.
- Proposal: damaged = 5 parts, disabled = 20 parts; low-rider ×1, sedan ×1.5, van ×2.
- **Sources:** small daily garage stock, the chop shop (strip your own disabled vehicles for parts), encounters, territory yields (industrial districts, Detroit).

## Slices

### Slice A — Data and catalog
- `ammo` and `vehicleParts` on `RoundPlayer`, plus store stock/timestamp columns on the existing restock pattern.
- Ruleset catalog: rounds per gun, pack sizes and prices, defender floor, loot share, parts per repair.
- Feature flag off; older rulesets unchanged.

### Slice B — Buying, selling, display
- Gun store packs, sell-back, restock. Ammo and parts shown in the inventory and header.

### Slice C — Combat
- Ammo allocation (biggest guns first), pistol-whip fallback, defender floor, attacker cap, loot share.
- Combat preview shows rounds to be spent and strength with and without enough ammo; receipts show rounds spent per side.
- Rerun combat simulations; tune rounds per gun and the defender floor.

### Slice D — Everywhere else guns fire
- Armed escorts, turf/outpost defense and encounter gunfights spend ammo through the same allocation code.

### Slice E — Parts and garage
- Repairs with and without parts; chop shop; vehicle simulation rerun.

### Slice F — Territory, balance and rollout
- Ammo and parts in territory yields and tolls.
- Full-season simulation: ammo spend per player per day, attacker vs. defender economy, new-player defense.
- Low-ammo notifications; admin diagnostics; staged opt-in on new rounds.

## Guardrails
- Ammo is never needed to finish the tutorial or a story quest.
- No purchased ammo or parts with Crowns or Supporter perks.
- Combat math stays deterministic; ammo spend is idempotent on retry.
- Old rounds are never changed.
