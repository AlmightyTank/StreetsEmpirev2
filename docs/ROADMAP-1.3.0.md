# StreetsEmpire v1.3.0 — Law Enforcement, Wanted Level & Corruption

## Brainstorm

**Status:** 1.3.0-A through 1.3.0-E are built; the newest ruleset is `classic-og-v1.3-e`. F and
G are still design only. See the [Roadmap](#roadmap) table.

**Withdrawn draft:** a separate "law pressure" draft (one attention and evidence pool per
player, a `classic-og-v1.3-f` built on 1.2-F, and cash to bury attention) briefly landed on
`beta` alongside A–E. It was withdrawn in favour of the Case; migration
`20261005200000_drop_law_pressure` drops its columns. The `classic-og-v1.3-f` id is free again
for the F slice below, and its `LAW_CORRUPTION` activity value stays only so any older feed rows
still read.

**Target base:** StreetsEmpire v1.2.0 (`classic-og-v1.2-f`)  
**Theme (from [ROADMAP-FUTURE.md](ROADMAP-FUTURE.md)):** expand Heat into a deeper city-wide
risk system.  
**The question:** what happens when the law notices me?  
**Guardrail:** law enforcement creates strategic pressure, not random unavoidable punishment.

**Decided so far:**

- **Layer, don't replace.** Heat and its bust/arrest rolls stay exactly as they are. 1.3 adds
  a slower, per-city system on top.
- **Wanted is private.** Only the player (and admins) can see their own case and Wanted level.
- **No tipping off rivals.** No player can add evidence to another player's case. Informants
  are information the player buys, never a weapon against someone else.
- **1.2 ships first.** 1.2.0-G and 1.2.0-H are done; 1.3.0-A starts from `classic-og-v1.2-f`.
- **No police combat.** A warrant is never a fight, and there is no resisting arrest. Armed
  NPCs stay in 1.4 (Factions).
- **The Case resets every round.** Every city's Case starts at zero when a round starts, like
  Heat. Nothing about a Case carries into the Hall of Fame or the next round.
- **The Case stays behind, unless it's big enough to follow you.** Relocating a home city
  normally leaves a Case in the old city. A Case at the **Federal** stage has become a federal
  case, and it follows the player to the new home city (see
  [Federal cases follow you](#federal-cases-follow-you)).

---

## Roadmap

Seven slices, each on its own pinned ruleset that adds to the one before it. Every slice
leaves Heat, busts, arrests and bribes exactly as they were. Details of what each built are
under [Stages](#stages-sketch-following-the-11--12-pattern).

| Slice | Status | Ruleset | What it delivers |
| --- | --- | --- | --- |
| **1.3.0-A — Case Foundation** | Built | `classic-og-v1.3-a` | A private Case per city, built from 10% of the Heat drawn there, with itemised receipts and the Wanted ladder (Quiet → Noticed → Under Investigation → Warrant → Federal). Read-only Case panel. |
| **1.3.0-B — Evidence Sources** | Built | `classic-og-v1.3-b` | Direct evidence (busts, arrests, road stops, torches, sacks, run hits), currency reports on cash moved per city per day, cooling after 24 quiet hours, laundering that washes the Case. Stage rises reach Discord and phones. |
| **1.3.0-C — Warrants & Raids** | Built | `classic-og-v1.3-c` | Warrants at the Warrant stage with a 12-hour warning: Hideout, business or personal raids. A daily police-loss cap. Lawyers: a weekly retainer, or lawyering up to answer a warrant. |
| **1.3.0-D — Corruption & Informants** | Built | `classic-og-v1.3-d` | A weekly payroll of Captain, DA, Judge and Customs per city. Exposure from every favor, and Internal Affairs with a warned sting. Informants sell sweep and city tips. |
| **1.3.0-E — City Identity & the Feds** | Built | `classic-og-v1.3-e` | Each city's police build, cool and warn at their own pace. Federal shortens warrant windows and makes the sweep write more against the player, privately. A federal case and its warrant follow a relocation. |
| **1.3.0-F — Jobs, Feats & Titles** | Planned | — | A police-side contact with one-time Jobs, clean-record feats and law-themed titles. Never pays cash, turns or protection. |
| **1.3.0-G — Balance, Admin & Release** | Planned | — | A `qa:law` simulation to pin the numbers, an admin case viewer with audited adjustments, an exploit audit, mobile regression and the release gate. |

**Still open across slices:**

- The airport-check preview on the trip screen does not yet show Customs' cut (D).
- A city tip's Heat lines are also visible on the move screen for destinations; from E the tip
  adds the city's police personality, which is shown nowhere else before you have a Case there.
- Every number above is a first pass until G's `qa:law` simulation pins it.

---

## What already exists

1.3 builds on a Heat system that has grown since 0.4.0-C:

| Piece | Since | What it does |
| --- | --- | --- |
| Heat 0–100 | 0.4.0-C | One number per player, carried between cities. Decays 1 point per 5-minute turn interval (about 8 hours from max to zero). |
| Take drag | 0.4.0-C | Past the city's drag line, Heat cuts the take, up to 35% at max. |
| Bust | 0.4.0-C | Past the bust line, each Scout/Produce trip can be busted: product seized, cash fined, Heat dropped. |
| Arrest | 0.5.0-C | A tier above bust: bigger seizure and fine, plus 120 real minutes locked up. On a run, the trunk is lost. |
| City Heat lines | 0.5.0-A | Each city sets its own drag/bust/arrest lines, bust severity and `policePressure`. |
| Road stops, sale Heat | 0.5.0-C | Runs meet the police on the road, and selling on a run draws Heat. |
| Airport security | Trips D2 | Heat triggers checks; above the no-fly line, you can't board. |
| Federal sweep | 0.6.0-F | One seeded late-round sweep of a city's held corners, announced 24 hours ahead. |
| Racket Heat | 1.1.0-C/F | Rackets draw Heat. Laundering washes it off; Heat Shield cuts it. Active rackets draw extra Heat from the sweep. |
| Bribe | 0.4.0-C | Pay cash, priced on net worth, to take Heat off. |
| `evidence` block | 0.1.0 | Dormant placeholder (`enabled: false`) for "busts, cop attention, PvP fallout". Never read. |

What's missing is **memory and warning**. Heat forgets everything in a few hours, and every
consequence except the sweep arrives as a dice roll at the moment of a trip. A player who
stays hot in one city for a week faces the same per-trip dice as one who got hot an hour
ago, and gets no chance to see a consequence coming.

---

## Recommendation: Heat is the noise, the Case is the memory

Add one new number per player **per city**: the **Case**. It's what that city's police have
on you.

| | Heat (unchanged) | Case (new) |
| --- | --- | --- |
| Scope | Global; follows the player | Per city; stays where the crimes happened, unless it goes federal |
| Speed | Rises and decays in hours | Builds over days, decays slowly, only when you've been quiet |
| Consequence | Take drag, bust/arrest dice, road and airport checks | The Wanted ladder: investigation, warrant, raid |
| Fix | Bribe, laundering, waiting | Officials, lawyers, laundering, leaving town, time |
| Shown to | The player | The player only |

### Why layer instead of replacing the dice

- **Nothing players already understand gets invalidated.** That's the post-1.0 rule. Bust and
  arrest odds, city lines and bribes all keep working as written.
- **The two systems answer different questions.** Heat asks "should I do one more trip
  right now?" The Case asks "how long can I keep running this city like this?"
- **Every *new* punishment can be telegraphed.** The dice stay, and the guardrail applies to
  everything 1.3 adds: no new loss lands without a visible state and a window to respond.

### Why per city

- It gives **"move cities"** a real meaning. You can leave a hot case behind, but you also
  leave behind that city's turf, businesses and markets. Leave it too late, once the Feds
  have it, and the case comes with you.
- City identity grows naturally: Las Vegas lets cases sit for a long time and then moves all at
  once (the game's own street talk already says so), and Los Angeles opens cases fast.
- It fits the existing per-city Heat lines and `policePressure`.

### Why private

- A public Wanted level would be a target painted on a player.
- Scouting, combat and profiles reveal nothing about a case. The only outside trace of a raid
  is its real effect (an item gone, a racket shut), which other players could already
  observe.
- Private Wanted also keeps 1.3 safe from griefing until there's season data.

---

## The Wanted ladder

Each city's Case runs 0–100 and maps to a stage. Stages are what the player sees; the number
is shown alongside.

| Stage | Case | What it means |
| --- | --- | --- |
| **Quiet** | 0–19 | Nothing on file. |
| **Noticed** | 20–39 | A file exists. Officials and lawyers become relevant. No effect yet. |
| **Under Investigation** | 40–64 | Detectives are working it. Warning-only: the case starts showing which assets it's looking at (Hideout, a named business, you). |
| **Warrant** | 65–84 | A warrant is drafted against the most exposed target. It's **served after a warning window**, unless answered. |
| **Federal** | 85–100 | The Feds take an interest. The late-round sweep weighs this city and this player more. Warrants draft faster. |

Moving up a stage always sends a notification (dashboard, Activity, existing toasts, optional
Discord DM). There is **no roll** anywhere on the ladder: a stage is reached or it isn't.

### Warrants and raids

A warrant names exactly one target, chosen by what the case is built from:

- **Hideout raid:** seizes a share of **unprotected** product and unprotected cash at the
  Hideout in that city. Safe Room protection is honored exactly as it is today.
- **Business raid:** a named business's racket is shut for a fixed period and its register is
  fined. The business is never razed and the block never changes hands.
- **Personal warrant:** served the next time the boss is in that city: an arrest at the
  existing arrest severity and downtime. It's served, never fought. Staying away is a valid
  answer; the warrant waits until the round ends.

Because a local Case stays behind on relocation, a warrant in a city the player has moved away
from can only name a business they still hold there, or them personally. Their Hideout has
left with them. A federal case is different; see below.

**Warning window:** a drafted warrant shows its target and the time it will be served. During
the window the player can:

1. **Move it:** shift product out, pause a racket, relocate cash to protection.
2. **Lawyer up:** pay to turn the warrant into a fine (see below).
3. **Call in an official:** a DA on payroll can quash it (see below).
4. **Take it:** let it land. A served warrant closes most of the case.

A served or answered warrant drops the Case well below the Warrant line, so one bad week leads
to one raid, not a chain.

### Federal cases follow you

Below the **Federal** line, a Case belongs to its city's police and stays there when the
player relocates. At **Federal** or above, it's the Feds' case, and the Feds don't stop at
city lines.

When a player relocates their home city while the city they're leaving has a Case at Federal:

1. **The relocation screen says so first.** Before confirming, the player sees which case
   will follow them and what it will be on arrival. Nothing moves silently.
2. **The case moves with them.** The new home city's Case becomes the federal case's value
   (or stays at its own value, if that's higher). It doesn't stack with the new city's Case.
3. **The old city keeps a local file.** The old city's Case drops to the **Under
   Investigation** floor. Local detectives remember, but the federal part has left.
4. **A drafted warrant follows too.** It re-targets in the new city (the Hideout is now a valid
   target again) and gets a **fresh warning window**, so a move never cuts the time to
   respond.

A federal case in a city that isn't the player's home stays where it is; it's already a
case about somewhere they don't live, and its warrants name a business there or the player
personally.

Only relocation moves a Case. Trips, runs and flights never do: Heat already travels with the
player, and the Case stays a question of where the player calls home.

This closes the obvious loophole of running from a case that's about to be served, without
making relocation itself a trap: a player below Federal can still leave a hot city clean.

---

## Where evidence comes from

Heat already measures most of what the police notice. The Case reuses that signal and adds
the crimes Heat doesn't see.

**Converted Heat.** A share of Heat gained *in a city* adds Case in that city. A player who
keeps Heat low through bribes still builds a case slowly. Bribes buy time; they don't erase
history.

**Direct evidence** (new):

| Source | Why it's evidence |
| --- | --- |
| Being busted or arrested | The police now have something on paper. |
| Sacking or torching a business | Turf violence the city can't ignore. |
| Convoy hijacks | Violence on the roads out of the city. |
| Rackets running at full strength | Ongoing operations leave a trail. |
| **Currency reports** | Large cash movements: big casino cage exchanges, business register spikes, large run buys and sales. |

Each case keeps **itemised receipts**, so the player can always see *why* it exists:
"Bust on Scout, Tuesday 14:10 — +8". That also makes the system testable and auditable.

**Cooling off.** A case only decays once that city has seen no new evidence from the player for
a quiet period. Decay is slow (days, not hours). "Stay quiet" and "reduce visible operations"
are therefore real strategies, not just waiting out a timer.

---

## Corruption: officials as relationships

Today's bribe is a single transaction: cash in, Heat out. It stays. 1.3 adds a **payroll** of
corrupt officials per city: an ongoing cash sink with a slow-building downside.

| Official | Effect |
| --- | --- |
| **Precinct Captain** | Earlier warning: stage changes and warrants are flagged sooner, and warning windows are longer. |
| **District Attorney** | Can quash one drafted warrant per period. Slows case growth. |
| **Judge** | Shortens arrest downtime and cuts raid seizures in that city. |
| **Customs Officer** | Softens airport security checks out of that city. Never bypasses the no-fly line. |

- **Cost:** a weekly retainer, priced like the existing bribe (a share of net worth, with a
  floor), so it scales with the empire.
- **Exposure:** every favor an official does adds to their **exposure**. Past a line, Internal
  Affairs opens a file on them, and **the player is warned**. The player can cut the official
  loose (losing the retainer) or keep them and risk the sting. A sting ends the relationship
  and adds a large chunk of evidence to the player's own case.
- **Telegraphed, not random:** Internal Affairs is a visible state the player chooses to
  ignore, not a hidden roll.

---

## Lawyers

The "accept higher risk for higher profit" lever.

- **Retainer:** a standing fee that lowers raid seizures and arrest downtime in every city.
- **Lawyer up:** a one-off payment during a warning window that turns a warrant into a fine
  sized from what the raid would have taken. Expensive, but predictable.

---

## Informants

Informants sell **information, not protection**: pay for advance word on an upcoming federal
sweep or a city's crackdown mood. A tip never changes anyone's case, including the buyer's.

**Cut: tipping off rivals.** An earlier draft let players pay to add evidence to another
player's case. It was the easiest part of 1.3 to abuse (dogpiling, farming a rival through a
private system they can't see coming from), so it's out. A player's case is built only from
their own actions.

---

## Hooks into what's already built

- **1.1 Laundering racket:** washes Case evidence as well as Heat, within its existing caps.
  Laundering becomes the business-side way to close a case.
- **1.1 Heat Shield:** also cuts the evidence those rackets add.
- **1.1 Casino Front / 1.2 casino:** a currency report comes from the size of a cash movement,
  not from winning or losing. No casino odds, limits or payouts read the Case.
- **0.6.0-F federal sweep:** becomes the top of the ladder. Players at **Federal** in the swept
  city draw more of its attention. The sweep's own rules (warning, caps, minimum survivors)
  don't change.
- **0.5 travel:** Customs officials and the Case stay per city; road stops and airport checks
  still read Heat, as they do today.
- **Hideout Safe Room:** stays the protected layer. A raid never touches protected cash or
  protected product.
- **Quests and Jobs:** a police-side contact (in the style of Ace) can offer one-time Jobs,
  e.g. "Clear a case without a raid" or "Run a city at Under Investigation for a day".
  Feats and titles for a clean record.

---

## Guardrails (proposed invariants)

1. Heat, bust, arrest, bribe and city Heat lines behave exactly as in the base ruleset.
2. No 1.3 loss lands without a visible stage or warrant *and* a window to respond.
3. The Wanted ladder has no random rolls; a stage is reached deterministically from the Case.
4. Raids never touch protected cash or protected product, and never take, raze or flip a block.
5. Total police losses (busts, arrests, raids, fines) are capped per player per day as a share
   of net worth.
6. A player's Case and Wanted level are never shown to, or derivable by, another player.
7. A player's Case only ever changes from their own actions, officials, lawyers, laundering
   and time. No other player can add to it.
8. Officials, lawyers and case clearing are never sold for real money.
9. Every Case change has a receipt keyed to its source action, so retries never add evidence
   twice.
10. Rulesets before 1.3 have no `law` block and never acquire Case behaviour.
11. Every Case starts at zero each round.
12. Relocating never moves or clears a Case below the Federal line. A federal case follows
    the player, is shown before the move is confirmed, and never arrives with less warning
    time than it left with.
13. No 1.3 system resolves through combat.

---

## Ruleset shape (sketch)

A new optional `law` block on the ruleset, absent before 1.3:

```ts
interface LawRules {
  readonly caseMax: number;
  readonly stages: { readonly noticed: number; readonly investigation: number; readonly warrant: number; readonly federal: number };
  /** Share of Heat gained in a city that becomes Case there. */
  readonly heatToCase: number;
  readonly evidence: { readonly bust: number; readonly arrest: number; readonly sack: number; readonly torch: number; readonly hijack: number; readonly racketPerHour: number };
  readonly currencyReport: { readonly thresholdCents: number; readonly evidence: number };
  readonly cooling: { readonly quietHours: number; readonly decayPerHour: number };
  /** Relocating with a Case at or above `stages.federal` moves it to the new home city. */
  readonly federalTransfer: { readonly oldCityCaseAfter: number };
  readonly warrant: { readonly warningHours: number; readonly caseAfterServed: number; readonly hideoutSeizedFraction: number; readonly hideoutCashFineFraction: number; readonly racketShutHours: number };
  readonly dailyLossCapNetWorthShare: number;
  readonly officials: { /* per official: retainer pricing, effect, exposure per favor, IA line */ };
  readonly lawyer: { readonly retainer: /* pricing */ unknown; readonly lawyerUpMultiplier: number };
  readonly informants?: { /* tip prices and what each tip reveals */ };
}
```

Cities gain matching per-city keys (`caseSpeed`, `warningHoursMultiplier`, …) next to their
existing `heat` lines. The dormant 0.1 `evidence` placeholder stays on old pinned rulesets,
untouched; 1.3 rulesets use `law` instead.

### First-pass numbers *(proposed, to be pinned by `qa:law`)*

- Case 0–100 per city, with stages at 20 / 40 / 65 / 85.
- `heatToCase`: 0.1, so 10 Heat gained in a city adds 1 Case there.
- Bust +8, arrest +15, sack +6, torch +6, hijack +5.
- Currency report: +4 for every $250,000 moved in one city in one UTC day (built in B: day totals
  add up, so splitting a movement never dodges a report).
- Cooling: decay starts after 24 quiet hours in that city; then 1 point every 2 hours.
- Warning window: 12 hours (Captain: 24).
- A served warrant drops the Case to 30; a lawyered or quashed one drops it to 45.
- Hideout raid: 40% of unprotected product, 5% of unprotected Hideout cash.
- Business raid: racket shut 12 hours, plus a register fine.
- Daily police loss cap: 15% of net worth.
- Federal transfer: from Case 85; the old city drops to 40.

The goal for `qa:law`: a player who plays the existing Heat game sensibly should reach
**Warrant** in a city at most once or twice per 28-day round, and a player who ignores Heat
entirely should hit it roughly weekly.

---

## Stages (sketch, following the 1.1 / 1.2 pattern)

### 1.3.0-A — Case Foundation
The `law` ruleset block, per-city Case storage, itemised receipts, converted Heat as the
only source, and the stage ladder. A read-only Case panel next to the existing Heat panel:
"what they have on you", per city. No consequences yet.

#### Built in A

**Status: implemented.** Ruleset `classic-og-v1.3-a` (1.3.0-A) is 1.2.0-F plus a `law` block:
`caseMax: 100`, stages at 20 / 40 / 65 / 85, `heatToCase: 0.1`. Nothing else changes.

- **Storage.** `PlayerCase` holds one Case per player per city, in hundredths of a point,
  so a tenth of a point of Heat still counts. `PlayerCaseReceipt` holds one immutable row
  per act, unique on `(roundPlayerId, sourceKey)`. Both hang off `RoundPlayer`, so every
  Case resets with the round.
- **Heat drawn, not Heat kept.** A receipt records the Heat an act *drew*, before the Heat
  meter's cap and before any bust or arrest burns Heat off. A player already at max Heat,
  or one just busted, still builds a Case.
- **Every Heat source feeds it, in the city the Heat was drawn in:**

  | Source | City | Receipt key |
  | --- | --- | --- |
  | Scout, Produce | Home | The action id |
  | Run sale | The town the run sold in | The action id |
  | Convoy tail (squad from home) | Home | The action id |
  | Torching a business | The block's city | The action id |
  | Fight supply, both sides of a raid, drive-by or special raid | Each side's home | `combat:<battleId>` |
  | Sacking a block | The block's city | `sack:<squadId>` |
  | Rackets | Each racket's block city | `rackets:<cityId>:<settle time>` |
  | Federal sweep | The swept city | `crackdown:<eventId>` |

  Actions report their Heat through a new optional `caseHeat` on the action outcome;
  `ActionService` keys it on the action id, so a replayed action adds nothing.
  Settles and the sweep call `LawService.recordHeat` directly.
- **The ladder.** The stage is read from the Case with no roll. Reaching a higher stage
  logs `CASE_STAGE_UP` once: it shows in the Activity feed (Street group), rings the
  bell and raises a toast that links to the panel. B also sends it to Discord and phones.
- **Private.** `GET /api/game/law` returns only the asking player's Cases and their latest 30
  receipts. `GET /api/game/me` adds `player.law`, the worst stage anywhere, on 1.3 rounds
  only. There is no endpoint that reads another player's Case.
- **Dashboard.** A Case panel under Heat shows each city's stage, a meter, how far it is to
  the next stage, the ladder, and "What they have on you" (the receipts).
- **Seed.** The local seed's current round now uses `classic-og-v1.3-a`.

A invariants:

1. Heat, busts, arrests, bribes and every other 1.2.0-F rule behave exactly as before.
2. A Case only changes through a receipt, and a source key is never counted twice.
3. A Case stays between 0 and `caseMax` and is stored per city.
4. The stage is a pure function of the Case.
5. No player can read another player's Case.
6. Rulesets before `classic-og-v1.3-a` have no `law` block, write no Case rows and serve no
   law page.

### 1.3.0-B — Evidence Sources
Direct evidence from busts, arrests, sacks, torches, hijacks and rackets, plus currency
reports. Cooling off. Laundering and Heat Shield hooks.

#### Built in B

**Status: implemented.** Ruleset `classic-og-v1.3-b` (1.3.0-B) is 1.3.0-A plus four optional
`law` blocks. Nothing reads the Case yet, and Heat is untouched.

- **Direct evidence**, in Case points, on top of any Heat the act drew:

  | Act | Points | City |
  | --- | --- | --- |
  | Busted (Scout, Produce or a run trade) | 8 | Home, or the town traded in |
  | Arrested (same) | 15 | Home, or the town traded in |
  | Pulled over on a run | 4 | The city the leg was driving into |
  | Torching your business in a block war | 6 | The block's city |
  | Sacking a block | 6 | The block's city |
  | Hitting a run (landed or not) | 5 | The city the run was hit in |

  A torch's or a sack's Heat and its evidence share one receipt.
- **Rackets.** The roadmap listed racket evidence separately. In practice the 1.3.0-A
  conversion of racket Heat already is that trail (a VIP Room alone adds 0.5 Case an hour),
  and Wash & Fold already cuts it, so B adds no second racket stream on top.
- **Currency reports.** Every $250,000 a player moves in one city in one UTC day files a
  report worth 4. The day's total is kept on the Case row, so twenty moves of $12,500 file the
  same single report as one move of $250,000. Watched movements: casino cage buys and redemptions
  (the venue's city), register collections (home), and run buys and sales (the town). A report reads
  the size of a movement, never a win or a loss, and no casino game reads the Case.
- **Cooling.** A Case cools 0.5 an hour (a point every two hours) once its city has had 24
  hours with no evidence from the player's own acts. Racket Heat, the federal sweep and
  laundering are not the player's acts there, so they never restart the quiet clock: a racket
  city cools while its rackets keep adding, and the net is what the player sees. Cooling is
  worked out on read and written down with the next change as one rolling COOLING receipt per
  quiet spell, so the receipts always add up to the stored Case.
- **Laundering.** Each laundering racket also washes the Case in its own block's city: 0.1
  Case for each point of Heat it could launder that hour (a Laundromat 0.2 an hour at full
  strength, a Casino Front 0.4), up to 8 Case a UTC day across the crew. It needs no Heat to
  wash, costs the register nothing more, and leaves a LAUNDERING receipt.
- **Discord and phone alerts.** A new `law` alert category ("Case stage" under Account →
  Alerts, on by default) sends each rise to a new Wanted stage to Discord and Web Push through
  the existing outbox. The alert names the city and the stage only, never the Case number or
  what built it. Each receipt that raised the stage is collected once. Quiet hours, pauses and
  the Discord/push switches apply as for every other category, and the bell can mute it.
- **Panel.** The Case panel explains the B rules, shows when each Case starts cooling (or that
  it is cooling), and lists laundering and cooling as negative receipts.
- **Seed.** The local seed's current round now uses `classic-og-v1.3-b`.

B invariants:

1. Every 1.3.0-A invariant still holds.
2. A Case's receipts always add up to its stored value, cooling included.
3. Only the player's own acts restart a Case's quiet clock.
4. Splitting a cash movement never files fewer currency reports than moving it at once.
5. Laundering never takes a Case below zero or washes more than the daily cap.
6. A Case alert never carries a number or a source, and is sent at most once per stage rise.
7. `classic-og-v1.3-a` rounds keep A's rules: no direct evidence, reports, cooling or washing.

### 1.3.0-C — Warrants & Raids
Warrant drafting, warning windows, Hideout / business / personal warrants, the daily loss
cap, and notifications. Lawyers (retainer and lawyer up).

#### Built in C

**Status: implemented.** Ruleset `classic-og-v1.3-c` (1.3.0-C) is 1.3.0-B plus `law.warrants`
and `law.lawyer`. This is the first slice where a Case costs anything. Heat, busts and arrests
are still exactly as before.

- **Drafting.** When a change takes a city's Case to the Warrant stage (65) and that city has
  no open warrant, a warrant is drafted with a 12-hour warning window. One open warrant per
  city at a time. No roll: reaching the line drafts it.
- **Choosing the target.** The receipts behind the Case (since the city's last warrant) are
  summed by what they point at: Scout, Produce, busts, arrests, fights and convoy tails point
  at the **Hideout**; rackets, torches, sacks and the federal sweep at a **business**; run
  trades, road stops, run hits and currency reports at the boss **personally**. The heaviest
  wins, among the targets the police can reach there: the Hideout only in the home city, a
  business only if the player runs a staffed racket there. The boss can always be named.
- **Serving.** At `servesAt` the warrant is served the next time the player is settled: on any
  action, any page load, or the server's one-minute sweep for players who are away.
  - **Hideout raid:** 40% of the product the Safe Room does not protect, and 5% of the cash
    above the raid-protected amount (the combat floor plus the Safe Room bonus). Protected cash
    and product are never touched.
  - **Business raid:** the racket shuts for 12 hours and 25% of the register is fined. The
    front keeps earning, the business is not razed and the block does not change hands. Shut
    hours earn no racket cash, draw no racket Heat, launder nothing and give no racket effect.
  - **Personal warrant:** an arrest at the city's own arrest severity: its share of product and
    cash at home, or of the trip or run wallet when the boss is visiting, plus the arrest
    lock-up. If the boss is not in that city it **waits** (and the player is told) until they
    are, or the round ends. Staying away is a valid answer.
  - A Hideout that has since moved away, or a business that is no longer the player's, falls
    back to a Hideout raid at home or a personal warrant.
- **After serving** the Case drops to 30 (a WARRANT receipt). Answering it with a lawyer drops
  it to 45 instead.
- **Daily cap.** Police losses in a UTC day (busts, arrests, road stops, raids and fines, at
  net-worth value) are tracked on the player. A served warrant takes no more than what is left
  of 15% of net worth; busts and arrests count toward that total but are never reduced by it.
- **Lawyers.**
  - *Retainer:* 7 days for 1% of net worth (at least $25,000), extendable. While retained,
    a served warrant seizes and fines 40% less and its lock-up is half as long.
  - *Lawyer up:* during the window (or while a personal warrant waits) pay 1.25× what the
    warrant would take now, at least $10,000. A waiting personal warrant is priced as if the
    boss were home. The warrant is closed with no raid.
- **Alerts.** Drafted, waiting and served warrants reach the bell, toasts and the Activity
  feed (Street group), and Discord and phones under the same "Case stage" category. Outside
  alerts name the city and the target, never an amount.
- **Panel.** The Case panel lists open, waiting and recent warrants with what each would take
  now and a Lawyer up button, the retainer with a Retain/Extend button, and today's police
  losses against the cap.
- **Seed.** The local seed's current round now uses `classic-og-v1.3-c`.

C invariants:

1. Every A and B invariant still holds; busts, arrests and bribes are unchanged.
2. A warrant is only ever served after its warning window, and never by a roll.
3. A raid never touches protected cash or protected product, and never takes, razes or flips
   a block.
4. A served warrant never takes the day's police losses past the cap.
5. A city has at most one open or waiting warrant at a time.
6. A retried lawyer-up or retainer never charges twice (action ids).
7. Outside alerts about warrants carry no amounts.
8. `classic-og-v1.3-b` and older rounds draft no warrants.

### 1.3.0-D — Corruption & Informants
Officials on payroll per city, retainers, exposure and Internal Affairs. Informants who sell
tips on sweeps and crackdowns.

#### Built in D

**Status: implemented.** Ruleset `classic-og-v1.3-d` (1.3.0-D) is 1.3.0-C plus `law.officials`
and `law.informants`. Heat, busts, arrests and bribes are unchanged.

- **The payroll.** Any of four posts in any city, one of each per city. A week's pay is a share
  of net worth with a floor, like the bribe: Captain 0.4% (at least $20,000), DA 0.8% ($40,000),
  Judge 0.6% ($30,000), Customs 0.3% ($15,000). "Pay a week" extends from whenever the last one
  ends. An unpaid official stays on the books (LAPSED) but does nothing.

  | Official | What they do in their city | Exposure per favor |
  | --- | --- | --- |
  | Precinct Captain | Warrants drafted there get 12 more hours of warning; a word (bell and toast) when the Case comes within 5 of the Warrant line. | 10 per longer window, 5 per word |
  | District Attorney | Keeps 25% of every rise in the Case off the books; can quash one open or waiting warrant there every 7 days (no raid, Case to 45, as if lawyered). | 1 per Case point slowed, 30 per quash |
  | Judge | A warrant served there seizes and fines 30% less and locks the boss up for half as long, on top of any lawyer. | 15 per warrant softened |
  | Customs Officer | Airport checks on flights out of that city (a launch from home, the flight home from a visit) happen half as often. The no-fly line is untouched. | 5 per flight |

- **Internal Affairs.** The favor that takes an official to 60 exposure opens a file: the player
  is warned (bell, toast, feed, Discord) with the time of the sting, 24 hours later. Cutting
  the official loose before then ends it with no evidence; an official still on the books when
  the sting lands, paid or not, is **stung**: the post ends and 25 Case lands in that city
  (which can draft a warrant). The same post in that city can be filled again 48 hours after a
  cut or a sting, with exposure starting from zero. There is no roll anywhere in this.
- **Informants** sell information, never protection, and charge nothing when there is nothing
  to tell:
  - *The federal sweep* (0.2% of net worth, at least $25,000): the sweep's city and time, while
    it is still a secret.
  - *How a city's police work* (0.1%, at least $15,000): where take drag, busts and arrests start
    there, how hard busts hit and its police pressure. The game shows these only for the home
    city, and each city can only be bought once.
  - No tip changes anyone's Case.
- **Panel.** The Case panel gains a Payroll section (each official's status, exposure meter,
  Pay a week, Cut loose, and a hire form), an Informants section with the tips bought, and a
  "Have the DA quash it" button on warrants a working DA can quash.
- The trip screen's airport-check preview still shows the chance without Customs.
- **Seed.** The local seed's current round now uses `classic-og-v1.3-d`.

D invariants:

1. Every A, B and C invariant still holds.
2. An official helps only while paid, and only in their own city.
3. Internal Affairs is a visible state with a warning before any sting; nothing is rolled.
4. A cut official is never stung.
5. Customs never lets a boss past the no-fly line.
6. A tip never changes any Case, and costs nothing when the informant has nothing to say.
7. `classic-og-v1.3-c` and older rounds have no officials or informants.

### 1.3.0-E — City Identity & the Feds
Per-city law personalities. The federal sweep reads the **Federal** stage. Federal cases
follow a relocation.

#### Built in E

**Status: implemented.** Ruleset `classic-og-v1.3-e` (1.3.0-E) is 1.3.0-D plus `law.cities` and
`law.federal`. Heat, busts, arrests and bribes are unchanged.

- **City personalities.** Each city's police build a Case (`caseSpeed`, on every rise), let it
  go cold (`coolingSpeed`) and warn before a warrant (`warningHoursMultiplier`) at their own
  pace. The pace follows each city's existing street talk:

  | City | Builds | Cools | Warns | Line |
  | --- | --- | --- | --- | --- |
  | New York City | 1× | 1× | 1× | By the book. |
  | Detroit | 0.9× | 1.25× | 1× | Stretched thin. |
  | Miami Beach | 1.2× | 1× | 1× | Busy and watchful. |
  | Seattle | 0.8× | 1× | 1.5× | Patient, plenty of warning. |
  | Beverly Hills | 1.4× | 0.75× | 1× | Police on every corner. |
  | Las Vegas | 0.7× | 0.5× | 0.5× | Look away for a long time, then move all at once. |
  | Los Angeles | 1.25× | 1× | 1× | Quick to open a case. |
  | Atlanta | 0.7× | 1.25× | 1× | Look the other way. |

  The Case panel shows each city's line under its Case, and an informant's city tip now
  includes the personality too, before the player has a Case there.
- **Federal warrants.** A warrant drafted while the Case is at Federal gets half the usual
  window (after the city's multiplier; a Captain's extra hours are added on top, untouched).
- **The sweep.** When the federal sweep lands, a holder whose Case in the swept city is at
  Federal takes 10 more Case points there. The sweep's public results (who lost how many
  thugs) are unchanged, so nothing about anyone's Case can be read from them. The sweep's city
  is still chosen as before: weighting it by players' Cases would let others infer them.
- **Federal cases follow you.** On arrival in a new home, if the city left had a Case at
  Federal: an open or waiting warrant there moves first (re-targeted in the new home, where the
  Hideout is a target again, with a fresh window from the arrival); the new home's Case becomes
  the federal case's value or keeps its own if higher (never stacked); the old city drops to
  40. Both moves are FEDERAL receipts and the player gets a "Your federal case followed you"
  bell, toast and feed entry. Below Federal nothing moves.
- **Move screen.** Before the move is confirmed, the move panel says the federal case follows,
  what it will be in the chosen destination and what home keeps.
- **Seed.** The local seed's current round now uses `classic-og-v1.3-e`.

E invariants:

1. Every A to D invariant still holds.
2. A city's pace only scales rises and cooling; falls (laundering, warrants, cooling) are never
   made larger by it.
3. A federal case never stacks: the new home ends at the higher of the two values.
4. A relocation never shortens a warrant's time to respond.
5. Nothing public changes with a player's Wanted stage.
6. `classic-og-v1.3-d` and older rounds keep plain cities and no federal transfer.

### 1.3.0-F — Jobs, Feats & Titles
A police-side contact with one-time Jobs, clean-record feats and law-themed titles. Like 1.2.0-F,
these never pay cash, turns or protection.

### 1.3.0-G — Balance, Admin & Release
`qa:law` simulation, admin case viewer and case adjustment (audited), exploit audit pass,
mobile regression and release gate.

---

## Open questions

None from the brainstorm; every question is decided above. The first-pass numbers are still
proposals until `qa:law` pins them.

## Not in 1.3.0

- Replacing or changing the existing Heat, bust, arrest or bribe rules.
- A public Wanted level, wanted list or bounty board (bounties stay in the permanent backlog).
- Police that take turf or raze businesses.
- Armed police combat, resisting arrest, or NPC police crews (1.4).
- A Case that carries over between rounds.
- A local Case (below Federal) that follows a relocation.
- A Case that moves on trips, runs or flights.
- Paid or real-money ways to clear a case.
- Tipping off rivals, or any other way for one player to add evidence to another's case.
