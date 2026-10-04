# StreetsEmpire v1.4.0 — Factions, Contracts & the Underworld

## Brainstorm

**Status:** 1.4.0-A and A2 are built; the newest ruleset is `classic-og-v1.4-a2`. B to G are design
only. See the [Roadmap](#roadmap) table.

**Target base:** StreetsEmpire v1.3.0 (`classic-og-v1.3-g`)  
**Theme (from [ROADMAP-FUTURE.md](ROADMAP-FUTURE.md)):** make each city's underworld feel populated
even outside player competition.  
**The question:** who else runs these streets besides players?  
**Core loop:** work for a contact → earn their faction's standing → unlock information, then small
advantages in that faction's lane → choose a side at the top.

**Decided so far:**

- **Factions sponsor the boards that already exist.** There is no new contract board. Daily,
  weekly, city and alliance contracts carry a sponsoring faction and pay its standing, and each
  faction adds a handful of its own one-time Jobs.
- **Standing buys information, then small capped nudges.** Low tiers bring information and
  warnings. Mid tiers bring small, capped advantages inside systems that already exist. The top
  tier brings a capstone Job, titles and cosmetics. Standing never pays an income stream, turns
  or combat strength.
- **Rivalries stay soft until the top tier.** Anyone can earn standing with every faction.
  Reaching **Inner Circle** with a faction locks you out of its rival's Inner Circle for the
  season. The lock is shown before you take the step.
- **Alignment is public from Connected up.** A profile shows "Kings-connected" once a player
  reaches Connected. Exact standing and contract progress stay private, like the Case.
- **Five factions ship first:** The Kings, The Outfit, Road Saints MC, The Cartel Line and Civic
  Handshake. Harbor Ghosts, The Velvet Table and The Quiet Office are later or optional.
- **Civic Handshake is the faction behind the 1.3 officials.** Its standing works through the
  existing payroll (Captain, DA, Judge, Customs). It is not a second way to clear a Case.
- **Vic is The Quiet Office's broker,** not a Civic Handshake officer. **Ledger stays
  independent:** the one voice in the room who never took an envelope.
- **No faction can hurt another player's Case.** The earlier draft's "point heat at a rival" is
  cut, keeping the 1.3 rule that a Case is built only from the player's own actions.

---

## Roadmap

Seven slices, each on its own pinned ruleset that adds to the one before it, starting from
`classic-og-v1.3-g`. Every slice leaves the law system, combat odds, casino odds and existing
contact reputation exactly as they were.

| Slice | Status | Ruleset | What it delivers |
| --- | --- | --- | --- |
| **1.4.0-A — Faction Catalog** | Built | `classic-og-v1.4-a` | Factions in the ruleset, each contact's faction, faction identity on Jobs and contacts. No balance change. |
| **1.4.0-A2 — Contract Rotation** | Built | `classic-og-v1.4-a2` | 28 more daily contracts (36 in all) and 14 more weekly contracts (20 in all), including the first contracts for businesses, block wars, convoys, boss trips and outposts. Each round deals its boards from its own deck: every daily is dealt once every 12 days and never twice within 6, every weekly once every 10 weeks and never twice within 5, with boards mixing categories. City boards never post two orders in one city, avoid the last board's cities, and add a third slot for a city job (fly in and back, or play that city's casino). A new Season board deals each round 3 of 9 round-long goals that sit outside the active-job limit. |
| **1.4.0-B — Standing** | Planned | `classic-og-v1.4-b` | Seasonal standing per faction with receipts, tiers, tier-up alerts and a standing panel. Contact Jobs pay faction standing. |
| **1.4.0-C — Sponsored Contracts** | Planned | `classic-og-v1.4-c` | Existing board contracts carry a sponsoring faction and pay its standing. Boards lean toward factions you work with. |
| **1.4.0-D — Faction Perks** | Planned | `classic-og-v1.4-d` | Information and warnings at Known and Trusted, then a small capped nudge per faction at Connected. |
| **1.4.0-E — Rivalries & Inner Circle** | Planned | `classic-og-v1.4-e` | The Inner Circle rival lock, previewed before it lands; Vic's introductions; one short Job arc and a capstone per faction. |
| **1.4.0-F — Rewards & Public Flavor** | Planned | `classic-og-v1.4-f` | Faction titles and frames, alignment on profiles from Connected, feed entries, feats and a Rules page section. |
| **1.4.0-G — Balance, Admin & Release** | Planned | `classic-og-v1.4-g` | A `qa:factions` simulation, an admin standing view with audited corrections, an exploit audit, mobile checks and the release gate. |

---

## What already exists

1.4 is mostly a politics layer over systems the game already has:

| Piece | Since | What it gives 1.4 |
| --- | --- | --- |
| Contacts and Jobs | 0.7 | Mama King, Pip, Tommy, Wheels, Vic and Blocks; Ace (1.2-F) and Ledger (1.3-F). One-time Jobs with prerequisites, objectives driven by real game signals, retry-safe receipts. |
| Contact reputation | 0.7 | `PlayerReputation` per contact, earned from Jobs and regular trade. Prerequisites read it. |
| Daily contracts | 0.7-N | A rotating board, 3 slots a day. |
| Weekly contracts | 0.7-O | A rotating board, 2 slots a week. |
| City contracts | 0.7-R | 2 slots per 12-hour window, driven by each city's market supply. |
| Alliance contracts | 0.7-S | Shared alliance work, 4 slots. |
| Favors | 0.7-I | Timed and single-use favor rewards in Street, Underworld and Muscle categories. |
| Stores | early | Corner, Tommy (weapons), Charlie (supplies), Pip (product), each with prices and relationship pricing. |
| Turf locals | 0.6 | Blocks held by local crews before players take them. |
| Travel | 0.5 / Trips | Runs, convoys, road stops, bodyguards and the airport. |
| Businesses | 1.1 | Fronts, rackets and block wars. |
| The law | 1.3 | The Case, warrants, lawyers, the officials' payroll with exposure and Internal Affairs, informants. |

What's missing is a **reason the work adds up**. Every Job and board contract today is a separate
transaction with one contact. Nothing says that helping Tommy and helping Blocks pulls you in
different directions, or that the people behind Pip have an opinion about what you do with their
product.

---

## Recommendation: contacts belong to factions

Every contact keeps their own reputation; that is the personal relationship. Each one also belongs
to a **faction**, which is the wider political consequence. Helping Tommy earns Tommy's reputation
*and* The Outfit's standing. Contacts are the faces, factions the politics.

### Design principles

1. **Factions are faces for existing systems.** Faction work is Scout, Product, Combat, Travel,
   Turf, Businesses, Casino and the law, never unrelated chores.
2. **NPC work supplements PvP.** Contracts create opportunities and pressure; they are never the
   safest best way to earn.
3. **The law stays the outside force.** Civic Handshake is the corrupt interface to it, sold as
   counterplay inside 1.3's caps, never immunity.
4. **Standing opens choices, not raw power.** Information, access, small capped nudges, titles
   and cosmetics. Never turns, combat strength or unearned income.
5. **Rivalries bite at the top.** Being liked by everyone is possible, being trusted by everyone
   is not.
6. **Rulesets pin the faction catalog.** Older rounds never gain faction behaviour.

---

## Factions

| Key | Faction | Identity | Lane | Faces | First release |
| --- | --- | --- | --- | --- | --- |
| `KINGS` | **The Kings** | street gangs, block bosses, neighborhood crews | Turf, raids, block wars, the street | Mama King, Blocks | ✅ |
| `OUTFIT` | **The Outfit** | old-school organized crime, weapons, protection | Weapons, rackets, protection | Tommy | ✅ |
| `ROAD_SAINTS` | **Road Saints MC** | bikers, chop shops, convoy escorts | Vehicles, runs, convoys, the road | Wheels | ✅ |
| `CARTEL_LINE` | **The Cartel Line** | product suppliers and wholesale | Product, Pip, supply | Pip | ✅ |
| `CIVIC_HANDSHAKE` | **Civic Handshake** | corrupt officials, clerks, inspectors | The 1.3 payroll | the payroll officials | ✅ |
| `HARBOR_GHOSTS` | **Harbor Ghosts** | smugglers, dock and airport handlers | Hidden cargo, ports, airports | a future handler | later |
| `VELVET_TABLE` | **The Velvet Table** | casino hosts, high rollers, back-room money | Casino, VIP, comps | Ace | later |
| `QUIET_OFFICE` | **The Quiet Office** | fixers, brokers, information dealers | Introductions, debts, diplomacy | Vic | E (as a broker only) |

**Independent:** Ledger, the retired records sergeant (1.3-F), belongs to no faction. Her Jobs
pay no faction standing.

### The Quiet Office in the first release

Vic introduces players across factions in E (see below) but is not a faction you climb in the first
release. His Jobs keep paying Vic's reputation only. A full Quiet Office ladder is a later option.

### Rivalry web

Each first-release faction has exactly one rival, so the top-tier choice is readable:

| Rivalry | Reason |
| --- | --- |
| The Kings vs. The Outfit | street control vs. old-money control |
| Road Saints MC vs. Civic Handshake | the road vs. the checkpoints |
| The Cartel Line vs. Civic Handshake | product flow vs. inspections |

Civic Handshake has two rivals because everyone who moves goods hates it. Later factions add
their own: Harbor Ghosts vs. Civic Handshake, The Velvet Table vs. The Kings.

---

## Standing

Standing is seasonal: it starts at zero each round, like the Case. Every change has a receipt keyed
on the act that caused it, so a retry never pays twice and staff can audit every point.

| Tier | Standing | Meaning | What it opens |
| --- | --- | --- | --- |
| **Unknown** | 0 | no relationship | the faction's sponsored board contracts |
| **Known** | 25 | they've heard of you | faction one-time Jobs; information (D) |
| **Trusted** | 75 | they'll call you | early warnings (D) |
| **Connected** | 150 | they'll vouch for you | the faction's capped nudge (D); public alignment (F) |
| **Inner Circle** | 300 | they'd risk something for you | the capstone Job and cosmetics (E); locks out the rival's Inner Circle |

*Thresholds are first passes, to be pinned by `qa:factions` in G.*

**Where standing comes from:**

- a contact's one-time Jobs pay their faction's standing (B);
- sponsored board contracts pay the sponsor's standing (C);
- each faction's own Jobs and arc (A/E).

**What standing never comes from:** cash, purchases, real money, other players, or anything a
player can repeat without limit. Regular trade at a store keeps paying contact reputation only.

---

## Sponsored contracts

No new board. Each existing board contract gets a **sponsoring faction**, from the contact who
gives it or, for market-driven city contracts, from its lane (product → Cartel Line, turf →
Kings, road → Road Saints, and so on).

- **Standing on completion,** shown before acceptance next to the contract's existing reward.
- **Boards lean your way.** When choosing a board's offers, a faction you're Known with or above
  is a little more likely to sponsor one. A player is never offered only one faction's work.
- **Alliance contracts** pay standing to each contributor, by share, the way they already split
  rewards.
- **Unchanged:** the boards' slots, windows, objectives, cash and favor rewards.

---

## Faction perks (D)

| Tier | Kings | Outfit | Road Saints | Cartel Line | Civic Handshake |
| --- | --- | --- | --- | --- | --- |
| **Known:** information | which local crews hold blocks near yours | which blocks run rackets | which roads are hot today | which cities are short of what | which offices are under Internal Affairs |
| **Trusted:** early warning | a rival lining up a block war on you | a racket raid coming in your city | a road stop on your next run's route | a supply crash a day early | a stage rise a few points early |
| **Connected:** capped nudge | corner upkeep a little cheaper | Tommy's weapons a little cheaper | bodyguards a little cheaper | Pip's product a little cheaper | officials' exposure per favor a little lower |

Every nudge is a small percentage, capped, applies only inside its system, and is pinned per
ruleset. Every warning reads information the game already has and never reveals another player's
Case, recon or private state. These are candidates; D pins them, and G's simulation sizes them.

---

## Rivalries & Inner Circle (E)

- **The lock.** Reaching Inner Circle with a faction locks its rival's Inner Circle for the season.
  The Jobs page says so on the step that would do it, before you take it. Standing with the rival
  keeps working below Inner Circle.
- **No early traps.** Nothing below Inner Circle costs standing anywhere else, so a new player
  can't make a mistake that hurts later.
- **Vic's introductions.** Vic can introduce you to a faction you have no standing with: a paid
  one-time Job that starts you at Known. It never unlocks a locked Inner Circle.
- **Arcs.** Each first-release faction gets a short one-time Job arc ending in a capstone at
  Inner Circle. Capstones pay titles, a frame or an accent, and standing; never cash or power.

---

## Hooks into what's already built

- **1.3 law:** Civic Handshake works through the existing payroll and its caps. A sponsored
  contract can never add to or take from a Case except through acts that already do (a bust is
  still evidence). Ledger stays independent.
- **1.2 casino:** Ace stays outside the first five. The Velvet Table, if it ships later, can never
  touch odds, limits or payouts.
- **1.1 businesses:** the Outfit's information and warnings read racket and raid state the game
  already tracks.
- **0.6 turf:** the Kings' information reads block holders the turf map already shows.
- **Alliances:** standing is per player, not per alliance. Alliance contracts pay each
  contributor.

---

## Guardrails (proposed invariants)

1. Standing is seasonal and starts at zero every round.
2. Every standing change has a receipt keyed on its source act, so retries never pay twice.
3. No faction reward is an income stream, turns, combat strength, casino odds, or a way to clear
   a Case.
4. Every nudge is capped, small, inside an existing system, and pinned per ruleset.
5. No warning or information reveals another player's private state.
6. Nothing below Inner Circle costs standing elsewhere; the Inner Circle lock is previewed before
   it applies.
7. Exact standing and contract progress are private; only the tier from Connected up is public.
8. Standing can't be bought, transferred, or earned from another player.
9. Mixed play beats faction-only play (`qa:factions`).
10. Rulesets before 1.4 have no factions and never acquire them.

---

## Stages

### 1.4.0-A — Faction Catalog

The `factions` ruleset block (key, name, identity, lane, rival), each contact's `factionKey` (or
independent), faction identity on Jobs and the contacts page, and player-facing descriptions and
rivalry hints. Every existing Job works exactly as before.

**Gate:** older rulesets have no factions; every contact with Jobs has a faction or is marked
independent; the Rules copy promises nothing not yet shipped.

#### Built in A

**Status: implemented.** Ruleset `classic-og-v1.4-a` (1.4.0-A) is 1.3.0-G plus a `factions` block
and a faction on each contact. Jobs, rewards, prices, reputation and the law are exactly 1.3.0-G's.

- **The catalog.** The Kings, The Outfit, Road Saints MC, The Cartel Line and Civic Handshake, each
  with a name, identity, lane, description and rivals. Every rivalry is listed on both sides:
  Kings and Outfit against each other, and Civic Handshake against both Road Saints and the Cartel
  Line. Civic Handshake has no contact of its own; its faces are the officials on the 1.3 payroll.
- **Contacts.**

  | Contact | Faction |
  | --- | --- |
  | Mama King, Blocks | The Kings |
  | Tommy | The Outfit |
  | Wheels | Road Saints MC |
  | Pip | The Cartel Line |
  | Vic | independent: a broker who works for none of them |
  | Ace | independent: the casino serves everyone who pays |
  | Ledger | independent: she never took an envelope |

- **Validation.** `factionProblems` checks a ruleset's catalog: every contact that gives Jobs has a
  faction or an independent reason (never both), every rivalry is two-sided, and every faction has
  a contact or a faces note. The release ruleset has none.
- **Jobs page.** Each contact card says who they work for (or "Independent", with the reason on
  hover), each Job card names its faction next to its contact, and a new Factions panel lists each
  faction's lane, identity, faces and rivals. 1.3 rounds show none of it.
- **Rules page.** A short "Factions" section: who's who, the independents, rivals, and that
  nothing works differently yet.
- **Seed.** The local seed's current round now uses `classic-og-v1.4-a`.

A invariants:

1. Every 1.3 invariant still holds.
2. Factions change no Job, reward, price, reputation or law number.
3. Every contact that gives Jobs has a faction or an independent reason.
4. Every rivalry is listed on both sides.
5. `classic-og-v1.3-g` and older rounds have no factions.

### 1.4.0-B — Standing

Seasonal standing per faction (a new table with receipts), tiers, tier-up activity and alerts, a
standing panel on the Jobs page, and contact Jobs paying faction standing alongside reputation.

**Gate:** receipts add up to stored standing; a retried Job never pays twice; older rulesets'
contact reputation is untouched.

### 1.4.0-C — Sponsored Contracts

A sponsoring faction on daily, weekly, city and alliance contracts; standing on completion,
shown before acceptance; the board lean toward known factions.

**Gate:** board slots, windows and existing rewards unchanged; expired contracts pay nothing;
alliance standing splits like existing rewards.

### 1.4.0-D — Faction Perks

The information, warnings and capped nudges in the perks table.

**Gate:** every nudge is capped and logged where it applies; no warning reveals another player's
private state.

### 1.4.0-E — Rivalries & Inner Circle

The Inner Circle lock with its preview, Vic's introductions, and one arc with a capstone per
first-release faction.

**Gate:** the lock is previewed before it applies; capstones can't be farmed; a player can always
reach Inner Circle with some faction.

### 1.4.0-F — Rewards & Public Flavor

Faction titles, frames and accents; public alignment from Connected; feed and Console entries for
tier-ups; season feats; a Rules page section.

**Gate:** live standing numbers and contract progress stay private; cosmetics change nothing in
play.

### 1.4.0-G — Balance, Admin & Release

`qa:factions` whole-round simulation (street-only, faction-heavy, business-heavy, runner and mixed),
an Admin → Factions view with audited standing corrections, an exploit audit, mobile checks and the
release gate. Pins the tier thresholds and the nudge sizes.

**Gate:** mixed play beats faction-only play; every standing change is auditable; the release gate
runs the simulation and the integration suites.

---

## Not in 1.4.0

- Autonomous NPC factions that conquer the map, or NPC crews that raid players.
- A new contract board alongside the existing four.
- Permanent faction power that carries into the next season.
- Buying, selling or transferring standing, or anything sold for real money.
- Casino odds changes, turns or combat stat boosts from standing.
- Adding to, or clearing, any player's Case through a faction.

---

## Open questions

1. **Tier thresholds and nudge sizes:** first passes above, pinned by `qa:factions` in G.
2. **Board lean:** how much a known faction tilts the offers without crowding out the others.
3. **Later factions:** whether Harbor Ghosts, The Velvet Table and a full Quiet Office ladder ship
   in a 1.4.x follow-up or move to a later version.
