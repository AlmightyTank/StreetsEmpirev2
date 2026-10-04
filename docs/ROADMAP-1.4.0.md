# StreetsEmpire v1.4.0 — Contracts, Factions & Underworld NPCs

## Brainstorm

**Status:** proposed roadmap.

**Target base:** StreetsEmpire v1.3.0  
**Theme (from [ROADMAP-FUTURE.md](ROADMAP-FUTURE.md)):** make each city's underworld feel
populated even outside player competition.  
**Core loop:** meet faction -> take contract -> pay risk -> earn standing -> unlock harder
choices.

---

## The question

1.4.0 answers:

> Who else runs these streets besides players?

The answer should not be a second game full of autonomous NPC empires. The answer should be a
faction and contract layer that gives existing systems human faces: the gangs that hold the
block, the suppliers behind Pip, the corrupt officials behind 1.3, the casino people behind Ace,
and the fixers who know how to introduce one side to another.

## Recommendation: quest givers belong to factions

Every quest giver should have a faction relationship. Most have a **primary faction**. Some can be
**faction-adjacent**, and a few can be **independent brokers**, but nobody should float outside the
underworld map without a reason.

This makes Jobs and contracts carry long-term consequences:

- helping Tommy is not just "Tommy reputation"; it also strengthens your relationship with The
  Outfit;
- helping Wheels can open Road Saints work and make vehicle contracts easier;
- helping Civic Handshake can lower pressure in the short term while hurting trust with crews
  that hate officials;
- helping a broker can buy introductions without making anyone fully trust you.

Faction standing should sit beside existing contact reputation, not replace it. Contacts remain
the personal face; factions are the wider political consequence.

---

## Design principles

1. **Factions are faces for existing systems.** Contracts should ask players to use Scout,
   Product, Combat, Travel, Turf, Businesses, Casino and 1.3 pressure systems instead of inventing
   unrelated chores.
2. **NPC content supplements PvP.** Contracts can create targets, opportunities and pressure, but
   should not become the safest optimal money source.
3. **Actual law is pressure, not a friendly faction.** 1.3's law enforcement system remains the
   outside force. Civic Handshake is the corrupt interface players can work through.
4. **Standing opens choices, not raw power.** Unlocks can include better contracts, information,
   introductions, discounts, limited pressure relief, titles and cosmetics. They should not grant
   permanent combat strength, turns or risk-free income.
5. **Rivalries matter.** A crew can be respected by everyone only at low levels. Deep allegiance
   should create tension with at least one other faction.
6. **Rulesets pin the faction catalog.** Older rounds do not gain faction behavior accidentally.

---

## Core factions

| Key | Faction | Identity | Main gameplay lane | Natural quest givers |
|---|---|---|---|---|
| `KINGS` | **The Kings** | street gangs, block bosses, neighborhood crews | Turf, raids, block wars, street reputation | Mama King, Blocks |
| `OUTFIT` | **The Outfit** | old-school organized crime, weapons, protection, business pressure | weapons, rackets, protection, intimidation | Tommy |
| `ROAD_SAINTS` | **Road Saints MC** | bikers, chop shops, convoy escorts, muscle on wheels | vehicles, travel, convoys, recovery | Wheels |
| `CARTEL_LINE` | **The Cartel Line** | product suppliers and wholesale distribution | Product, Pip prices, city supply, risky orders | Pip |
| `HARBOR_GHOSTS` | **Harbor Ghosts** | smugglers, dock crews, airport and port handlers | long-distance runs, hidden cargo, shipment contracts | Pip, Wheels, future handler |
| `CIVIC_HANDSHAKE` | **Civic Handshake** | corrupt officials, inspectors, clerks, lawyers and dirty cops | 1.3 pressure, bribes, warrants, permits, inspections | Vic or a new 1.3 contact |
| `VELVET_TABLE` | **The Velvet Table** | casino hosts, high rollers, financiers and back-room money | casino, comps, VIP access, markers | Ace |
| `QUIET_OFFICE` | **The Quiet Office** | fixers, brokers, accountants and information dealers | introductions, debts, secrets, faction diplomacy | new broker |

### First active set

The first 1.4 release should not ship all eight factions as full systems. Start with:

1. **The Kings**
2. **The Outfit**
3. **Road Saints MC**
4. **The Cartel Line**
5. **Civic Handshake**

Then add Harbor Ghosts for advanced travel/smuggling, Velvet Table for deeper casino work, and
Quiet Office once introductions and rivalries need a broker.

---

## Quest giver alignment

| Contact | Primary faction | Secondary relationships | Notes |
|---|---|---|---|
| Mama King | The Kings | respected by The Quiet Office | Street legitimacy and local protection. |
| Blocks | The Kings | tense with The Outfit | Block-by-block street control. |
| Tommy | The Outfit | trades with The Kings; tense with Road Saints MC | Guns, intimidation and protection money. |
| Pip | The Cartel Line | works with Harbor Ghosts | Product supply, shortages and wholesale orders. |
| Wheels | Road Saints MC | works with Harbor Ghosts; tense with The Outfit | Cars, roads, convoys and recovery. |
| Vic | Civic Handshake | quietly works with The Quiet Office | Heat, clean slates, warrants and favors around 1.3 pressure. |
| Ace | The Velvet Table | works with Civic Handshake | Casino access, VIP treatment, markers and comps. |
| New broker | The Quiet Office | knows everyone; trusted by nobody | Introductions, betrayals, debt settlement and faction diplomacy. |

### Relationship types

Each quest giver can be represented with:

- `primaryFactionKey`: the faction standing their normal Jobs affect;
- `friendlyFactionKeys`: factions that may give side credit or unlock introductions;
- `rivalFactionKeys`: factions that may dislike deep progress with this contact;
- `brokeredFactionKeys`: factions they can introduce without belonging to them.

This keeps existing contacts usable without pretending each one is a rigid faction officer.

---

## Rivalry web

Keep the rivalry graph readable:

| Rivalry | Reason |
|---|---|
| The Kings vs. The Outfit | street control vs. old-money control |
| Road Saints MC vs. The Outfit | chop-shop routes and vehicle work |
| The Cartel Line vs. Civic Handshake | product flow vs. enforcement pressure |
| Harbor Ghosts vs. Civic Handshake | smuggling vs. inspections |
| The Velvet Table vs. The Kings | polished money vs. street heat |
| The Quiet Office vs. everyone | brokers profit from trust but survive on leverage |

Rivalries should not hard-lock players out immediately. Early standing can stay flexible. High
standing, capstones and faction-exclusive contracts are where the tradeoffs begin.

---

## Contracts

Contracts are faction Jobs with rotating availability, explicit costs and durable receipts. They
should use existing action systems whenever possible.

| Contract lane | Examples | Cost/risk | Reward shape |
|---|---|---|---|
| Street | collect a debt, hit an NPC crew, hold a block | turns, wounds, Heat, retaliation | faction standing, cash below PvP value, titles |
| Product | supply an order, cover a shortage, move a package | product, road risk, police pressure | standing, price access, limited product opportunities |
| Travel | escort a courier, recover a car, cross a hot road | time, vehicles, bodyguards, road stops | standing, intel, vehicle discounts/recovery |
| Turf | pressure locals, defend a storefront, hold a block window | posted crew, block exposure, war risk | standing, block intel, faction favor |
| Business | protect a front, collect protection, settle a racket dispute | staff time, register exposure, Heat | standing, racket hooks, limited business boosts |
| Casino | arrange a private table, settle a marker, host a VIP | bankroll risk, travel, casino status | standing, cosmetics, access, comp-like perks |
| Civic | bury evidence, buy a warning, fix a permit, cool an inspection | cash, favors, rival standing loss | pressure relief, warning, warrant delay |
| Broker | introduction, truce talk, debt swap, secret tip | cash, reputation tradeoff, cooldown | access, information, relationship change |

### Contract guardrails

- Repeatable contracts should be capped by rotation, cooldown, inventory, city, faction standing
  or risk.
- Cash contracts must pay below strong player-facing strategies after costs and risk.
- Standing and cosmetics can be generous; money, product, turns and combat advantage must be
  conservative.
- Contracts cannot be completed by client-authored outcomes. Server receipts decide progress.
- A retried action ID never advances a contract twice.

---

## 1.3 integration

1.4.0 should build on 1.3 without swallowing it.

### Actual law enforcement

The 1.3 law system should remain systemic pressure: Heat, attention, evidence, warrants,
informants, investigations or whatever shape the final 1.3 branch takes.

### Civic Handshake

Civic Handshake is the underworld interface with that pressure:

- pay for warnings;
- delay or soften inspections;
- find corrupt paperwork;
- point heat at a rival through risky contracts;
- reduce evidence pressure within strict caps;
- create faction consequences for relying on officials too much.

Civic Handshake should never make law pressure ignorable. It sells counterplay, not immunity.

### Other factions and law pressure

- The Kings can hide you locally but draw attention through violence.
- The Outfit can protect businesses and witnesses but expects obedience.
- Road Saints can route around hot roads, not erase police.
- The Cartel Line can supply high-profit work that draws serious attention.
- Harbor Ghosts can move hidden cargo through ports and airports, with inspection risk.
- The Velvet Table can make money look respectable, but public casino action leaves a trail.
- The Quiet Office can bury one problem by creating another.

---

## Standing and unlocks

Faction standing should be seasonal like other competitive progression unless a reward is
explicitly cosmetic/permanent.

### Suggested tiers

| Tier | Meaning | Unlock style |
|---|---|---|
| Unknown | no relationship | public/basic contracts |
| Known | they have heard of you | basic board access, small flavor |
| Trusted | they will call you | better contracts, limited intel |
| Connected | they will vouch for you | introductions, faction events |
| Inner Circle | they risk something for you | capstone Jobs, cosmetics, rare contract lines |

### Unlock examples

- contract board slots;
- faction-specific one-time Jobs;
- introductions to another faction;
- title/profile cosmetics;
- minor price or fee nudges within existing guardrails;
- better information, earlier warnings or narrower recon;
- limited 1.3 counterplay with daily/round caps.

### What standing must not unlock

- turns;
- permanent cash flow with no action;
- direct combat stat boosts;
- unbounded Heat/evidence removal;
- free product loops;
- odds changes in casino games;
- private player-to-player transfers.

---

## Milestone overview

| Version | Theme | Outcome |
|---|---|---|
| **1.4.0-A** | Faction Catalog | Ruleset-pinned factions, quest giver affiliations and UI surfaces |
| **1.4.0-B** | Contract Board | Rotating faction contracts with durable progress and receipts |
| **1.4.0-C** | Faction Standing | Seasonal standing, tiers, relationship changes and rival effects |
| **1.4.0-D** | System Contracts | Product, travel, turf, business and 1.3-aware contract objectives |
| **1.4.0-E** | Rivalries & Introductions | Faction tensions, brokered introductions and tradeoffs |
| **1.4.0-F** | Underworld NPC Arcs | Named faction quest lines and capstones |
| **1.4.0-G** | Rewards & Public Flavor | Titles, profile cosmetics, achievements, activity and rules copy |
| **1.4.0-H** | Balance, Admin & Release | Simulations, admin review tools, UI audit and release gate |

---

## 1.4.0-A — Faction Catalog

### Objective

Make factions first-class ruleset content without changing balance yet.

### Scope

- Add the faction catalog to the ruleset.
- Add primary/secondary faction relationships to quest givers.
- Show faction identity on Jobs and contact surfaces.
- Add player-facing faction descriptions and rivalry hints.
- Keep all existing Jobs functionally unchanged in A.

### Gate

- Older rulesets have no faction behavior.
- Every contact with Jobs has a faction relationship or an explicit independent-broker reason.
- Rules page copy explains factions without promising contract behavior not yet shipped.

---

## 1.4.0-B — Contract Board

### Objective

Ship the first repeatable faction contract board.

### Scope

- Rotating offers by faction and city.
- Contract acceptance, tracking, expiry and completion receipts.
- Objective types reuse existing event signals and current-state checks.
- Rewards grant faction standing first, with conservative cash/item rewards only when justified.

### First board

Start with The Kings, The Outfit, Road Saints MC, The Cartel Line and Civic Handshake.

### Gate

- Duplicate action IDs cannot complete or reward twice.
- Expired contracts cannot be claimed.
- Contract rewards are visible before acceptance.
- The first balance pass proves contract-only play does not beat mixed play.

---

## 1.4.0-C — Faction Standing

### Objective

Add the consequence layer.

### Scope

- Seasonal faction standing per round player.
- Tier thresholds and tier-up activity.
- Rival standing effects at high tiers.
- Contact Jobs can grant both contact reputation and faction standing.
- Admin/player views show faction standing clearly.

### Gate

- Standing changes are event-sourced or receipt-backed enough to audit.
- Rival effects never silently revoke previously earned permanent cosmetics.
- Older contact reputation behavior remains pinned for older rulesets.

---

## 1.4.0-D — System Contracts

### Objective

Make contracts use the real game.

### Scope

- Product contracts ask for product orders, shortages or risky supply.
- Travel contracts ask for runs, convoy exposure or boss movement.
- Turf contracts ask for holding, defending or pressuring blocks.
- Business contracts ask for staffed fronts, racket choices or register exposure.
- Civic contracts hook into 1.3 pressure with strict caps.

### Gate

- Contract objectives are resolved by server-side receipts or authoritative state.
- Contract rewards do not make the underlying action strictly better than doing it for its
  normal reason.
- 1.3 pressure relief is capped and logged.

---

## 1.4.0-E — Rivalries & Introductions

### Objective

Make faction choice matter without trapping new players.

### Scope

- Friendly, tense and rival relationships between factions.
- Brokered introductions through The Quiet Office or specific contacts.
- High-tier faction Jobs can close or raise the cost of rival Jobs.
- Optional truce/introduction contracts for changing course.

### Gate

- A player can recover from an early faction choice.
- Rival penalties are previewed before accepting a contract.
- No faction path is required for core game survival.

---

## 1.4.0-F — Underworld NPC Arcs

### Objective

Give factions named faces and story direction.

### Scope

- One short one-time arc for each active faction.
- Existing contacts get faction-flavored continuations.
- New broker contact introduces The Quiet Office.
- Capstones pay standing, titles, frames, accents or access, not raw seasonal power.

### Gate

- Every arc has replay-safe receipts.
- Capstones are impossible to farm.
- Quest text makes faction consequences readable.

---

## 1.4.0-G — Rewards & Public Flavor

### Objective

Make faction play visible and memorable.

### Scope

- Faction achievement category or additions to existing categories.
- Profile titles, badges, frames or accents.
- Activity feed and Console entries for major faction moments.
- Rules page faction chapter.
- Public flavor that does not expose sensitive live-season progress.

### Gate

- Sensitive contract progress is sealed from rivals during live seasons.
- Cosmetic rewards cannot be confused with competitive advantage.
- Mobile Jobs/faction views pass the strict UI audit.

---

## 1.4.0-H — Balance, Admin & Release

### Objective

Release factions without breaking the season economy.

### Scope

- Full-round simulation with street-only, faction-heavy, business-heavy, runner and mixed
  profiles.
- Admin view for faction standing, contract claims, suspicious completions and reward totals.
- Exploit checks for repeatable contracts, standings, expiry and rival bypasses.
- Release documentation and player-facing rules.

### Gate

- Mixed play beats faction-only play.
- Contract cash/product rewards remain below direct system play after costs.
- Admin can audit every meaningful faction reward.
- Release gate includes unit, integration, simulation and strict UI coverage.

---

## Not in 1.4.0

- Fully autonomous NPC factions that conquer the map on their own.
- NPC crews that raid players without clear player-triggered contracts or events.
- Permanent faction power that carries into future seasons.
- Player-to-player faction markets or cash transfers.
- Casino odds changes, free turns or direct combat stat boosts from faction standing.
- Law immunity. Civic Handshake can reduce or redirect pressure within caps; it cannot delete
  1.3.

---

## Open questions

1. **1.3 surface names.** Align Civic Handshake contracts with the final 1.3 model: wanted
   level, evidence, warrants, informants, investigations or whatever ships.
2. **Standing math.** Decide whether faction standing uses the existing reputation table shape or
   a new faction-specific table.
3. **Rival effects.** Decide how much standing with one faction should reduce access to another.
4. **Contract rotation.** Decide whether boards rotate globally by city/faction, per player, or a
   hybrid like existing city contracts.
5. **Existing Jobs migration.** Decide whether old contact Jobs retroactively gain faction
   labels in the newest ruleset only, or whether only new 1.4 Jobs award faction standing.

