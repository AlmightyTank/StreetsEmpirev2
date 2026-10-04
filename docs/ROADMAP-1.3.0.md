# StreetsEmpire v1.3.0 — Law Enforcement, Wanted Level & Corruption

## Brainstorm

**Status:** design only. Nothing in 1.3.0 is built. 1.2.0-G (Tournaments) and 1.2.0-H
(Balance, Admin & Release) are both built, so 1.3.0-A is unblocked.

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
- City identity grows naturally: Miami lets cases sit for a long time and then moves all at
  once, and Los Angeles opens cases fast.
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
| **Currency reports** | Large cash movements: big casino cage exchanges, business register spikes, large run sales. |

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
- Currency report: +4 per movement of $250,000 or more.
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

### 1.3.0-B — Evidence Sources
Direct evidence from busts, arrests, sacks, torches, hijacks and rackets, plus currency
reports. Cooling off. Laundering and Heat Shield hooks.

### 1.3.0-C — Warrants & Raids
Warrant drafting, warning windows, Hideout / business / personal warrants, the daily loss
cap, and notifications. Lawyers (retainer and lawyer up).

### 1.3.0-D — Corruption & Informants
Officials on payroll per city, retainers, exposure and Internal Affairs. Informants who sell
tips on sweeps and crackdowns.

### 1.3.0-E — City Identity & the Feds
Per-city law personalities. The federal sweep reads the **Federal** stage. Federal cases
follow a relocation.

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
