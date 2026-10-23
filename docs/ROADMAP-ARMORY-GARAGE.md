# StreetsEmpire — Armory & Garage Roadmap (individual guns and vehicles)

Status: **Slices A–G implemented** · Target: **beta** · Builds on: [Ammo & Parts](ROADMAP-AMMO-PARTS.md) · Scope: gun store, Charlie's, combat, runs, garage, the Drop, Territory Rewards.

## Vision
Every gun and every vehicle is its own item. It has a model, a name, a condition, mods, a look and a history. A player's AK isn't "one of 12 AK-47s": it's *Widowmaker*, scoped, extended mag, 41 fights, taken off a rival in Detroit.

Today guns and vehicles are counts on `RoundPlayer` (`pistols`, `ak47s`, `lowRiders`, `damagedVans`...). Rounds pinned to older rulesets keep counts. New rulesets switch to individual items.

All numbers are proposals to tune in simulation.

## The item model

### Guns (`PlayerGun`)
| Field | Meaning |
| --- | --- |
| `model` | PISTOL, SHOTGUN, TEC9, AK47 |
| `name` | Optional player nickname |
| `condition` | 0–100. Falls with use; low condition lowers power and raises jam chance |
| `mods` | One mod per slot, each with a tier |
| `lookKey` | Optional Drop weapon look (cosmetic only) |
| `origin` | Bought, looted (from whom), found, reward |
| `stats` | Fights, rounds fired, wins |
| `status` | READY, BROKEN (condition 0), LOCKED (equipped on an escort or posted) |

### Vehicles (`PlayerVehicle`)
| Field | Meaning |
| --- | --- |
| `model` | SEDAN, LOW_RIDER, VAN |
| `name`, `plate` | Nickname and a generated plate |
| `status` | READY, DAMAGED, DISABLED, ON_RUN. Replaces the `damaged*` / `disabled*` counts |
| `condition` | 0–100. Falls a little each run; low condition raises the chance of trouble |
| `mods` | One mod per slot, each with a tier |
| `lookKey` | Optional Drop vehicle look (cosmetic only) |
| `origin`, `stats` | Bought, recovered, looted; runs, miles, busts survived |

## Customization

### Mod slots
Bigger items get more slots, and every mod costs **parts + cash**, scaled by size.

| Gun | Slots | | Vehicle | Slots |
| --- | --- | --- | --- | --- |
| Pistol | 2 | | Sedan | 2 |
| Shotgun | 3 | | Low-rider | 3 |
| TEC-9 | 3 | | Van | 4 |
| AK-47 | 4 | | | |

### Gun mods (tiers 1 / 2 / 3)
| Mod | Effect |
| --- | --- |
| Barrel | +3% / +6% / +10% gun power |
| Scope | +2% / +4% / +7% gun power, AK-47 and shotgun only |
| Extended mag | −10% / −20% / −30% jam chance |
| Compensator | −5% / −10% / −15% rounds per fight |
| Suppressor | −5% / −10% / −15% heat from fights this gun fires in (capped per fight) |
| Reinforced frame | −20% / −35% / −50% condition loss |

One mod per slot, one of each mod type per gun. Mods are tuned so a fully modded pistol never beats a stock shotgun: model order stays the main power ladder.

### Vehicle mods (tiers 1 / 2 / 3)
Replaces the per-class upgrades in the Ammo & Parts doc; each vehicle is modded on its own.

| Mod | Effect |
| --- | --- |
| Cargo | +5% / +10% / +15% cargo |
| Armor | −10% / −20% / −30% chance of turning Damaged or Disabled |
| Engine | −5% / −10% / −15% travel time |
| Hidden compartments | −5% / −10% / −15% police stop chance (shares a −25% cap with Auto Garage Run mods) |
| Fuel tank | −10% / −20% / −30% run fee |

### Cost per mod (parts + cash)
| Size | Tier 1 | Tier 2 | Tier 3 |
| --- | --- | --- | --- |
| Pistol / Sedan | 5 + $100 | 15 + $300 | 40 + $900 |
| Shotgun / TEC-9 / Low-rider | 10 + $200 | 30 + $600 | 80 + $1,800 |
| AK-47 / Van | 20 + $400 | 60 + $1,200 | 160 + $3,600 |

Mods can be removed for half their parts back. **Mods belong to the item, not the player:** when a gun or vehicle is robbed or taken, its mods go with it (see *When items change hands*).

### Looks and names
- Players can name any gun or vehicle (filtered by the existing profanity rules).
- Drop weapon and vehicle looks (e.g. *Quarter Mile Sedan*, *Winter Heist Van*) apply per item and are **cosmetic only**, never stats.
- Named items show in combat and run receipts ("*Widowmaker* fired 180 rounds").

## Wear, repair and ammo
- **Guns:** each fight costs condition (proposal: −2 for pistols up to −4 for AK-47s). Below 50 condition, power drops and jam chance rises; at 0 the gun is BROKEN until repaired with parts at the gun store. Jammed guns fight unarmed for that fight but still spend their rounds.
- **Vehicles:** each run costs a little condition; the existing Damaged/Disabled outcomes are now per vehicle. Repairs use the parts + cash table in the Ammo & Parts doc.
- **Ammo:** spent per gun, using that gun's rounds per fight after mods. The biggest-guns-first allocation now goes gun by gun, best effective power first.

## Combat and runs with individual items
- **Auto-equip:** fighters take guns best-first (effective power after mods and condition). Players never assign guns by hand unless they want to.
- **Favourites and reserves:** a player can mark guns as *favourite* (always equipped first) or *reserve* (never equipped, never lootable unless the armory is overrun).
- **Loot:** a winning attacker takes specific guns, not counts, chosen at random from the defender's non-reserve guns. See *When items change hands*.
- **Runs:** the player picks vehicles for a run, or uses *auto-fleet* (best cargo per run fee). Trouble hits a specific vehicle, the most visible first, as now.
- **No trading or selling between players.** Items move between players only through combat loot, as with the 3.0 "no member/property trades" rule. Selling back to stores works as now.

## When items change hands
A robbed or taken gun or ride goes to its new owner **exactly as it was**: model, every mod and tier, condition, name and history. The upgrades you paid for are now theirs.

### Ways an item gets taken
| How | What moves |
| --- | --- |
| Raid / attack won | Specific guns from the loser's non-reserve armory, as loot |
| Ride theft (the existing Low-Rider steal move) | One specific vehicle, now of any model, chosen from the target's READY vehicles not on a run |
| Run hit / convoy loss | A vehicle on the run, plus guns on its armed escort |
| Encounter gang steal (`STEAL_RIDE` and similar) | The item goes to the NPC gang; the encounter's follow-up can win it back before it expires, otherwise it is gone |

### What travels with it
- **Mods and tiers:** all of them. The new owner gets full use straight away.
- **Condition, name, plate, history:** kept. History gains "taken from X in City". The new owner can rename it.
- **Drop look:** does **not** travel. A look bought with Crowns is the buyer's entitlement, so the item shows its stock look for the new owner and the original owner can put the look on another item.
- **Favourite / reserve flags:** cleared.

### Hot items
- A taken item is **hot** for 24 hours. While hot, the new owner can use it but cannot strip its mods or sell it.
- That gives the victim a window to take it back: when the victim wins a fight against the holder, loot picks **their own stolen items first**.
- After 24 hours the item is clean. The holder can keep it, strip its mods at the chop shop for half their parts, or sell it to a store at the **stock price only**. Mods never sell for cash, so robbery can't launder upgrades into money.

### Notifications
- The victim is told exactly what was taken ("*Widowmaker*, AK-47, barrel 3 / scope 2 / comp 1, taken by X") and when it stops being hot.
- The thief sees the item's full spec in their receipt.


A player with 600 pistols has to stay comfortable:
- **Stacks:** identical, unmodified, unnamed, full-condition items show as one stack ("212 × Pistol"). Customizing one splits it out.
- **Bulk actions:** select by filter (model, condition, mods) and repair, mod, sell, rename-prefix or mark reserve in one action with one combined cost.
- **Builds:** save a mod build ("Street AK: barrel 2, scope 2, comp 1") and apply it to N matching guns at once.
- Sort and filter by power, condition, mods, name and origin; search by name.

## Storage and performance
- From the player's view everything is individual. In storage, an untouched stack may be one row with a `quantity`, split into individual rows the first time any item in it is customized, damaged or looted. This keeps a 600-pistol player at a few rows until they actually customize.
- Hard caps per round player (proposal: 2,000 guns, 100 vehicles), so a stuck or abusive account can't grow without bound.
- Combat and run settlement read an aggregate per effective-stats group (model + mods + condition band) rather than looping 600 rows, and lock the player's armory in one transaction.
- A per-player armory summary (total power, counts by model, condition bands) is kept in step transactionally for headers and rankings.

## Guardrails
- Mods never change casino odds and are never sold for Crowns or Supporter perks; Drop looks are cosmetic only.
- Model order stays the main power ladder; mod bonuses are capped per item and per fight.
- No item carries over between rounds. Permanent memory is cosmetic: a round's most famous named gun or vehicle can go on the profile and in the round aftermath.
- Loot, mod, repair and bulk actions are idempotent on retry and audited.
- Old rounds keep count-based guns and vehicles unchanged.

## Slices

### Slice A — Item tables and catalog (implemented)
- `PlayerGun` and `PlayerVehicle` with stack rows, caps and armory summary. Ruleset catalog: slots, mods, tiers, costs, wear.
- New ruleset flag switches buying, selling and the starting kit to items. Old rulesets untouched.

### Slice B — Armory and garage screens (implemented)
- Stacked list, filters, sort, search, naming, favourites/reserves, bulk select. Phone and desktop.

### Slice C — Mods and builds (implemented)
- Install or replace item mods with the catalog's tier costs, remove mods for half their parts cost, save model-specific builds, and apply a build across selected stacks. Each action returns a parts/cash receipt.

### Slice D — Combat with items (implemented)
- Best-first auto-equip, per-gun ammo and wear, jams, named items in receipts. Rerun combat simulations.
- Item-aware combat covers raids, drive-bys, special raids, turf claims and pushes, block wars, boss hits and bodyguard defenses, convoy fights, and street-gang encounters. Queued fights reserve the selected guns, settle wear on landing, and release them without wear if the fight escapes or is cancelled before combat.
- Item loot that moves mods, condition and history; hot window; victim's-own-items-first recovery; Drop look stays with its buyer.

### Slice E — Runs and vehicles with items (implemented)
- Runs accept named vehicle selections or an auto-fleet; selected items are reserved while away. Individual condition, damaged/disabled status, repairs and scrap stay attached to the vehicle. Cargo, fuel, engine, hidden-compartment and armor mods affect run settlement and risk.
- Player ride theft, convoy run losses and street-gang theft/recovery move specific vehicles with their mods and history; stolen items lose their Drop look, remain hot for 24 hours and return through their actual recovery path.
- Reran the vehicle simulation against the current individual-item ruleset.

### Slice F — Looks, history and aftermath (implemented)
- Apply an owned Drop collection look to each named gun or vehicle independently. The item keeps its look when it is customized or moved; theft clears it because the Drop look belongs to its buyer.
- Keep an item event timeline for acquisition, naming, looks, mods, combat, runs, repairs, theft and recovery. The armory and garage show each item’s timeline.
- Feature one named item on the account profile across rounds. Freeze the top ten named-item records into the round aftermath report so history survives the round reset.

### Slice G — Performance, abuse and rollout (implemented)
- Cap-sized inventories are exercised by the bounded admin inspector test (2,000 rows per equipment class); combat and economic mutations already run inside transactions that lock player rows before reads, so parallel bulk actions and loot against one victim serialize. Combat action IDs replay once under concurrent retries.
- Admin player inspector at `/game/admin/players/:roundPlayerId/armory` shows a bounded item inventory and the latest 250 item-history events. It is read-only; staff corrections continue through audited correction tools.
- Rollout is opt-in at round scheduling: admin ruleset choices explicitly mark versions with Individual Armory, and only rounds created with those pinned versions use item equipment. Existing rounds remain on their original rulesets.
