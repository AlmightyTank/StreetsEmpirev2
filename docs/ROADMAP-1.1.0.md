# StreetsEmpire v1.1.0 — Businesses, Fronts & Rackets

## Brainstorm

**Status:** 1.1.0-A through F are built. The pinned release ruleset is
`classic-og-v1.1-f`; the sections below keep the design rationale and implementation notes
for every slice.

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

### Foot traffic *(added by the 1.1.0-A simulation)*

The same business earns more on a richer block: a Bar on the Casino strip out-earns one in
the slums. The first simulation pass showed this is needed, not just flavor. On the Casino
strip a thug covers the fewest girls, so staffing a business there costs a crew the most
street income, and without the extra income no Casino lot paid for its staff.

| District | Income multiplier |
|---|---|
| Casino | 1.5 |
| Nightclub | 1.25 |
| Low Rent | 1.0 |
| Urban Ghetto | 1.0 |
| Wino Slums | 0.8 |

Even so, Casino lots are a late-crew build: a mid crew's thugs earn more covering girls on
the strip, so its best businesses are on its Nightclub block.

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

- **Staff (decided).** Each business needs staff taken from home, like corner crews:
  **girls for the Strip Club only, thugs for every other business**. Girls keep their own
  job everywhere else. Staffed workers don't work the street, defend or cook.
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
   0.6.0-C push fight: attacker squad vs. corner crew, with backup from home and **one ally
   per side** (see *Calling allies*).
3. **Siege.** If the attacker wins, their squad **occupies the block**. The holder still
   owns it, but:
   - a **Control** meter ticks from 0 toward 100 each hour, faster when the squad outnumbers
     whatever the holder has left nearby;
   - the holder's registers **stop filling**. Nobody spends money on a block under siege;
   - **devastation** (war fatigue) builds every hour the siege lasts.
4. **Break the siege.** The holder (with their ally, if one answers) can hit the occupying
   squad at any time. A break attempt lands after a short muster window so an ally can
   answer the call. A win lifts the siege, knocks Control back, and sends the attacker's squad
   home wounded. The attacker can try again after a cooldown, within the war's time limit.
5. **End.** The war ends when one of these happens:
   - **Control hits 100:** the attacker wins and gets their war goal.
   - **Time runs out** (48 hours) or the attacker withdraws: the holder wins and the
     attacker gets a long cooldown on that block.
   - **The holder concedes:** the attacker gets their goal right away, with less
     devastation than a finished siege. That's the EU "peace deal". It saves the
     businesses from a long siege.
6. **Truce.** Afterwards the block gets a truce (the 0.6.0-C hold shield) so it can't be
   hit again right away.

### Calling allies (decided: one ally per side, online and answering)

Each side can bring **one** alliance member into a block war, and only a member who is
**online and answers the call**. Help never shows up on its own. A war is the declarer and
the holder, plus at most one ally each.

This replaces the 0.6.0-C "chance to show up" for block wars. The uncertainty no longer
comes from a dice roll; it comes from whether a real ally is around and willing. Older
pinned rulesets keep the 0.6.0-C push rules unchanged.

- **Who can answer:** alliance members who live in that city or hold an outpost there.
  Linked accounts can't answer each other's calls.
- **How a call works:** the caller sends a call for help to every eligible member. It
  shows in-game and as a notification (0.9.0-G). The **first member to accept** takes the
  side's ally slot. If nobody accepts before the fight lands, the side fights alone.
- **One slot per side, for the whole war:** once a member has taken the slot, nobody else
  from that alliance can join that side. The ally still has to **accept again for each
  later fight**. If they aren't online, the side fights alone that time.
- **Response windows:**
  - **Opening fight:** until the 30-minute declaration warning ends.
  - **Break attempt:** the holder starts it, and it lands after a **15-minute muster
    window**.
  - **Joining a siege (attacker's ally):** the call stays open **15 minutes**. Once the
    ally accepts, their thugs join the occupying squad.
- **One war at a time as an ally (decided):** a crew can be the ally in only one active
  war. One strong player can't answer every call in the city.
- **Outpost allies** fight with their outpost's corner crew, not thugs from home, so
  answering a call leaves their outpost weaker.
- **Committed like a squad:** ally thugs leave their own home (or outpost) while they fight
  or sit in the siege, so those are weaker to raids. On a loss they go home wounded, the
  same as the caller's squad.
- **On the attacker's side,** the ally in the siege makes Control tick faster. **On the
  holder's side,** the ally counts toward breaking the siege.
- **The ally gets a cut the caller sets (decided).** When sending the call, the caller
  (declarer or holder) sets the **ally's share of the winnings as a percentage**. The share
  is shown on the call, so a member knows the deal before accepting. Once someone accepts,
  the caller can raise the share but not lower it.
  - **What counts as winnings** (cash only; the block and its businesses always stay with
    the caller):

    | Outcome | Winnings that get split |
    |---|---|
    | Attacker wins a **Sack** | The capped register loot |
    | Attacker wins a **Take** | The captured block's business income during the 24-hour truce |
    | Holder **wins the defense** | The block's business income during the 24-hour truce |
    | Side **loses** | Nothing. The ally's cut is a share of winnings, not a fee. |

  - **Range (decided): 0–50%, in steps of 10%.** The cap stops a crew routing a
    whole war's take to a friend, since 0.6.0 doesn't allow player-to-player transfers.
  - **Only if they fought:** the ally gets the cut only if they fought in at least one of
    the war's fights. Taking the slot and then staying offline pays nothing.
  - **Where it lands:** a home ally is paid at home. An outpost ally's one-time Sack cut
    lands in that outpost's box, so a run has to collect it. Ongoing truce-income cuts keep
    D's direct-cash settlement path for both ally types.
  - **Receipts:** both crews' receipts and ledgers (0.7.0-F) show the split.
  - The ally still gets Territory block-time and city control (0.6.0-E) for fighting.
- **Cap on help (decided): matched to the declarer.** On **either side**, an ally can send
  at most as many thugs as **the crew that declared the war** has committed to it. Anything
  beyond that stays home.
  - The attacker's ally can at most double the attack, and the declarer still has to
    commit thugs to get help.
  - The holder's ally can match the attack in full, even if the holder's own corner crew is
    small. A small holder with a friend online can stand up to a big declarer.
  - If the declarer sends more thugs later (to reinforce the siege), the cap rises with
    them.
- **Stretching thin is allowed (decided).** A crew can declare its own war and be the ally
  in one other war at the same time. Thugs committed to one war can't be used in the other,
  and every thug out fighting is one less defending home, so a crew in two wars is an easy
  raid target.

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
- **After a Take:** businesses restart at a low multiplier, about **36% output** after a
  full siege, recovering to 100% in about **2 days**. A quick concession means a higher
  starting point. See *First-pass numbers*.
- **It stacks.** A block that's fought over again before it recovers starts from a worse
  floor. Contested blocks pay badly for everyone. Stable blocks pay best.
- **Upgrades still allowed,** maybe at a markup while fatigue is high, so crews can rebuild
  but capturing isn't a shortcut to cheap levels.
- **Shown on the map:** "Miami Nightclub — fatigue 60%, recovering (full in ~31h)".

### Self-sabotage (holder's choice)

During a block war, a holder who expects to lose can **torch** a business:

- It drops 1–2 levels (or to level 0).
- The holder gets a **salvage of 20%** of the lost levels' build cost, paid now (decided).
- It costs turns and adds Heat to the holder.
- It takes time and must **finish before Control hits 100**. A last-second torch doesn't
  count.
- A torched block still carries its devastation for the attacker.
- **No torching in the round's final 48 hours** (decided). That's from the seeded Fed
  sweep (0.6.0-F) to round close, so torching can't be used as an end-of-season cash-out.

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

## First-pass numbers *(proposed)*

These are starting values for the `business` ruleset block. They're built around the 0.6.0
turf numbers already shipping (`classic-og-v0.6-a`): a 28-day round, an 8-minute push
warning, a 6-hour hold shield, a 4-hour attacker cooldown, locals reclaiming a vacant corner
after 6 hours and regrowing 0.5 thugs an hour. The 1.1.0-A `qa:business` simulation checks
them; it doesn't pick them from scratch.

### Block war timings

| Setting | Value | Why |
|---|---|---|
| Declare cost | **12 turns** | A 0.6.0 push is 8. A war is a bigger commitment. |
| Wars per crew | **1 declared + 1 as an ally** at a time | Stops one crew declaring on every block in a city, while letting it stretch thin to help a friend. |
| Warning before the opening fight | **30 minutes** | A push is 8 minutes. 30 gives each side's ally time to answer the call, while the siege gives the real response time. |
| Muster window for a break attempt | **15 minutes** | Lets the holder's ally answer before the fight lands. |
| Ally call to join a siege | **open 15 minutes** | Same window for the attacker's ally. |
| Siege length (0 → 100 Control) | **12 hours** base, down to **8 hours** with full allied help | A holder who sleeps 8 hours wakes up to a siege that isn't finished (about 67 Control) and can still break it. |
| Siege speed-up from the ally | Control rate × (1 + 0.5 × allied share), where allied share = ally thugs ÷ declarer's thugs (max 1) | An ally at the full cap makes the siege 1.5× faster. |
| Breaking the siege | **−40 Control**, attacker squad home wounded | Hurts, but doesn't reset the war. |
| Re-siege cooldown | **4 hours** | Reuses the 0.6.0 attacker cooldown. |
| War time limit | **48 hours** from declaration | Room for one full siege plus a couple of retries, across two nights for both sides. |
| Truce after a Take or a won defense | **24 hours** | Replaces the 6-hour push shield for wars. |
| Truce after a Sack | **72 hours** | The victim gets time to rebuild. |
| Attacker cooldown on that block after losing | **72 hours** | Losing a war should cost more than losing a push. |

**What the timings allow:** 48 hours of war plus a 24-hour truce means one block can be
fought over at most about twice a week. The 0.6.0-F simulation already assumes a visible
holder draws about 2 serious pushes a week, so this doesn't add to the pressure on holders.

### War fatigue (devastation)

Fatigue is a 0–100 meter per block. **Business output = 100% − fatigue**, and fatigue is
capped at **80**, so a business always makes at least 20%.

| Event | Fatigue |
|---|---|
| Any fight on the block (win or lose) | **+10** |
| Each hour of siege | **+2** |
| War ends in a Take | **+30** |
| War ends in a concession | **+15** instead of +30 |
| War ends in a Sack | **+40** |
| Recovery while no war is active | **−1.25 per hour** |
| Recovery if the block changed hands twice in 7 days | **−0.75 per hour** (scarred) |
| Upgrades while fatigue is above 40 | **+25% cost** |

Worked examples:

| Outcome | Fatigue | Output right after | Back to 100% in |
|---|---|---|---|
| Full siege, then Take | 64 | 36% | ~51 hours |
| Holder concedes 6 hours into the siege | 37 | 63% | ~30 hours |
| Holder breaks the siege 6 hours in and wins | 32 | 68% | ~26 hours |
| Full siege, then Sack | 74 | 26% | ~59 hours |
| Block fought over again a day after a Take | 80 (cap) | 20% | ~64 hours, longer if scarred |

**Flipping doesn't pay:** the 0.6.0-F simulation assumes a turf raider keeps a won block
for about 1.5 days. Over those 36 hours a captured block averages about **58% output**, and
it has one lot fewer because of the tier drop. So a flipped block earns well under half of
what a stable holder's does.

### Tier thresholds

The hold clock runs while you hold the block, pauses while it's under siege, and restarts
after a Take.

| Tier | Lots open | Hold time | Business levels needed |
|---|---|---|---|
| **Foothold** | 1 | On claim | — |
| **Established** | 2 | **24 hours** | Business on lot 1 at level **2+** |
| **Stronghold** | 3 | **96 hours** (4 days) | Total levels on lots 1–2 of **6+** (e.g. 3 + 3) |

- **After a Take (one tier down):** the new holder's clock starts from the lower tier's
  threshold. A Stronghold taken becomes Established, and it needs another **72 hours**
  (96 − 24) of holding to be a Stronghold again. That lines up with fatigue recovery: a
  conquered block is back to full value after about 3 days of quiet.
- **Pace:** a crew that claims a block on day 1 can have a Stronghold by day 5–6 of a
  28-day round, if it keeps investing. That makes Strongholds a mid-season goal.

### Decay under the locals

| Setting | Value | Why |
|---|---|---|
| Vacant window before the locals take over | **6 hours** | Unchanged from 0.6.0-C. |
| Grace period after the locals take over | **24 hours**, no level loss | Covers a crew that lost its corner overnight. |
| Tier on takeover | **drops one tier** right away, and falls to **Foothold** after 72 hours | Same as a Take, so abandoning a block is never better than losing it. |
| Level loss after the grace period | **−1 level on every business every 48 hours** | A level-5 business is gone in about 9 days, a third of a round. |
| Extra locals strength | **+1 local thug per business level** on the block, capped at **+50%** of the district's base locals | A built-up block is harder to take from the locals, but still much easier than a full block war. |
| Locals regrow | **0.5 thugs per hour** toward the new maximum | Unchanged from 0.6.0-A. |
| Fatigue on a claim from the locals | **+10** (one fight) | Claiming is a single fight, not a war. |

Examples of the extra locals strength, before the city multiplier:
- Casino block, base 30 locals, 15 total levels → **+15 (capped)**, so 45.
- Wino Slums block, base 8 locals, 6 total levels → **+4 (capped)**, so 12.

**Abuse guard:** during the 24-hour grace period, if the last holder was linked to the
crew claiming the block, the businesses reset to level 0. A crew can't drop a block to the
locals for an alt to pick up.

### What `qa:business` must confirm

- **War outcomes:** attacker win rate stays in band for solo vs. solo, alliance vs. solo
  and alliance vs. alliance.
  - Ally help is no longer a dice roll. It depends on an ally being online and answering,
    and it can match the declarer's whole squad (0.6.0 pushes cap help at 25% of the
    defender). 0.3.0-D found
    that big, reliable help makes fights one-sided, so the simulation needs a
    **response-rate assumption** (how often an ally is online and answers, by time of
    day) and has to show wars stay swingy when both sides have an active ally.
- **Offline defenders:** a holder who responds within 8 hours of a declaration wins a
  healthy share of wars.
- **Flipping:** a captured block over 7 days earns less than the same block held stably.
- **Pace:** Stronghold timing lands mid-season, and decay under the locals clears an
  abandoned Stronghold before the round's last week.

---

## Net worth

**Decided:** business levels **do not count** toward net worth. They're a cash sink, like
the Hideout. Only the income they produce counts. That keeps the 0.6.0 rule that "net
worth still wins the round" honest. Capturing a built block gives you an income stream,
not an instant jump on the leaderboard.

---

## Stages (sketch, following the 0.6.0 pattern)

| Stage | Deliverable | Gate |
|---|---|---|
| **1.1.0-A — Lots** | `business` block in the ruleset (lots per district, city signatures, levels, costs, staff, supply, register caps, fatigue curve); `Business` row per round/block/lot; city map shows lots; `qa:business` simulation. | A 1.1.0-A round plays exactly like the ruleset it is built on. Every lot is worth building for some crew that can hold and staff it; no business grosses a street day, and a fully built home cap nets at most half of one after its staff. |
| **1.1.0-B — Build & operate** | Build/upgrade, staffing, BUSINESS supply job, register and collection, front income, receipts and ledger lines. | Cash, staff and supply are conserved; staff never work, defend or cook; registers never exceed their cap. |
| **1.1.0-C — Rackets** | One racket per business, switching cooldown, Heat, system hooks (recon, runs, stores, product). | No racket beats the system it hooks; laundering stays under its caps. |
| **1.1.0-D — Block wars** | Locals claim stays a single fight; block wars against players (declare, siege, Control, break the siege, concede, truce); Take / Sack war goals; block tiers; devastation; torching; dormancy under locals; Street Wire / Discord war lines. | A war always settles by its time limit, whoever is online; a defender who responds wins at a healthy rate; attacker win rate stays in band for solo vs. solo, alliance vs. solo and alliance vs. alliance; the ally's cut never exceeds the caller's chosen share or 50%, and is zero when the side loses or the ally never fought; captured income stays below a stable holder's; a block can't be farmed by repeated hand-offs; linked-account captures reset. |
| **1.1.0-E — Outposts & convoys** | Away businesses empty into the outpost box; collection runs; convoy loot shape. | Everything a run collects is conserved; convoy loot stays in 0.6.0-D caps. |
| **1.1.0-F — Release** | Full-round simulation (business-heavy, turf-raider, runner, mixed), crackdown interaction, Rules page Business panel, phone pass, release regression. | Mixed play beats pure business play; 0.6.0-F and later release gates still pass. |

### Built in A

- **Ruleset:** `classic-og-v1.1-a`, built on `classic-og-street-pass-a`, the latest
  shipping ruleset on `beta` (0.8.0-H plus Trips and the Street Pass). It adds a `business`
  block with every first-pass number in this doc, plus the catalog (staff, income and build
  cost per business) and foot traffic. Nothing reads it yet, and a test pins that only
  `meta` and `business` differ from street-pass-a.
- **Engine:** pure business calculations (`businessLots`, `businessIncomeCentsPerHour`,
  `businessStaff`, costs and upkeep, `blockTier`, `tierAfterTake`, `blockWarFatigue`,
  `fatigueAfter`, `siegeHoursToWin`, `allyThugCap`, `allyCutCents`, `dormantLevel`,
  `localsThugsWithBusinesses`, `torchResult`, `torchOpen`) and `businessRulesetProblems`,
  which also enforces the decisions above.
- **Simulation:** `runBusinessSimulation` and `businessGate` behind `npm run qa:business`.
  See [BUSINESS-SIMULATION-1.1.0-A.md](BUSINESS-SIMULATION-1.1.0-A.md).
- **Schema:** a `Business` row per round, block and lot (`kind`, `level`, starting empty),
  seeded lazily with the round's turf rows.
- **City Blocks:** each block card lists its three lots, their level ("Empty lot" in A)
  and the city's signature business (★).

**Catalog (level 1, before foot traffic and signature):**

| Business | Staff | Income/hour | Build |
|---|---|---|---|
| Casino Front | 2 thugs | $330 | $19,800 |
| Nightclub | 2 thugs | $265 | $15,900 |
| Strip Club | 4 girls | $250 | $15,000 |
| Chop Shop | 2 thugs | $185 | $11,100 |
| Auto Garage | 2 thugs | $165 | $9,900 |
| Pawn Shop | 1 thug | $135 | $8,100 |
| Warehouse | 1 thug | $125 | $7,500 |
| Bar | 1 thug | $125 | $7,500 |
| Laundromat | 1 thug | $85 | $5,100 |
| Convenience Store | 1 thug | $75 | $4,500 |

Each level multiplies income by 1, 1.8, 2.5, 3.1 and 3.6, and staff by 1, 1.5, 2, 2.5 and 3
(rounded up). The upgrade to each level costs 1, 1.25, 1.75, 2.5 and 3.5 times the build,
so level 5 costs ten builds in total.

**Not in A:** nothing can be built, staffed or collected yet (1.1.0-B), rackets (C), block
wars and fatigue in play (D), and outpost businesses (E). The `qa:business` gate is not
yet part of `qa:release`; it joins at 1.1.0-F, as turf did.

### Built in B

- **Ruleset:** `classic-og-v1.1-b` is 1.1.0-A with `business.building` on. Balance is A's,
  unchanged; a test pins that.
- **Build and upgrade** (`POST /game/business/build`): on a block the crew holds at home,
  on a lot its tier has opened. Costs the level's cash (Back Office ledger line
  `BUSINESS_BUILD`) and 6 turns, and staffs the business for the new level from home.
- **Staff (decided): still part of the crew.** Thugs, or girls for the Strip Club, stay
  in the crew's `thugs`/`whores` counts and net worth, so a crew cannot staff businesses
  and then recruit the same headroom again. They are marked as `businessThugs` /
  `businessWhores`, the way corner crews are `postedThugs`:
  - they are never fit thugs or working girls, so they **never work the street, defend or
    cook**, and a drive-by only hits girls on the block;
  - they **can still desert**: each settled hour, an unhappy crew's staff walk off with the
    ruleset's departure chance (each hour counts as `staffDepartureTurnsPerHour` = 5
    turns), leaving the business and the crew;
  - they **can still be lured**: a won Lure Crew raid takes the crew's working girls and
    standing thugs first, then business staff.
  - Any other loss that would leave more staff than crew sheds the difference from the
    businesses on the next settle.
- **Staffing (decided)** (`POST /game/business/staff` with `staff` and `autoStaff`):
  - a business takes **any number of staff up to its level's max** and earns in
    proportion, so a crew can **turn staff down to bring people home** and back up again
    (2 turns when the head count changes; 0 closes it, and the register stays collectable);
  - **auto-staff** (on by default, free to switch) replaces anyone who deserts or is lured,
    from the fit crew (or the girls working the street), up to the chosen number, on each
    settle. Off, a business stays short until the crew tops it up;
  - a new level comes fully staffed; the crew can turn it down afterwards.
- **Corner crews (decided)** follow the same rules from `classic-og-v1.1-b` on (the
  `turf.corner.desertTurnsPerHour` setting; older rulesets are unchanged): still the crew
  and its net worth, never working, defending or cooking, and now able to **desert** when
  the crew is unhappy (on top of the 0.6.0 supply walkouts) and to be **lured** after the
  standing thugs and business staff. A lured or deserting corner thug's gun stays with the
  crew (home arsenal); an outpost deserter takes it, as before; a corner left empty goes
  back to the locals.
- **Income and supply:** settled lazily on whole hours, next to corner upkeep, on every
  action and page read. Staff burn beer and product from home under a new **Business
  staff** (`BUSINESS`) supply job; an hour without supply earns nothing. Income fills the
  register up to its 24-hour cap.
- **Collect** (`POST /game/business/collect`, 2 turns): every register on the crew's home
  blocks into cash, as one `BUSINESS_INCOME` ledger line.
- **Losing a block:** on the old holder's next settle, staff come home and the uncollected
  register is lost. A new holder who opens the business first sends the old staff home
  straight away. (Shaking down a register in a war is 1.1.0-D.)
- **City Blocks:** each lot shows its level, income an hour, staff, register and the next
  level's cost, with Build/Upgrade and Open/Close buttons, and why a lot is locked ("Opens
  when the block is a Stronghold"). Home cities get a Collect bar with the total waiting.
- **Gate:** DB-backed tests check that cash, turns, staff and supply are spent exactly;
  that staff stay in the crew and its net worth but leave the fit crew; that registers
  fill only for supplied hours and stop at their cap; that short staffing earns in
  proportion and auto-staff refills; that an unhappy crew's staff and corner thugs desert
  and a happy crew's stay; that a lure takes staff off the business and keeps corners,
  counts and guns consistent; and that a lost or taken block sends staff home.

**Not in B:** businesses at outposts (E: an away block's staff come home for now), war
fatigue and the Take tier drop (D: a captured block restarts as a Foothold, from the push's
`heldSince`), dormancy and decay under the locals (D), and rackets (C).

### Built in C

- **Ruleset:** `classic-og-v1.1-c` is 1.1.0-B plus `business.rackets`: the catalog, the
  strength curve, the switch cost and cooldown, and the laundering caps. Nothing else moves;
  a test pins that. See [BUSINESS-SIMULATION-1.1.0-C.md](BUSINESS-SIMULATION-1.1.0-C.md).
- **One racket per business** (`POST /game/business/racket` with a racket key, or `null` to
  run the front alone): 2 turns, then **locked for 12 hours**. The first racket on a business
  never waits. Only a staffed business on a home block can run one; a business taken over by
  another crew (or left by its old one) starts with none.
- **Strength:** the level's share (50%, 62.5%, 75%, 87.5%, 100% for levels 1-5) times the
  staffing share, so turning staff down weakens the racket and closing the business stops it.
  Two businesses running the same racket don't stack: the crew gets the stronger one. The
  crew's live rackets are stored on the player (`racketEffects`) on every business settle
  and business action, so every system reads them without a query.
- **Heat:** each racket draws its Heat every settled hour, at its strength, landing on a
  balance that has cooled to the same hour (the settle runs the turn clock first). Heat still
  cools 12 points an hour; no racket alone out-heats that, but a home cap of cash rackets
  draws 17. **Wash & fold** takes 40% off the crew's other rackets' Heat.
- **Laundering** (Casino Front 4 Heat/h, Laundromat 2 Heat/h at full strength) washes Heat
  each settled hour, **paid from its own register** at 80% of the crew's bribe price per
  point, and only as far as the register can pay. Capped at **48 Heat a day** (UTC) and
  **480 a round** across all the crew's laundering (`launderedHeatToday`/`launderedHeatRound`).
- **Every racket** at full strength:

| Business | Racket | Does | Heat/h |
|---|---|---|---:|
| Nightclub | Ecstasy demand | Pip pays 8% more for ecstasy | 1 |
| Nightclub | Information network | +2 min heads-up on pushes on your blocks and tails on your runs (Lookouts give up to 4) | 0 |
| Bar | Back-room cards | +15% of front income | 1 |
| Bar | Loose lips | Recon in your city costs a turn less (never below 1) | 0 |
| Strip Club | VIP room | +35% of front income | 5 |
| Strip Club | Pillow talk | +4% home raid defense (Lookouts give up to 10%) | 1 |
| Chop Shop | Stolen Low-Riders | Low-Riders 8% cheaper at Charlie's | 2 |
| Chop Shop | Vehicle recovery | 40% less chance a convoy hit takes a Low-Rider off your run | 1 |
| Pawn Shop | Fencing | Tommy pays 10% more for guns you sell back | 2 |
| Pawn Shop | Loan sharking | +30% of front income | 3 |
| Auto Garage | Run mods | 15% fewer police stops on your runs | 0 |
| Auto Garage | Getaway cars | A beaten push squad takes 25% fewer wounds | 1 |
| Convenience Store | Beer supply | Beer 10% cheaper at the Corner Store | 0 |
| Convenience Store | Counter sales | Sells 6 product an hour at Pip's base price into the register, no turns | 2 |
| Warehouse | Product storage | +40 product sealed from raids (the Safe Room seals up to 100) | 1 |
| Warehouse | Shipment capacity | Each Low-Rider carries 10% more on your runs | 1 |
| Casino Front | The house always wins | +45% of front income | 7 |
| Casino Front | Laundering | Washes 4 Heat/h from the register | 0 |
| Laundromat | Laundering | Washes 2 Heat/h from the register | 0 |
| Laundromat | Wash & fold | 40% off your other rackets' Heat | 0 |

- **Cash rackets** pay into the register with the front, in proportion to staff and supply,
  and the register's 24-hour cap covers both. Counter sales stop when the register is full.
- **Hooks:** store and Pip quotes (on top of standing), the paid recon turn cost, Lookouts
  heads-up on pushes and convoy tails (alerts included), home raid defense, the Safe Room's
  sealed product, run capacity (launch and in-town buys), the road stop roll, the convoy
  hit's Low-Rider roll, and a losing push squad's wounds.
- **City Blocks:** each of your businesses shows its racket, strength, Heat and cash an hour,
  with buttons to run, switch or shut it and when the lock lifts; the Collect bar shows the
  Heat your rackets draw against the cool-down, and laundering used today and this round.
- **Gate:** `racketRulesetProblems` holds every guardrail above (no racket beats the system
  it hooks), `qa:business` checks cash rackets on a home cap stay under a street day and
  laundering stays under its caps, and DB-backed tests check the switch and its cooldown,
  strength following staff, cash and Heat into the register and onto the crew, Wash & fold,
  laundering against the register and both caps, counter sales, a store price hook, and a
  lost block clearing its racket.

**Not in C:** racket effects at outposts (E), shaking down a register or a racket in a war
(D), and racket Heat beyond today's Heat system (the 1.3 Law Enforcement expansion).

### Built in D

- **Ruleset:** `classic-og-v1.1-d` is 1.1.0-C with `business.wars.enabled`, plus a Sack's loot
  (half the registers, capped at the $50,000 outpost loot cap) and Heat (15), and a torch's
  Heat (10). A test pins that nothing else moves. See
  [BUSINESS-SIMULATION-1.1.0-D.md](BUSINESS-SIMULATION-1.1.0-D.md).
- **The locals are still one fight; a player's block is a war.** The 0.6.0-C push is turned
  off on player-held blocks (older rulesets keep it). A claim from the locals adds 10
  fatigue.
- **Declare** (`POST /game/block-war/declare`): a goal (Take or Sack), a squad (at least the
  corner minimum, armed, from home), 12 turns. Needs presence (or revenge); never on an ally,
  a linked account, a block under a truce, or a block already at war; one war declared at a
  time; 72 hours locked out of a block after losing a war on it; a Take needs a free block
  slot for the whole war. The holder hears at once (the war is public), and the opening fight
  lands 30 minutes later.
- **The fights** reuse the push fight: the declarer's squad (and ally) against the corner and
  whatever the holder (and ally) sent. The holder's side always fights on home ground, even
  when breaking a siege. Wounded thugs go home to recover as they are hurt; beaten corner
  thugs go home with their guns.
  - **Opening fight / re-assault** (`/defend` sends the holder's backup to it). Won: the
    squad occupies the block and the **siege** starts. Lost: the squad goes home, and the
    declarer can go again (`/assault`) after 4 hours; it lands after the 15-minute muster.
  - **Siege:** Control climbs 100 over 12 hours (8 with the attacker's ally at the cap); the
    block's registers stop filling and its hold clock pauses.
  - **Break** (`/break`): the holder hits the occupiers after the 15-minute muster. Won:
    Control -40, the occupiers go home, back to the re-assault cooldown.
- **The end:** Control 100 (the attacker gets the goal), a **concession** during the siege
  (`/concede`: the goal now, with +15 fatigue instead of +30), a **withdrawal** (`/withdraw`:
  the holder wins), or the **48-hour limit** (the holder wins). A block that changes hands
  some other way ends the war with nobody winning.
  - **Take:** the block and its businesses at their levels, a tier down (the clock starting
    at the lower tier's threshold); the declarer's survivors stay on as the corner crew; the
    old corner goes home wounded, the old staff come home and the registers are lost (B);
    a 24-hour truce. A capture from a linked account starts every business at level 0.
  - **Sack:** half the registers (capped) to the attacker, every business a level down, Heat
    on the attacker, a 72-hour truce; the holder keeps the block and its tier.
  - **Defended:** a 24-hour truce, and the hold clock picks up where the siege paused it.
  - **Fatigue** at the end is A's curve: +10 a fight, +2 a siege hour, +30 a Take, +15 a
    concession, +40 a Sack, capped at 80. It does not heal while a war is on.
- **Allies (decided, as built):** one per side for the whole war, and only a member who
  answers. The declarer or holder calls (`/call`) with a cut of 0-50% in steps of 10; the call
  is open until the coming fight lands (the attacker can also call into a siege for 15
  minutes); a cut can rise once taken, never fall. The first alliance member in that city to
  answer (`/answer`) takes the slot; they can be the ally in one war at a time; linked
  accounts cannot answer each other; they send at most the declarer's committed squad. The
  attacker's ally joins the assault or sits in the siege (speeding it up); the holder's ally
  answers each fight again.
  - **The cut:** a Sack's loot is split at once; after a Take or a defense, the ally takes the
    cut of the block's business income for the 24-hour truce, paid as it is earned. An ally on
    a losing side, or one who never fought, gets nothing.
- **Torch** (`POST /game/business/torch`, holder, during a war): 6 turns and 10 Heat; the
  business burns for 30 minutes, then drops 2 levels and pays 20% of their cost back. A Take
  that lands first catches it; closed in the round's final 48 hours.
- **Fatigue in play:** business income is (100 - fatigue)%; it heals 1.25 an hour (0.75 on a
  block that changed hands twice in 7 days); upgrades cost 25% more above 40.
- **Dormancy under the locals:** worked out from the block's hold history, so no release
  path had to change. After the 6-hour vacant window and 24 hours of grace, every business
  loses a level every 48 hours; the locals hold a built block with +1 thug per level (capped at
  +50% of the district's base); a claim brings the businesses back at their decayed levels
  and the block a tier down (a Foothold after 72 hours). The last holder, or a linked account,
  reclaiming it inside the grace period gets every business at level 0.
- **Settling:** wars settle lazily like pushes (on any participant's action or read, and a
  one-minute sweep), walking their events in time order: fights landing, torches finishing,
  Control reaching 100, the time limit. Only the holder and the block are written then;
  everyone else's thugs, guns, loot, cut and Heat come home through their own credit pass.
  The round's cutoff settles every war and ends what is left.
- **City Blocks:** a war panel on the block (goal, Control meter, the coming fight, what is
  committed, allies and their cut, open calls, burning torches) with every role's actions,
  a Declare form on rivals' blocks with the reason it is closed, Torch on the holder's
  businesses, the block's fatigue and dormancy. The Street Wire carries the alliance's wars
  and its open calls for help; the activity feed and the bell carry declarations, fights,
  endings, calls and torches; the public Discord street feed posts each declaration and
  each war's end once (who took, sacked or held the block, and how).
- **Gate:** `qa:business` runs whole wars against an online-rate model (see the simulation
  doc) and holds the swing bands; DB-backed tests check the declaration's costs and limits,
  the opening fight and siege, registers stopping under siege, a full siege's Take a tier
  down with the squad posted, a break and the time limit, the loser's lockout, the ally cap
  and slot, a Sack's split to an ally who fought, no cut for a losing side, the truce cut for
  a winning holder's ally, a concession, a torch's salvage, fatigue cutting income, dormant
  decay and the stronger locals, and the reset when a last holder reclaims a block.

**Not in D:** wars on outpost blocks and outpost allies (E: an outpost ally would fight with
its corner crew), push notifications for calls (the bell and the Street
Wire carry them), and a crackdown that hits racketeering businesses harder (F).

---

### 1.1.0-E — Outposts & convoys

- **Pinned ruleset:** `classic-og-v1.1-e` opts into outpost businesses without changing D.
- **Away operations:** a held away block needs the crew's 0.6.0-D outpost box. Its businesses
  use the existing **75% away output ceiling** and burn beer/product from that box rather
  than reaching into home stock.
- **Registers:** after settlement, an away register sweeps into the outpost cash box up to
  the existing cash cap. If the box is full, the remainder stays in the register; no money
  is wired home and no overflow is destroyed.
- **Collection runs:** the existing outpost transfer is the collection action. A run must
  physically be in that city to withdraw the box; withdrawn money becomes ordinary run
  cash, so the existing convoy hit/cooldown/loot rules apply without a second loot system.
- **Rackets:** away rackets use the same outpost supply. Counter sales consume product from
  the box, and their proceeds follow the same register-to-box route.
- **Outpost block wars:** D stays gated. E can fight over an outpost block; a successful
  Take deletes the old owner's box, removes its full value from their outpost net worth,
  and exposes only the existing 0.6.0-D capped loot share.
- **Outpost allies:** a called alliance member may qualify by living in the war city **or**
  holding an outpost there. A remote ally commits that outpost's posted corner crew/guns,
  weakening it while they fight. Survivors return to that corner; wounded thugs and their
  guns return home. A one-time Sack cut is queued into that outpost cash box under its
  normal cap; the existing post-war truce-income cut keeps D's direct cash payout semantics.
- **Compatibility:** B/C/D rounds keep their home-only business behavior and D cannot
  start an outpost block war. Direct `/business/collect` remains home-only even in E.
- **Gate:** tests pin D/E isolation and the 75% distance rule; PostgreSQL coverage pins
  register → outpost-box conservation, cap overflow, and home-supply isolation.

---

### 1.1.0-F — Release

- **Pinned ruleset:** `classic-og-v1.1-f` inherits E and adds one release-only interaction:
  each staffed racket still running in the city when the existing Federal turf sweep lands
  adds **8 Heat**. Front-only businesses keep the original 0.6.0-F crackdown behavior.
- **Counterplay:** the existing 24-hour warning is the choice. Shut a racket before the
  sweep and it adds no racket-specific Heat; keep it live and accept the added attention.
  F does not invent a second law system or seize register cash.
- **Full-round release model:** `qa:business` now phases businesses through a deterministic
  28-day pass for business-heavy, turf-raider, runner/outpost and mixed crews. Every profile
  uses the same economic unit; mixed play must finish above business-heavy play.
- **Release gate:** `qa:release` runs `qa:business` alongside the existing turf, travel,
  trips, Hideout, Store and whole-season checks, so the 1.1 economy cannot drift by itself.
- **Player rules:** the Rules page has a Businesses, Fronts & Rackets chapter covering fixed
  lots, staff opportunity cost, supplies/registers, outposts, rackets, wars and the F sweep.
- **Phone pass:** City Blocks collapses business action, racket and collection controls to
  single-column, full-width touch targets on phone widths. The strict UI audit remains the
  final browser/accessibility release gate.
- **Compatibility:** pre-F rounds never read the business crackdown rule; the pinned
  0.6.0-F corner-only sweep remains covered by its original unit regression.

---

## Open questions

1. **1.3 hook.** F adds only the seeded late-round racket pressure above. Broader police
   systems, warrants and recurring enforcement remain a 1.3 Law Enforcement expansion.

The fatigue, war timing, tier, decay and release numbers above are pinned by `qa:business`
for 1.1.0; later tuning should ship under a new ruleset id rather than mutating F.

## Not in 1.1.0

- Free placement of any business on any block.
- Pre-built businesses at round start.
- Businesses outside the 40 turf blocks (e.g. at the Hideout).
- Player-to-player sale or transfer of businesses. The ally's cut of war winnings is the
  only cash that moves between players, and it's capped.
- Casino games (1.2).
- Block wars against locals. The locals are always a single claim fight.


