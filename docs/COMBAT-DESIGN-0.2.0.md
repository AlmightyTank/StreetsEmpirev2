# Combat — staged 0.2.0 design

Status: **0.2.0-F public raid round baseline implemented.** Reputation is
built and is the existing route to better guns. The A values below remain useful
for balance experiments; B pins a cash-only live model at `0.2.0-B.1`, C
pins persistent temporary wounds at `0.2.0-C.1`, D pins recon and retaliation
at `0.2.0-D.1`, E pins onboarding raid polish and drive-bys at `0.2.0-E.2`,
and F pins the first production-facing public raid round at `0.2.0-F.1`.

## Purpose and scope

Combat makes crew, supplies, weapons and reputation useful against other players.
The initial objective is a cash raid: spend turns, commit a squad, fight the
automatic defense, and carry away limited cash on a win.

For A we assume defeat should be a recoverable setback. The model transfers cash
and projects temporary wounds. It destroys no guns, permanently kills nobody,
and does not steal workers, vehicles, supplies or reputation. Those are design
assumptions for this experiment, not decisions the player has to make in the UI.

A contains pure calculations, hypothetical crew fixtures, deterministic
simulations, regression tests and this specification. B adds the attack route,
database migration, player-facing combat screen, reports and a selectable
`classic-og-v0.2` ruleset for new rounds. C adds persistent recovery batches,
fit crew across actions, and medicine treatment in `classic-og-v0.2-c`. Existing
rounds still use their pinned rulesets. D adds a `classic-og-v0.2-d` ruleset
with recon intel and revenge windows. E adds local onboarding rivals, weighted
loot, repeat-target diminishing returns, public legacy information, fuller
achievements and drive-bys. F adds `classic-og-v0.2-f` as the first public raid
round and makes production rankings and attack lists depend on active player
accounts only.

## Stages and completion gates

| Stage | Deliverable | Gate |
| --- | --- | --- |
| **0.2.0-A — Model** | Squad equipment, strength, outcomes, bounded loot and projected wounds; repeatable early/middle/late experiments. | Implemented. Tests demonstrate progression, numerical counters, reproducibility and conservation. Simulation tradeoffs are recorded below. |
| **0.2.0-B — First raid** | One playable cash raid, eligible targets, automatic defense, protection, turn cost and reports for both players. | Implemented. Atomic two-player settlement; duplicate/concurrent attacks cannot double-spend or bypass protection; an offline player cannot be repeatedly drained. |
| **0.2.0-C — Recovery** | Persistent wounds, recovery and evaluation of medicine treatment. | Implemented. Injury settlement reconciles due recovery batches, fit thugs drive combat/work/production, medicine treatment is retry-safe, and B remains cash-only. |
| **0.2.0-D — Strategy** | Evaluate intelligence, retaliation, transport and other raid objectives. | First slice implemented: strategy-round players start attack-ready, newcomer protection is disabled for immediate testing, recon costs 2 turns and persists a 60-minute intel report, and defenders can retaliate against attackers for 24 hours through target protection and the minimum-strength restriction. |

B resolves its relationship to C by shipping bounded cash losses with wounds
disabled. C ships recovery separately so old combat rounds do not silently grow
new penalties. The C raid UI presents wounds as temporary unavailable crew and
shows natural recovery plus medicine treatment. D ships separately as well:
existing B and C rounds do not gain recon data, revenge targeting, or the
additional `CombatIntel` rows in their page contract. E and F follow the same
pinning rule for their added raid polish, drive-by and public-round behavior.

## Squad selection and equipment

The attacker chooses **1–100 fit thugs**, within their available crew. Defense
automatically fields up to **100 fit thugs**. Both sides equip their strongest
available weapons, one gun per fighter. Additional guns and reserve thugs add
no power to that engagement. Unarmed thugs can participate.

The calculator expects `thugs` to mean currently fit thugs. In A this was a
fixture input. In C the service settles recovery batches first and passes only
fit crew into combat, scouting and production while retaining total thugs for
ownership and net worth.

Equipment selection follows the supplied weapon powers, so a variant ruleset
can reorder weapon strength without rewriting the calculator. Inventory is
never consumed, multiplied or changed by equipment assignment.

The symmetric engagement cap is an experiment: it lets players eventually catch
up to an older empire's deployed numbers, but makes gear decisive once both sides
reach the cap. Reserves could absorb later wounds when recovery exists. A does
not simulate that sequence, and it does not establish that 100 is the right cap.

## Strength and uncertainty

For each side:

```text
base strength = committed thugs × 1 + sum(equipped weapon power ^ 0.5)
morale        = 0.75 + 0.25 × thug happiness / 100
strength      = base strength × morale

attacker effective strength = strength × random factor
defender effective strength = strength × 1.10 × random factor
random factor               = uniform [0.90, 1.10)
```

The two strength rolls are independent. The attacker wins only when their
effective strength is greater; an exact tie is a successful defense. Each raid
consumes four injected random draws in a stable order: attacker strength,
defender strength, attacker wound rounding, defender wound rounding.

The current weapon powers remain **1 / 4 / 9 / 22**. With the square-root
conversion and one point for the fighter, a fully happy thug contributes:

| Equipment | Strength per fighter |
| --- | ---: |
| Unarmed | 1.00 |
| Pistol | 2.00 |
| Shotgun | 3.00 |
| Tek-9 | 4.00 |
| AK-47 | 5.69 |

The AK is roughly 2.85 pistol fighters, not 22. Directly adding its raw power
would instead make it 11.5 pistol fighters. The softened curve preserves a
numerical counter to elite equipment without changing store prices, stock,
net worth or reputation requirements.

Morale uses the existing thug happiness snapshot. It does not introduce a
second happiness system. Zero happiness leaves 75% combat effectiveness to
avoid total helplessness, but supply neglect can still decide a close fight.

Bounded randomness deliberately allows certain outcomes. If the attacker's
unrolled strength divided by the defender's strength including home advantage
exceeds `1.10 / 0.90`, a win is guaranteed. Below the inverse ratio, a win is
impossible. The intended claim is that a larger weaker-equipped squad can
overcome a smaller elite squad, not that every underdog has an upset chance.

## Turns, loot and conservation

Each valid raid costs the attacker **10 turns**, win or lose. Defense consumes
no turns. An invalid request fails before any random draws. Eligibility and
protection checks are still responsibilities of the future service.

On an attacker victory:

```text
exposed cash = max(0, defender cash − $5,000)
cash limit   = floor(exposed cash × 5%) in integer cents
carry limit  = $100 × attackers who finish unwounded
loot         = min(cash limit, carry limit)
```

Defeat grants no loot to either side. Cash transfers exactly: the attacker's
gain equals the defender's loss. Nothing is minted, even above JavaScript's
safe integer money range; all raid money arithmetic uses BigInt cents. Report
averages are display-only numbers.

For example, a defender with $20,000 exposes $15,000. At most $750 is stolen
on that raid, and a smaller surviving squad can carry less. A single fighter
raiding a rich undefended target can carry at most $100. A defender at or below
$5,000 loses no cash even if they lose the fight. The cash floor is not a full
protection system: an attacker could still wound them under this model.

## Projected wounds

In a contested fight, the winning squad expects **2%** wounded and the losing
squad expects **8%**. Stochastic rounding gives integer people while preserving
these averages. The absolute cap is the smaller of squad size and
`ceil(squad size × 10%)`. This whole-person rounding means one fighter can be
wounded in a one-fighter squad; tiny squads are not permanently immune.

Wounds project a **120-minute** recovery time and reduce the winning attacker's
carrying capacity. Against zero defenders, the attacker wins without wounds.
In C each wound becomes a `CombatInjury` recovery batch and updates the
player's cached `woundedThugs`. Guns remain in inventory even when their
carriers are wounded.

These deliberately simple wound rates depend on winner/loser status, not the
strength margin. An overwhelming attack can therefore wound more attackers in
absolute terms than a tiny defense. That is a known model simplification to
evaluate before C, not a claim of realistic attrition.

Medicine already treats infections in the economic loop. Any combat treatment
must account for competition with that existing use and its restock limits.
C's first treatment rule is one medicine per wounded thug, applied immediately
to the oldest pending injury batches. This keeps treatment explicit and easy to
rebalance after playtesting.

## Experiments and findings

See [the generated report](COMBAT-SIMULATION-0.2.0-A.md) for 16 matchups, each
run 10,000 times with seed `20260910`. Each trial resets its inputs; these are
single-fight experiments, not a simulated 28-day round.

Representative fixtures are:

| Fixture | Fit crew | Pistols | Shotguns | Tek-9s | AK-47s | Cash when defending |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Early | 10 | 10 | 0 | 0 | 0 | $20,000 |
| Middle | 40 | 20 | 12 | 6 | 2 | $150,000 |
| Late | 100 | 40 | 30 | 20 | 10 | $1,000,000 |

These describe hypothetical progression states. They do not assert how many
days a player needs to accumulate these inventories or complete reputation.

Findings for revision A.1:

- **Home advantage is substantial.** Equal crews win 14.62% of attacks in
  this run. A 10% strength bonus is not a ten-percentage-point change in win
  chance. A neutral-defense variant is tested near 50%. Keep the current
  candidate if we want players to build an advantage before initiating.
- **Modest extra numbers matter.** 25 pistol fighters attacking 20 won 93.57%.
  The narrow random band produces a sharp transition between favorable and
  unfavorable fights. This is a deliberate preparation-first candidate.
- **Reputation equipment pays off.** At equal headcount, each adjacent weapon
  upgrade won at least 99.93% against the previous tier in these fixtures.
  Scarcity constrains these uniform inventories; mixed crews are also covered.
- **Elite weapons have a numerical counter.** 40 pistols beat 10 AKs in every
  trial, and the worst-roll boundary is covered by a deterministic test.
- **Loot caps do not prevent bullying.** The middle crew always beats the early
  crew and can steal $750 per win. Target-wide protection remains required.
- **The engagement cap has a strong effect.** The late fixture always beats
  1,000 pistol-equipped defenders because only 100 can fight. This exposes the
  cap's strategic consequence and is a decision to revisit before live play.
- **Per-fight loot is not profitability.** The report includes loot per turn,
  but excludes displaced scouting income, repeated raids, recovery, restocking,
  changing cash balances and coordinated attackers. It cannot justify a
  sustainable combat-income rate or a final protection duration.

## Decisions and implementation required before B

1. **Protection and eligible targets.** Define newcomer protection, recovery
   protection after a raid across all attackers, attacker cooldowns and any
   restrictions on attacking far weaker crews. Check all of these while both
   players are locked. Self-attacks and cross-round attacks must be rejected.
   Same-city targeting is the initial proposal; city populations and eventual
   travel need to be considered before enforcing it.
2. **Public information.** Decide which target stats are visible and whether
   to show a strength estimate. A knows both inputs exactly for measurement;
   that is not authorization to expose hidden inventories through the API.
3. **Defense tuning and squad cap.** Review the 15% mirror attack win rate and
   the result against 1,000 reserves. Possible next experiments are a smaller
   home bonus, broader variance, and a reserve contribution. Change one at a
   time and compare identical seeds.
4. **Recovery boundary.** Choose cash-only B or bring minimal real wounds into
   B. A's projected recovery must not be silently treated as implemented.
5. **Round and model pinning.** Introduce a separately versioned combat ruleset
   and explicitly select it for new rounds. Persist model revision and full
   reports for replay. Do not change the meaning of existing round pins.

The existing action pipeline locks one player. B needs a two-player transaction
that locks IDs in a consistent order, checks the replay record after locking,
settles both snapshots without marking the offline defender active, validates
protection, resolves the raid, and writes both resource changes and reports
atomically. Derived net worth and rankings must use both final balances, not
an intermediate state where only one side has been updated.

Integration tests must cover duplicate raids, simultaneous attacks on one
defender, reciprocal A-to-B/B-to-A attacks, rollback after either update,
protection earned by the first attack blocking the next, and identical reports
on retries. Production randomness must be server-owned; the seeded simulator
RNG is only for experiments.

## Running and extending A

```powershell
npm run qa:combat
npm run qa:combat -- --samples 10000 --seed 20260910 --output docs/COMBAT-SIMULATION-0.2.0-A.md
npm test
npm run typecheck
npm run build
```

The CLI defaults to 10,000 trials per matchup, accepts 1–1,000,000 trials and
an unsigned 32-bit seed, prints Markdown, and writes a file only with `--output`.

- Candidate balance: `packages/rulesets/src/combat-prototype.ts`.
- Pure equipment and raid calculations: `packages/rules-engine/src/calculations/combat.ts`.
- Fixtures, seeded runs and report formatting: `packages/rules-engine/src/simulations/combat.ts`.
- Behavioral and balance checks: `packages/rules-engine/src/__tests__/combat.test.ts`.
- CLI: `scripts/qa/combat-sim.mjs`.

The prototype is exported for experiments but absent from the live ruleset
registry. All combat coefficients live in its typed model. Pure functions take
an explicit model and RNG; tests verify variant rules flow through equipment,
morale, turns, defense, loot and wounds. Updating balance should change the model
revision, rerun the scenarios, and update this discussion with the new evidence.
