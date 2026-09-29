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
  war worth planning.

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

### Three lots per block (decided)

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

- Businesses sit on the block, so **the block's corner crew is their defense**. Taking a
  player's block is a **block war** (see below), built from the existing push fight rather
  than a new combat engine.
- Lookouts (0.7.0-C) give warning when a war is declared, the same as a push today.

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
| **Auto Garage** | Repairs | **Run mods:** better escort/road stats on runs | **Getaway cars:** better odds a beaten siege squad makes it home |
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

## Taking blocks: locals vs. block wars (EU-style)

Grand strategy games like Europa Universalis split *occupying* a place from *owning* it.
You win battles, besiege it and hold it, but ownership only changes when the war ends.
Conquered land comes with its buildings, but it's devastated and has low control, so it
takes time to pay off. That maps well onto blocks with businesses on them.

### Two kinds of fight *(proposed)*

| Held by | How you take it | Why |
|---|---|---|
| **The locals** | **Send troops.** The 0.6.0-B claim stays a single fight: presence plus a squad that beats the locals' corner. | The locals don't log in, don't build and have nothing to lose. A quick claim keeps the early game moving. |
| **A player** | **Block war.** A contest over hours with several fights and a siege, replacing the single 0.6.0-C push in 1.1 rulesets. | A player has invested in the businesses and deserves time to respond, whatever time zone they're in. |

Older pinned rulesets keep the single push unchanged.

### How a block war runs

1. **Declare.** The attacker needs presence on the block (0.6.0-B), spends turns and picks a
   **war goal**: **Take** or **Sack** (see below). The holder sees the declaration through
   Lookouts on the same warning clock as a push today. The Street Wire announces it.
2. **Open with a fight.** The first battle lands when the warning window closes, the
   0.6.0-C push fight: attacker squad vs. corner crew, with backup from home and allies
   from **both sides** (see *Calling allies*).
3. **Siege.** If the attacker wins, their squad **occupies the block**. The holder still
   owns it, but:
   - a **Control** meter ticks from 0 toward 100 each hour, faster when the squad outnumbers
     whatever the holder has left nearby;
   - the holder's registers **stop filling**. Nobody spends money on a block under siege;
   - **devastation** (war fatigue) builds every hour the siege lasts.
4. **Break the siege.** The holder and their allies can hit the occupying squad
   at any time. A win lifts the siege, knocks Control back, and sends the attacker's squad
   home wounded. The attacker can try again after a cooldown, within the war's time limit.
5. **End.** The war ends when one of these happens:
   - **Control hits 100:** the attacker wins and gets their war goal.
   - **Time runs out** (e.g. 48h) or the attacker withdraws: the holder wins and the
     attacker gets a long cooldown on that block.
   - **The holder concedes:** the attacker gets their goal right away, with less
     devastation than a finished siege. That's the EU "peace deal". It saves the
     businesses from a long siege.
6. **Truce.** Afterwards the block gets a truce (the 0.6.0-C hold shield) so it can't be
   hit again right away.

### Calling allies (decided: both sides)

Both the attacker and the holder can call their alliance into a block war. Wars become
alliance-sized, which gives alliances a shared objective (a gap noted in 0.6.0).

- **Who can answer:** alliance members who live in that city or hold an outpost there.
  Linked accounts can't answer each other's calls.
- **When:** at the opening fight, to join or relieve a siege, and in any fight to break
  one.
- **Will they show?** Every ally's help uses the 0.3.0-D / 0.6.0-C **chance to show up**,
  at the **same odds on both sides**. Help is large but uncertain, which keeps swing.
- **Outpost allies show up less (decided).** Allies who live in the city use the base
  show-up chance (0.6.0-C's configured 50%). Allies who only hold an outpost there use a
  lower chance: **half the base (25%)**. Their help comes from
  their outpost's corner crew, not from home, so answering a call leaves their outpost
  weaker.
- **Committed like a squad:** ally thugs leave their own home while they fight or sit in
  the siege, so their homes are weaker to raids. On a loss they go home wounded, the same
  as the caller's squad.
- **On the attacker's side,** allies in the siege make Control tick faster. **On the
  holder's side,** allies count toward breaking the siege.
- **Spoils go to the declarer only.** A Take gives the block to the crew that declared, and
  Sack loot is capped and paid once, not per ally. Allies get Territory block-time and
  city control (0.6.0-E), not cash.
- **Cap on help (decided: 1×).** Each side's allied thugs are capped at **1×** the
  caller's own committed thugs, so allies can at most double a side's strength. The bigger
  alliance doesn't win just by having more members, and a crew still has to commit its
  own thugs to get help.
- **Residents count first (decided).** When the allies who show up bring more than the
  1× cap, help from allies who live in the city fills the cap first. Outpost allies only
  fill what's left, and their extra thugs stay at their outposts.

### War goals: answering "raze and walk away?"

**Yes, but only as a war goal, never from a single hit.** An attacker can't win one
fight, smash the businesses and leave. They have to win the whole war.

| War goal | Needs a free block slot? | Winner gets | Holder keeps |
|---|---|---|---|
| **Take** | Yes | The block and every business at its current level, with devastation from the war | Nothing on that block. Surviving corner crew and staff go home wounded. |
| **Sack** | No | Capped loot from the registers (0.6.0-D outpost-loot shape) and Heat. Every business loses 1 level. | The block, heavily devastated, with a long truce to rebuild. |

- **Sack** is the denial option for crews at their block cap, or who just want to hurt a
  rival. It costs a full war and Heat, and the victim keeps the block.
- **Take** is conquest. The businesses don't lose levels, but devastation means they pay
  poorly for days.

### Block tiers (EU settlement rank) *(proposed)*

A block's **tier** grows while it's held without interruption and while its businesses
are levelled. The tier decides how many lots are open:

| Tier | Lots open | Reached by |
|---|---|---|
| **Foothold** | 1 | Claiming the block |
| **Established** | 2 | Holding it about a day, with business levels invested |
| **Stronghold** | 3 | Holding it several days, with high total business levels |

- A **Take drops the block one tier** (decided). A Stronghold becomes Established, an
  Established becomes a Foothold, and a Foothold stays a Foothold. Businesses on closed lots keep their levels but go
  dark until the new holder raises the tier again. Conquest gives you the buildings, but
  not the whole operation right away.
- A **Sack** doesn't change the tier. The holder keeps the structure and loses levels.
- This makes it expensive to snowball by grabbing the richest blocks: long, quiet holding
  is how a block reaches its full value.

### Control by distance (EU proximity) *(proposed)*

Away blocks (0.6.0-D outposts) are harder to run: their businesses top out at a lower
share of output (e.g. **75%**) than the same business at home. Holding an empire across
cities is possible, but home turf pays best.

### War fatigue (devastation)

War fatigue is a **per-block** meter, not per-player, because it's the neighborhood that
got shot up.

- **It builds during the war.** Every fight adds some, and every hour of siege adds more.
  A war the holder won still leaves the block shaken.
- **After a Take:** businesses restart at a low multiplier, e.g. **40% output**, recovering
  to 100% over about **2–3 days**. A quick concession means a higher starting point.
- **It stacks.** A block that's fought over again before it recovers starts from a worse
  floor. Contested blocks pay badly for everyone. Stable blocks pay best.
- **Upgrades still allowed,** maybe at a markup while fatigue is high, so crews can rebuild
  but capturing isn't a shortcut to cheap levels.
- **Shown on the map:** "Miami Nightclub — fatigue 60%, recovering (full in ~31h)".

### Self-sabotage (holder's choice)

During a block war, a holder who expects to lose can **torch** a business:

- It drops 1–2 levels (or to level 0).
- The holder gets a **small salvage** (e.g. 20% of the lost level's build cost), paid now.
- It costs turns and adds Heat to the holder.
- It takes time and must **finish before Control hits 100**. A last-second torch doesn't
  count.
- A torched block still carries its devastation for the attacker.

That gives a losing holder real choices: **fight, break the siege, concede early to limit
the damage, or torch it**.

### When a block goes back to the locals

- If a block falls to the locals (abandoned, the 6-hour vacant window from 0.6.0-C, or a
  crackdown), its businesses go **dormant**.
- Dormant businesses **lose a level every few days**.
- The locals **grow stronger** on a built-up block, because they're running the businesses
  now. A block with a lot built on it is worth more and harder to take back.

### Abuse guards

- **Linked accounts:** capturing from a linked account resets the businesses to level 0.
  An alt can't build for a main.
- **Allies:** allies can't declare block wars on each other. A block passed between allies has to
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
| **1.1.0-D — Block wars** | Locals claim stays a single fight; block wars against players (declare, siege, Control, break the siege, concede, truce); Take / Sack war goals; block tiers; devastation; torching; dormancy under locals; Street Wire / Discord war lines. | A war always settles by its time limit, whoever is online; a defender who responds wins at a healthy rate; attacker win rate stays in band for solo vs. solo, alliance vs. solo and alliance vs. alliance; allied help never pays spoils to anyone but the declarer; captured income stays below a stable holder's; a block can't be farmed by repeated hand-offs; linked-account captures reset. |
| **1.1.0-E — Outposts & convoys** | Away businesses empty into the outpost box; collection runs; convoy loot shape. | Everything a run collects is conserved; convoy loot stays in 0.6.0-D caps. |
| **1.1.0-F — Release** | Full-round simulation (business-heavy, turf-raider, runner, mixed), crackdown interaction, Rules page Business panel, phone pass, release regression. | Mixed play beats pure business play; 0.6.0-F and later release gates still pass. |

---

## Open questions

1. **Fatigue numbers.** Starting multiplier (40%?), recovery time (48–72h?), how much a
   failed siege adds, and how stacking works.
2. **Block war timings.** Warning window, siege tick rate, war time limit (48h?), cooldown
   after a failed siege, and truce length.
3. **Block tiers.** Hold times and business-level thresholds for each tier.
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
- Block wars against locals. The locals are always a single claim fight.
