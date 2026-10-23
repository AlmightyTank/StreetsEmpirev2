# StreetsEmpire — Street Skills Roadmap (player skills)

Status: **Built on beta (`classic-og-v2.3-a`)** · Target: **beta** · Related: [Account levels](ACCOUNT-LEVELS.md) · [1.7.0 crew careers](ROADMAP-1.7.0.md) · [Territory Rewards](ROADMAP-TERRITORY-PERKS.md) · [Ammo & Parts](ROADMAP-AMMO-PARTS.md) · [Armory & Garage](ROADMAP-ARMORY-GARAGE.md)

## Vision
The boss gets better at what they actually do. A player who runs vans across the country every day becomes known for it; a player who lives in fights becomes the one rivals worry about. Street Skills give each player a recognizable style within a round, earned by playing, without becoming a stat-point RPG.

**The question:** What kind of boss am I this season?

The beta catalog contains six skills: Hustle, Muscle, Wheels, Fixer, Connections and Luck.

## Ground rules
1. **Per round, not permanent.** Skills live on the round player and reset every season. Account levels stay what [ACCOUNT-LEVELS.md](ACCOUNT-LEVELS.md) promises: they never add cash, strength or turns.
2. **Learn by doing.** Skill XP comes only from completed, server-settled actions. Waiting, retrying or cancelling earns nothing.
3. **Specialize, don't max.** A shared point cap means nobody can be best at everything.
4. **Small and legible.** Each bonus is small, capped, and shown on the receipt of the action it changed.
5. **Not a skill tree.** Five skills and three choices each. [1.7.0](ROADMAP-1.7.0.md) deferred deep branching trees; this stays inside that line.
6. **No paid power.** Skills, XP and respecs are never sold for Crowns, Supporter perks or real money.
7. **Old rounds unchanged.** Only new, versioned rulesets turn skills on.

## Boss skills vs. crew specialties
[1.7.0](ROADMAP-1.7.0.md) gives individual **crew members** specialties (combat aim, driving, scouting, dealing). Street Skills belong to the **boss** and change how the whole operation is run: costs, fees, heat, tolls, recovery. Where a boss skill and a crew specialty touch the same thing (e.g., Muscle and combat aim), they share one capped stacking category in the modifier resolver.

## The five skills

| Skill | Grows from | Identity |
| --- | --- | --- |
| **Hustle** | Earning from the crew, selling product, store sales, dealer income | The money-maker |
| **Muscle** | Attacks, defenses, raids, turf fights, encounter gunfights | The one nobody wants to fight |
| **Wheels** | Runs, boss trips, shipments, vehicle repairs and mods | The road boss |
| **Fixer** | Clean shifts, cooling heat, lawyers, cases, bribes | The one who never gets caught |
| **Connections** | Jobs & Contacts, supply orders, trader standing, tolls paid and collected | The one who knows everyone |
| **Luck** | Random encounters, loot and rare outcomes | The one who always gets the break |

### Earning skill XP
- Each settled action adds XP to its own skill, scaled by size (a 20-thug raid earns more than a 2-thug one), with a minimum so small players still progress.
- **Daily taper:** full XP up to a daily amount per skill, then half, then a quarter. Turn-dumping and bots can't race ahead; a steady daily player keeps up.
- **Late joiners:** XP is boosted for the first N days after joining a round (proposal: ×2 for 3 days, ×1.5 for 3 more).
- Losing still earns XP (proposal: half of a win), so players who are being hit still grow.

### Points and caps
- Skill XP turns into points on a rising curve. Proposal: **100 points total across all skills, at most 40 in any one.**
- Reaching 40 in two skills is a full build; a third skill can only be partly levelled. That's the specialization.
- Every point gives a small passive bonus in its skill (table below). Most of the interest is in the milestone choices.

### Passive bonuses (at 40 points, the cap)
All values are proposals.

| Skill | Passive at 40 |
| --- | --- |
| Hustle | +6% crew and store income |
| Muscle | −15% wounded thugs after a fight; −10% rounds per fight |
| Wheels | −15% run fees; −10% chance a vehicle turns Damaged |
| Fixer | −15% heat gained; heat cools 15% faster |
| Connections | −20% tolls paid on others' territory; +10% supply order discount |

Bonuses scale linearly from 0 to 40 points.

## Milestone choices
At **10, 25 and 40** points in a skill the player picks **one of two** perks. Choices are the build; the passive is the background.

| Skill | 10 | 25 | 40 |
| --- | --- | --- | --- |
| **Hustle** | *Sweet Talker* (crew happiness falls slower) or *Bulk Seller* (better price on large product sales) | *Front Man* (+business income) or *Street Credit* (better loan terms) | *Kingpin's Cut* (+cash from territory caches you collect) or *Untaxed* (store sell-back losses halved) |
| **Muscle** | *Hold the Line* (+defense strength) or *Hit First* (+attack strength) | *Steady Hands* (fewer gun jams, slower gun wear) or *Field Medic* (wounded thugs recover faster) | *Collector* (+loot share, including guns) or *Nobody Home* (−loot taken when you lose) |
| **Wheels** | *Light Foot* (−travel time) or *Packed Tight* (+cargo) | *Grease Monkey* (repairs use fewer parts) or *Low Profile* (fewer police stops) | *Wheelman* (vehicles on your runs can't be stolen by encounter gangs) or *Convoy Boss* (escort guns fight better on runs) |
| **Fixer** | *Clean Hands* (less heat from fights) or *Lawyered Up* (cheaper lawyers) | *Quiet Streets* (smaller evidence gain) or *Paper Trail* (cases close faster) | *Ghost* (taken items you hold stay hot only 12h instead of 24h) or *Tripwire* (your stolen items stay hot 36h, giving you longer to recover them) |
| **Connections** | *Regular* (trader standing grows faster) or *Plugged In* (one extra job offer a day) | *Toll Booth* (+tolls collected on your alliance's territory) or *Fast Pass* (non-holder access waits halved) | *Supplier's Friend* (larger supply restock) or *Inside Line* (see which rival holds each locked place, and their toll, from any city) |

Combat perks (*Hold the Line*, *Hit First*) are the smallest values in the catalog. Offensive perks also shrink when attacking a player far below your net worth, so skills never make farming new players easier.

## How skills link to the other roadmaps
- **Territory Rewards:** Connections lowers tolls you pay and raises tolls you collect; Hustle's *Kingpin's Cut* boosts collected cache cash; *Inside Line* shows locked places across cities.
- **Ammo & Parts:** Muscle lowers rounds per fight; Wheels lowers run fees and parts per repair.
- **Armory & Garage:** *Steady Hands* slows gun wear and jams; *Collector* / *Nobody Home* shift item loot; *Ghost* / *Tripwire* change the hot window on stolen guns and rides; *Wheelman* protects vehicles from encounter-gang theft.

## Respec
- Players can reset one skill's milestone choices for cash plus a cooldown (proposal: $25,000 × times respecced this round, 24h cooldown).
- Points themselves can't be moved: they come from what you did. A full reset is not offered.

## Stacking and caps
- Every skill effect has a typed effect ID and stacking category in the shared modifier resolver that Territory Rewards uses.
- Skills, crew specialties, territory perks, faction standing and item mods in the same category share one cap. Proposals: economy +12%, combat +8%, cost reductions −25%.
- Receipts list each source ("Wheels −15% · Fuel tank −10% · capped at −25%").

## Data model
A table mirroring `PlayerReputation`, scoped to the round player so it resets with the round:

```prisma
model PlayerSkill {
  id            String   @id @default(cuid())
  roundPlayerId String
  /// Ruleset skill key: HUSTLE, MUSCLE, WHEELS, FIXER, CONNECTIONS.
  skill         String
  xp            Int      @default(0)
  points        Int      @default(0)
  /// Milestone choices, e.g. { "10": "HIT_FIRST", "25": "STEADY_HANDS" }.
  choices       Json     @default("{}")
  /// Daily-taper window, like Account.turnXpWindowStartsAt.
  xpWindowStartsAt DateTime?
  xpInWindow    Int      @default(0)
  respecs       Int      @default(0)
  respecReadyAt DateTime?

  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  @@unique([roundPlayerId, skill])
  @@index([roundPlayerId])
}
```

The skill catalog (XP sources, curve, caps, passives, milestone perks, taper, catch-up, respec costs) lives in the ruleset.

## Slices

### Slice A — Tracking only
- `PlayerSkill` table and ruleset catalog. Award XP from settled actions with taper and catch-up.
- **No bonuses yet.** Measure XP rates on beta and tune the curve from real data.

**Gate:** XP is awarded once per settled action, never on retry; old rounds unchanged.

### Slice B — Passives and receipts
- Passive bonuses through the shared modifier resolver with category caps. Receipts name each source.

**Gate:** Caps hold with territory perks, crew specialties and item mods; simulations show no single build dominates.

### Slice C — Milestone choices and respec
- Choice screens at 10/25/40, respec with cost and cooldown, perks wired into combat, runs, law, supply and territory actions.

### Slice D — Skills screen and identity
- Skills page: points, next milestone, chosen perks, XP today vs. taper. Phone and desktop.
- Skill badges on the profile and alliance roster ("Wheels 40 · Fixer 32") so alliances can recruit for a mix.

### Slice E — Balance and rollout
- Full-season simulation across solo and alliance players, late joiners and heavy attackers. Abuse tests for XP farming. Admin skill inspector. Staged opt-in on new rounds.

## Built state (beta 2.5.0-A)
What the current beta ruleset does, where it differs from the original plan above. Earlier rounds keep their pinned 2.3.0-A catalog.

**Effects and caps.** Every live passive and perk is applied at the point it changes: store and product sale prices, scouting income, business income, loan fees, raid/drive-by/special-raid strength, wounds and loot, gun jams and wear, rounds per fight, fight Heat, Heat gained and cooled, wounded-thug recovery, run fees, run cargo and drive time, police stops, run vehicle damage, garage bills, convoy escorts, lawyers, evidence, case cooling, Job cash and standing, supply orders, territory tolls and cache collection, stolen-item recovery windows, and random encounters. Caps apply per effect category; Action receipts list only effects that action used.

**XP.** Raids, drive-bys and special raids pay Muscle XP to both sides, with the loser getting half. Trips, lawyers, officials, informants, cooking and scouting earn XP (Scouting feeds Luck). The 100-point total cap is enforced: once the other skills leave no room, a skill stops gaining points.

**Perks that changed from the plan, to fit systems in the game today:**
| Perk | Plan | Built |
| --- | --- | --- |
| Sweet Talker | Crew happiness falls slower | Your crew works as if 10 points happier |
| Grease Monkey | Repairs use fewer parts | Garage repairs and recoveries cost 20% less (until parts exist) |
| Plugged In | One extra job offer a day | Jobs pay 10% more cash |
| Supplier's Friend | Larger supply restock | Two more supply orders can wait for pickup at once |
| Wheelman | Protect run vehicles from encounter gangs | Street gangs never try to steal your ride |
| Muscle passive | Reduce rounds in a fight | 10% fewer rounds per equipped gun at 40 Muscle points |
| Wheels passive | Lower run fees | 15% lower vehicle run fees at 40 Wheels points |
| Steady Hands | Reduce gun jams and wear | Both jam chance and wear reduced by 20% |
| Kingpin's Cut | More cash from collected territory caches | 10% more cache cash, still bounded by daily territory yield caps |
| Toll Booth | Collect more tolls | 10% more toll cash when collecting territory caches, within the same daily caps |
| Ghost / Tripwire | Change the stolen-item recovery window | Ghost shortens it to 12 hours; Tripwire extends it to 36 hours. If both sides have one, their adjustments offset. |

**Waiting on unbuilt systems.** These show as "Coming with …" on the Skills page and cannot be chosen; the passives apply nothing:
- Territory access waits: Fast Pass. No non-holder access-wait mechanic exists yet.
- Remote territory intelligence: Inside Line. The distinct perk-gated view is not implemented yet.

Earlier round catalogs remain unchanged; the current beta catalog only unlocks these perks where their gameplay path exists.

**Curve.** The nth point costs n × 30 XP, so 10 points take 1,650 XP, 25 take 9,750 and 40 take 24,600. At the full-rate daily band (1,000 XP a skill) that is under 2 days, about 10 days and about 25 days: one maxed skill fits a 28-day round. A player who also uses the half-rate band reaches 40 in about 16 days. A skill's stored points catch up to the curve the next time it earns XP.

**Heat and cases.** Fixer's cooling applies everywhere Heat cools: actions, settles, business, boss-trip and block-war settlements. Paper Trail applies everywhere a Case is read, including the admin round-wide law report.

**Fights that resolve later.** Turf pushes, block-war assaults, defences and breaks, boss hits and convoy tails, and the backup sent to them, pay nothing at launch. When the fight resolves, every side is paid Muscle XP: winners in full, losers half, each player once per fight. Setup actions (claims, posts, declarations, calls, recon) still pay at launch.

## Out of scope
- Skills carried between rounds or granted by account level.
- Paid XP, paid respecs, or skill boosts in the Drop or Supporter perks.
- Casino odds changes from any skill.
- More than five skills or more than three choices per skill in this roadmap.
