# 0.2.0-A combat simulation

Model: 0.2.0-A.1. Samples per matchup: 10,000. Seed: 20260910.

Each trial resets both crews and cash. Fixtures are hypothetical progression snapshots, not simulated player growth.
Win rates are empirical. Mean loot includes defeats; loot per turn excludes recovery and foregone scouting income.
Wounds are temporary projections. This report does not validate repeated attacks, protection, or the round economy.

| Matchup | A/D strength | Attacker wins | Mean loot | Loot/turn | Mean wounds A / D | Max loot |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Early mirror | 0.91 | 14.62% | $109.65 | $10.96 | 0.72 / 0.29 | $750.00 |
| Middle mirror | 0.91 | 14.62% | $573.19 | $57.32 | 2.85 / 1.15 | $4000.00 |
| Late mirror | 0.91 | 14.62% | $1432.76 | $143.28 | 7.12 / 2.88 | $9800.00 |
| Early into middle | 0.16 | 0.00% | $0.00 | $0.00 | 0.80 / 0.80 | $0.00 |
| Middle into early | 5.06 | 100.00% | $750.00 | $75.00 | 0.80 / 0.80 | $750.00 |
| Middle into late | 0.33 | 0.00% | $0.00 | $0.00 | 3.21 / 2.00 | $0.00 |
| Late into middle | 2.50 | 100.00% | $7250.00 | $725.00 | 2.00 / 3.21 | $7250.00 |
| 25 versus 20 pistols | 1.14 | 93.57% | $2291.67 | $229.17 | 0.60 / 1.52 | $2500.00 |
| 20 shotguns versus 20 pistols | 1.36 | 100.00% | $1959.42 | $195.94 | 0.41 / 1.60 | $2000.00 |
| 20 Tek-9s versus 20 shotguns | 1.21 | 99.93% | $1958.03 | $195.80 | 0.41 / 1.60 | $2000.00 |
| 20 AKs versus 20 Tek-9s | 1.29 | 100.00% | $1959.42 | $195.94 | 0.41 / 1.60 | $2000.00 |
| 40 pistols versus 10 AKs | 1.28 | 100.00% | $3919.70 | $391.97 | 0.80 / 0.80 | $4000.00 |
| Low morale middle mirror | 0.68 | 0.00% | $0.00 | $0.00 | 3.21 / 0.80 | $0.00 |
| One thug versus rich undefended | undefended | 100.00% | $100.00 | $10.00 | 0.00 / 0.00 | $100.00 |
| Protected starting cash | 5.06 | 100.00% | $0.00 | $0.00 | 0.80 / 0.80 | $0.00 |
| Late versus 1,000 pistol reserves | 1.40 | 100.00% | $9800.00 | $980.00 | 2.00 / 8.00 | $9800.00 |

## Scenario purposes

- **Early mirror:** 10 pistols against 10 pistols; home advantage.
- **Middle mirror:** 40 mixed guns against the same crew.
- **Late mirror:** 100 mixed guns against the same crew.
- **Early into middle:** Tests whether randomness can rescue a large strength deficit.
- **Middle into early:** Checks loot exposure when an older crew attacks a smaller one.
- **Middle into late:** Progression gap with a larger and better armed defender.
- **Late into middle:** Strength surplus; B must separately control target eligibility.
- **25 versus 20 pistols:** A modest numerical advantage against the defense bonus.
- **20 shotguns versus 20 pistols:** First reputation unlock gives a useful advantage.
- **20 Tek-9s versus 20 shotguns:** Second reputation unlock matters.
- **20 AKs versus 20 Tek-9s:** Top reputation unlock matters.
- **40 pistols versus 10 AKs:** A larger lightly armed crew can defeat an elite squad.
- **Low morale middle mirror:** Supplies and existing happiness affect readiness.
- **One thug versus rich undefended:** Loot carrying capacity bounds a token attack.
- **Protected starting cash:** A combat win cannot consume the protected $5,000.
- **Late versus 1,000 pistol reserves:** Only 100 defenders participate; reserves add no strength.
