# StreetsEmpire v1.1.0 — Businesses, Fronts & Rackets

## Brainstorm

**Status:** brainstorm only. Nothing here is decided or built. Everything is *(proposed)*
until a simulation pass backs it, the same way 0.6.0 Turf started.

**Target base:** StreetsEmpire v1.0.0  
**Theme (from [ROADMAP-FUTURE.md](ROADMAP-FUTURE.md)):** move from controlling street corners
to controlling legitimate-looking operations.  
**Core loop:** acquire → operate → upgrade → protect → profit.

---

## The question

Two ways to put businesses on the map:

1. **Free placement.** You own a block, then pick any of the ten businesses and build it
   there.
2. **Predestined lots.** Every block already has business lots, and each lot can only hold
   certain businesses. Controlling the block gives you access to them, and you still build
   and upgrade them. A captured block keeps its businesses at a lower return until
   **war fatigue** wears off, unless someone razes them or the old holder sabotages them
   on the way out.

## Recommendation: predestined lots, built by players, kept through capture

Go with option 2, with one change: lots are predestined but start **empty**. Nothing is
pre-built, so a block's value comes from the crews that invested in it, not from the round
seed.

### Why not free placement

- **It erases block identity.** 0.6.0 made each block a district (Casino, Nightclub, Low
  Rent, Urban Ghetto, Wino Slums) with its own pay, tax and locals. If any block can hold
  any business, every crew builds whatever the best business is on every block, and the
  meta settles on one or two business types.
- **It separates businesses from Turf.** With fixed lots, *which block you fight for* is
  tied to *which business you want*. Want a Chop Shop? You need an Urban Ghetto. That
  gives the 40-block map new reasons to fight.
- **Blocks can't be read before a fight.** With fixed lots, anyone can look at the city map
  and see what a block could become and what is already built there. That's what makes a
  push worth planning.

### Why not pre-built

- **It's passive income.** The future roadmap's guardrail is that businesses must need
  active choices rather than act as infinite-income buildings. A block that comes
  pre-built pays whoever gets there first for doing nothing.
- **Nobody sinks anything into it.** Building and upgrading is the seasonal cash sink that
  gives a block's owner something to lose.

### Why keeping businesses through capture is right

- It makes built-up blocks **worth taking** instead of worth razing, so Turf Wars become
  about conquest rather than denial.
- It keeps the 0.6.0-C rule that **"nothing is looted but the block itself"**: you take the
  businesses, not the cash.
- **War fatigue** stops a capture from being an instant jackpot and makes blocks that change
  hands a lot pay badly for everyone. Stable holders earn the most.

---

## Lots

### Three lots per block *(proposed)*

Every block has three lots, set by its district. All ten businesses appear somewhere, and
most appear in two districts, so no business is locked to a single block per city.

| District | Lot 1 | Lot 2 | Lot 3 |
|---|---|---|---|
| **Casino** | Casino Front | Bar | Pawn Shop |
| **Nightclub** | Nightclub | Strip Club | Bar |
| **Low Rent** | Laundromat | Convenience Store | Auto Garage |
| **Urban Ghetto** | Chop Shop | Convenience Store | Warehouse |
| **Wino Slums** | Pawn Shop | Warehouse | Laundromat |

That's 120 lots across 40 blocks. With the 0.6.0 caps (two blocks at home, one away), one
crew can operate at most nine businesses.

### City signatures *(proposed)*

Each city gives one business type a signature bonus to output, or to its racket, so the
same Nightclub is worth more in some cities than others:

| City | Signature | Why |
|---|---|---|
| Las Vegas | Casino Front | The casino town |
| Miami Beach | Nightclub | Ecstasy market (already tight in 0.5.0) |
| Detroit | Chop Shop | Toughest locals, best parts |
| Los Angeles | Auto Garage | Low-Rider town, run chokepoint |
| Seattle | Warehouse | Port, shipment capacity |
| Atlanta | Strip Club | Nightlife capital |
| New York City | Laundromat | Where the money gets washed |
| Beverly Hills | Pawn Shop | Luxury fencing |

---

## Acquire → operate → upgrade → protect → profit

### Acquire

- You can only build on a lot while you **hold its block** with a corner crew (0.6.0-B).
- **Build cost:** cash plus turns. Level 1 opens the business. It is a cash sink, like
  Hideout rooms.
- **Locked while shielded?** Probably no build or upgrade in the first hours after a
  capture, so a crew can't take a block and immediately stack upgrades inside the shield.

### Operate (the anti-passive rule)

- **Staff.** Each business needs staff taken from home, like corner crews: thugs for
  most, girls for the Strip Club. Staffed workers don't work the street, defend or cook.
  That is the opportunity cost, the same shape as 0.6.0 corners.
- **Supply.** Businesses burn beer and/or product under a new **BUSINESS** supply job (next
  to the 0.4.0 supply jobs and 0.6.0's CORNER). If supply runs short, output stops.
- **The register fills up.** Income builds up in the business's register and **caps at
  about a day's worth**. Anything past the cap is lost. You have to come back and collect.
  - At home: collect from the Hideout / City Blocks page for a small turn cost.
  - At an outpost: the register empties into the **outpost box**, and a run has to collect
    it, the 0.6.0-D pattern. That gives convoys a richer target.
- Everything **settles lazily** from timestamps, the same as turf tax, upkeep and runs.

### Upgrade

- Levels 1–5 *(proposed)*. Each level raises output, register cap and racket strength, and
  costs more staff and supply.
- Upgrade cost grows steeply. Level 5 should be a late-season goal, not a first-week build.

### Protect

- Businesses sit on the block, so **the block's corner crew is their defense**. No new
  combat system: a push on the block is a push on its businesses.
- Lookouts (0.7.0-C) give warning of a push, the same as today.

### Profit

- Each business has a **front income**: steady, low-Heat, modest.
- Each business can run **one racket** at a time (see below). Rackets pay more or give a
  system bonus, and they add Heat.

---

## Businesses and rackets

The rackets below are a first list. A racket can be switched, with a cooldown so it isn't
a per-action toggle.

| Business | Front income | Racket A | Racket B |
|---|---|---|---|
| **Nightclub** | High nightlife income | **Ecstasy demand:** better ecstasy sales in that city | **Information network:** earlier push and convoy sightings in town |
| **Bar** | Steady, low | **Back-room cards:** small cash, low Heat | **Loose lips:** cheap recon on crews in that city |
| **Strip Club** | Girls' earnings boost | **VIP room:** high cash, high Heat | **Pillow talk:** intel on raids aimed at you |
| **Chop Shop** | Vehicle parts | **Stolen Low-Riders:** cheaper Low-Riders | **Vehicle recovery:** chance to recover a vehicle lost on a run |
| **Pawn Shop** | Buys junk | **Fencing:** better sell prices for guns and gear | **Loan sharking:** cash, Heat, needs collecting |
| **Auto Garage** | Repairs | **Run mods:** better escort/road stats on runs | **Getaway cars:** better odds a losing push squad makes it home |
| **Convenience Store** | Low, very steady | **Beer supply:** cheaper beer for upkeep | **Counter sales:** small product retail without street turns |
| **Warehouse** | Storage fee | **Product storage:** extra protected product (on top of Safe Room) | **Shipment capacity:** bigger loads on runs out of this city |
| **Casino Front** | House take | **The house always wins:** big cash, big Heat | **Laundering:** convert cash with lower Heat |
| **Laundromat** | Low, clean | **Laundering:** limited laundering (daily cap) | **Wash & fold:** lowers Heat from your other businesses in the city |

**Guardrails on rackets:**

- No racket beats paid recon, the Safe Room or the Garage at what those already do. It
  stacks a little on top (the same rule as 0.6.0-E's "the corner sees less than paid recon").
- Laundering is capped per day and per round. It must never become a way to dodge the Heat
  system coming in 1.3.

---

## Capture, war fatigue, raze and sabotage

### Capture keeps the businesses

When a push takes a block (0.6.0-C), every business on it **changes hands with its level
intact**. The new holder has to staff and supply it; the old staff go home wounded with the
corner crew.

### War fatigue

War fatigue is a **per-block** meter, not per-player, because it's the neighborhood that
got shot up.

- **On capture:** the block's fatigue jumps high. Businesses there run at a reduced
  multiplier, e.g. **40% output**, recovering steadily to 100% over about **2–3 days**.
- **Every push adds some,** win or lose. A defended push still scares customers off, so
  the holder feels it too.
- **It stacks.** A block that changes hands again before recovering starts from a worse
  floor. Contested blocks pay badly for everyone. Stable blocks pay best.
- **Upgrades still allowed,** but maybe at a markup while fatigue is high, so crews can
  rebuild but capturing isn't a shortcut to cheap levels.
- **Shown on the map:** "Miami Nightclub — fatigue 60%, recovering (full in ~31h)".

### Raze (attacker's choice)

A winning attacker picks one:

1. **Take it** (default): the block and businesses at their fatigued rate.
2. **Shake it down:** take the register cash (capped, the same shape as 0.6.0-D outpost
   loot), which pushes fatigue even higher.
3. **Raze it:** drop one or more businesses **1–2 levels** (never below level 0).
   For crews at their block cap, or who only want to deny a rival. Costs the attacker Heat.
   Razing gives the attacker no cash. It only takes value away.

Should a raze let the attacker skip holding the block? That's open. A raze-and-walk option
would make razing very strong, so the proposal is that the attacker must still take the
block.

### Self-sabotage (holder's choice)

A holder who sees a push coming (Lookouts) can **torch** a business during the warning
window:

- It drops 1–2 levels (or to level 0).
- The holder gets a **small salvage** (e.g. 20% of the lost level's build cost), paid now.
- It costs turns and adds Heat to the holder.
- It must **start before the window closes.** A last-second torch doesn't count.
- A torched block still carries its fatigue for the attacker.

That gives a losing holder a real choice: **fight, torch, or pull out and hope to take it
back**.

### When a block goes back to the locals

- If a block falls to the locals (abandoned, the 6-hour vacant window from 0.6.0-C, or a
  crackdown), its businesses go **dormant**.
- Dormant businesses **lose a level every few days**.
- The locals **grow stronger** on a built-up block, because they're running the businesses
  now. A block with a lot built on it is worth more and harder to take back.

### Abuse guards

- **Linked accounts:** capturing from a linked account resets the businesses to level 0.
  An alt can't build for a main.
- **Allies:** allies can't push each other's blocks. A block passed between allies has to
  go through the locals, and the businesses decay while it sits there.
- **Crackdown (0.6.0-F):** a seeded Fed sweep should hit businesses running rackets harder
  than front-only businesses, so rackets carry a late-season risk.

---

## Net worth

**Proposal:** business levels **do not count** toward net worth. They're a cash sink, like
the Hideout. Only the income they produce counts. That keeps the 0.6.0 rule that "net
worth still wins the round" honest. Capturing a built block gives you an income stream,
not an instant jump on the leaderboard.

---

## Stages (sketch, following the 0.6.0 pattern)

| Stage | Deliverable | Gate |
|---|---|---|
| **1.1.0-A — Lots** | `business` block in the ruleset (lots per district, city signatures, levels, costs, staff, supply, register caps, fatigue curve); `Business` row per round/block/lot; city map shows lots; `qa:business` simulation. | A 1.1.0-A round plays exactly like 1.0. Every business is worth building for some crew; none pays more than its staff would earn at home. |
| **1.1.0-B — Build & operate** | Build/upgrade, staffing, BUSINESS supply job, register and collection, front income, receipts and ledger lines. | Cash, staff and supply are conserved; staff never work, defend or cook; registers never exceed their cap. |
| **1.1.0-C — Rackets** | One racket per business, switching cooldown, Heat, system hooks (recon, runs, stores, product). | No racket beats the system it hooks; laundering stays under its caps. |
| **1.1.0-D — Capture & fatigue** | Businesses transfer on push, war fatigue meter, take / shake down / raze, torch during the warning window, dormancy under locals. | Captured income stays below a stable holder's; a block can't be farmed by repeated hand-offs; linked-account captures reset. |
| **1.1.0-E — Outposts & convoys** | Away businesses empty into the outpost box; collection runs; convoy loot shape. | Everything a run collects is conserved; convoy loot stays in 0.6.0-D caps. |
| **1.1.0-F — Release** | Full-round simulation (business-heavy, turf-raider, runner, mixed), crackdown interaction, Rules page Business panel, phone pass, release regression. | Mixed play beats pure business play; 0.6.0-F and later release gates still pass. |

---

## Open questions

1. **Three lots per block, or two?** Three gives more choice. Two keeps nine businesses
   max down to six and is easier to balance.
2. **Fatigue numbers.** Starting multiplier (40%?), recovery time (48–72h?), how much a
   failed push adds, and how stacking works.
3. **Raze without holding.** Can an attacker raze and leave, or must they take the block?
4. **Salvage on torch.** Is any salvage fine, or does it turn torching into a cash-out
   exploit near the end of the round?
5. **Dormant decay rate** and how much stronger locals get per business level.
6. **Staff type.** Thugs everywhere, or girls for Strip Club / Nightclub / Bar?
7. **Net worth.** Confirm business levels stay out of net worth.
8. **1.3 hook.** How much of racket Heat should wait for the Law Enforcement expansion?

## Not in 1.1.0

- Free placement of any business on any block.
- Pre-built businesses at round start.
- Businesses outside the 40 turf blocks (e.g. at the Hideout).
- Player-to-player sale or transfer of businesses.
- Casino games (1.2).
