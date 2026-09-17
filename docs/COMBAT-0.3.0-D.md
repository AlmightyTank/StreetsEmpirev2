# 0.3.0-D defense reinforcement: findings

Reinforcement was simulated before touching a ruleset, as the roadmap asks. The full
tables are in [COMBAT-SIMULATION-0.3.0-D.md](COMBAT-SIMULATION-0.3.0-D.md); rerun them with
`npm run qa:reinforcement`.

## What the numbers say

Combat turns on a narrow threshold. The defender already gets a x1.1 home bonus and rolls
only vary ±10%, so a mirror raid is won by the attacker about 14% of the time today. Any
help added on top of that moves results a long way:

| Help added (share of the defender's own squad) | Mirror raid | Attacker 25% bigger | Shotguns into pistols | Late into middle |
| --- | ---: | ---: | ---: | ---: |
| None (today) | 13.9% | 93.5% | 100% | 100% |
| 5% | 0.1-0.3% | 81.6% | 100% | 100% |
| 10% | 0% | 65.1% | 100% | 100% |
| 15% | 0% | 44.5% | 99.0% | 100% |
| 25% | 0% | 13.9% | 84.0% | 100% |
| 50% | 0% | 0% | 13.9% | 100% |

Attacker win rates, 10,000 raids per cell, same dice in every row.

- **Uncapped help is out.** The roadmap's first idea, allies lending a share of their crew
  (even one ally sending a quarter), adds 25-100% strength and makes an alliance member
  close to unraidable by anyone who is not already far stronger.
- **Mirror raids are already defended.** Even 5% help takes them from 14% to almost nothing,
  so reinforcement mostly decides the fights where the attacker has a modest edge.
- **Clearly stronger attackers are untouched** at 25% or less: a late crew or a gun-unlock
  advantage still wins.
- **Wounds on allies are small**: at a 10% cap, allies take about 0.1-0.3 wounded thugs per
  defense, spread across the helpers.
- **It cuts against swing.** A flat bonus makes outcomes more predictable, the opposite of the
  high-highs-low-lows direction, unless the help itself is uncertain.

## Options

1. **Small flat cap: help up to 10% of the defender's own squad, from up to 2 allies.**
   A 25%-bigger attacker drops from 93% to 65%; stronger attackers are unaffected. Simple
   and readable in a battle report, but it flattens outcomes.
2. **Chance to show up: help up to 25% of own squad, but allies arrive only half the time.**
   Averages to the same kind of effect (the 25%-bigger attacker lands about 54% of raids;
   shotguns into pistols about 92%), with more swing: some defenses get the crew, some don't.
3. **Hold reinforcement for 0.3.0-E**, shipping the rest of D now, and tune it in the
   alliance-round balance pass with real data from alliance rounds.

In every option, only allies in the same city with fit thugs can help, wounds are shared in
proportion, and help never counts toward eligibility or the defender's raid shield.
