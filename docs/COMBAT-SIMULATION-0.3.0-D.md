# 0.3.0-D defense reinforcement simulation

Combat model: 0.2.0-H.1 (defense bonus x1.1, variance ±10%, squad cap 100).
Samples per row: 10,000. Seed: 20260917. Every row uses the same dice, so differences come from the rules.

Allies send their best weapons for the thugs they send. Reinforcements are trimmed to the cap, and only the
defender's own squad counts toward the squad cap. Defender wounds are split in proportion between the defender and the allies.
Loot is unchanged by reinforcement except through who wins. No live rules are set by this report.

## Early mirror

Starting crews: 10 pistols each, allies the same.

| Reinforcement | Help | Defense strength | Attacker wins | Mean loot | Wounds: attacker / defender / allies |
| --- | ---: | ---: | ---: | ---: | ---: |
| None (today) | 0 | 22.0 | 13.9% | $226 | 0.72 / 0.28 / 0.00 |
| Help capped at 5% of own squad | 0 | 22.0 | 13.9% | $226 | 0.72 / 0.28 / 0.00 |
| Help capped at 10% of own squad | 1 | 24.2 | 0.1% | $2 | 0.80 / 0.20 / 0.02 |
| Help capped at 15% of own squad | 1 | 24.2 | 0.1% | $2 | 0.80 / 0.20 / 0.02 |
| Help capped at 25% of own squad | 2 | 26.4 | 0.0% | $0 | 0.80 / 0.20 / 0.04 |
| Help capped at 50% of own squad | 5 | 33.0 | 0.0% | $0 | 0.80 / 0.20 / 0.10 |
| 1 ally · 25% of crew, no cap | 2 | 26.4 | 0.0% | $0 | 0.80 / 0.20 / 0.04 |

## Middle mirror

40 mixed guns each, allies the same.

| Reinforcement | Help | Defense strength | Attacker wins | Mean loot | Wounds: attacker / defender / allies |
| --- | ---: | ---: | ---: | ---: | ---: |
| None (today) | 0 | 122.5 | 13.9% | $1,266 | 2.87 / 1.14 / 0.00 |
| Help capped at 5% of own squad | 2 | 135.0 | 0.1% | $9 | 3.20 / 0.80 / 0.04 |
| Help capped at 10% of own squad | 4 | 143.8 | 0.0% | $0 | 3.20 / 0.80 / 0.08 |
| Help capped at 15% of own squad | 6 | 152.6 | 0.0% | $0 | 3.20 / 0.80 / 0.12 |
| Help capped at 25% of own squad | 10 | 168.0 | 0.0% | $0 | 3.20 / 0.80 / 0.20 |
| Help capped at 50% of own squad | 20 | 201.0 | 0.0% | $0 | 3.20 / 0.80 / 0.40 |
| 1 ally · 25% of crew, no cap | 10 | 168.0 | 0.0% | $0 | 3.20 / 0.80 / 0.20 |

## Late mirror

100 mixed guns each, at the squad cap.

| Reinforcement | Help | Defense strength | Attacker wins | Mean loot | Wounds: attacker / defender / allies |
| --- | ---: | ---: | ---: | ---: | ---: |
| None (today) | 0 | 337.6 | 13.9% | $3,406 | 7.17 / 2.83 / 0.00 |
| Help capped at 5% of own squad | 5 | 368.9 | 0.3% | $83 | 7.98 / 2.02 / 0.10 |
| Help capped at 10% of own squad | 10 | 400.2 | 0.0% | $0 | 8.00 / 2.00 / 0.20 |
| Help capped at 15% of own squad | 15 | 422.2 | 0.0% | $0 | 8.00 / 2.00 / 0.30 |
| Help capped at 25% of own squad | 25 | 466.2 | 0.0% | $0 | 8.00 / 2.00 / 0.50 |
| Help capped at 50% of own squad | 50 | 554.2 | 0.0% | $0 | 8.00 / 2.00 / 1.00 |
| 1 ally · 25% of crew, no cap | 25 | 466.2 | 0.0% | $0 | 8.00 / 2.00 / 0.50 |

## Attacker 25% bigger

25 pistols into 20, allies of 20. Solo, this attacker usually wins.

| Reinforcement | Help | Defense strength | Attacker wins | Mean loot | Wounds: attacker / defender / allies |
| --- | ---: | ---: | ---: | ---: | ---: |
| None (today) | 0 | 44.0 | 93.5% | $5,723 | 0.60 / 1.52 / 0.00 |
| Help capped at 5% of own squad | 1 | 46.2 | 81.6% | $4,999 | 0.78 / 1.38 / 0.07 |
| Help capped at 10% of own squad | 2 | 48.4 | 65.1% | $3,987 | 1.03 / 1.18 / 0.12 |
| Help capped at 15% of own squad | 3 | 50.6 | 44.5% | $2,724 | 1.33 / 0.93 / 0.14 |
| Help capped at 25% of own squad | 5 | 55.0 | 13.9% | $851 | 1.79 / 0.56 / 0.14 |
| Help capped at 50% of own squad | 10 | 66.0 | 0.0% | $0 | 2.00 / 0.40 / 0.20 |
| 1 ally · 25% of crew, no cap | 5 | 55.0 | 13.9% | $851 | 1.79 / 0.56 / 0.14 |

## Shotguns into pistols

A reputation unlock against a pistol block with pistol allies.

| Reinforcement | Help | Defense strength | Attacker wins | Mean loot | Wounds: attacker / defender / allies |
| --- | ---: | ---: | ---: | ---: | ---: |
| None (today) | 0 | 44.0 | 100.0% | $4,898 | 0.41 / 1.60 / 0.00 |
| Help capped at 5% of own squad | 1 | 46.2 | 100.0% | $4,898 | 0.41 / 1.60 / 0.08 |
| Help capped at 10% of own squad | 2 | 48.4 | 100.0% | $4,898 | 0.41 / 1.60 / 0.16 |
| Help capped at 15% of own squad | 3 | 50.6 | 99.0% | $4,846 | 0.42 / 1.59 / 0.24 |
| Help capped at 25% of own squad | 5 | 55.0 | 84.0% | $4,116 | 0.60 / 1.41 / 0.35 |
| Help capped at 50% of own squad | 10 | 66.0 | 13.9% | $681 | 1.44 / 0.57 / 0.28 |
| 1 ally · 25% of crew, no cap | 5 | 55.0 | 84.0% | $4,116 | 0.60 / 1.41 / 0.35 |

## Late into middle

A big solo crew hitting a middle crew whose allies are middle too.

| Reinforcement | Help | Defense strength | Attacker wins | Mean loot | Wounds: attacker / defender / allies |
| --- | ---: | ---: | ---: | ---: | ---: |
| None (today) | 0 | 122.5 | 100.0% | $16,103 | 2.00 / 3.20 / 0.00 |
| Help capped at 5% of own squad | 2 | 135.0 | 100.0% | $16,103 | 2.00 / 3.19 / 0.16 |
| Help capped at 10% of own squad | 4 | 143.8 | 100.0% | $16,103 | 2.00 / 3.20 / 0.32 |
| Help capped at 15% of own squad | 6 | 152.6 | 100.0% | $16,103 | 2.00 / 3.20 / 0.48 |
| Help capped at 25% of own squad | 10 | 168.0 | 100.0% | $16,103 | 2.00 / 3.20 / 0.80 |
| Help capped at 50% of own squad | 20 | 201.0 | 100.0% | $16,103 | 2.00 / 3.20 / 1.60 |
| 1 ally · 25% of crew, no cap | 10 | 168.0 | 100.0% | $16,103 | 2.00 / 3.20 / 0.80 |
