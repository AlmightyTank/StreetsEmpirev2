# 0.4.0-D product economy

Ruleset: classic-og-v0.4-e. Every number here is integer cents in the ruleset.

## Gate: no free money loop

**Passes.** For every product, Pip buys back for less than he sells, net worth values a unit at no more than Pip pays, and ingredients cost at least what Pip pays, so buying, cooking or holding product never mints money or net worth.

## Pip's counter

| Product | Buy | Sell | Net worth | Shelf | Round trip loses |
| --- | ---: | ---: | ---: | ---: | ---: |
| Crack (Pip's Product) | $10.00 | $3.00 | $3.00 | 500 / 500 every 30 min | 70% |
| Weed | $8.00 | $2.40 | $2.40 | 400 / 400 every 30 min | 70% |
| Ecstasy | $30.00 | $9.00 | $9.00 | 150 / 150 every 30 min | 70% |
| Cocaine | $40.00 | $12.00 | $12.00 | 80 / 80 every 60 min | 70% |
| Meth | $15.00 | $4.50 | $4.50 | 200 / 200 every 30 min | 70% |
| Heroin | $15.00 | $4.50 | $4.50 | 100 / 100 every 60 min | 70% |

## Produce

Cooking pays by saving the difference between Pip's price and the ingredients, before thug happiness, cook supply and variance.

| Recipe | Per thug per turn | Ingredients each | Pip sells at | Saved per thug per turn | Heat per turn, 40 thugs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Crack | 0.5 | $5.00 | $10.00 | $2.50 | 0 |
| Ecstasy | 0.15 | $15.00 | $30.00 | $2.25 | 0.6 |
| Meth | 0.4 | $7.00 | $15.00 | $3.20 | 0.8 |

## Loot

Raids draw their product haul from the whole stash, capped by the same share (40%) and carry (5 a fit attacker) crack always had, then split it across products in proportion to what the target holds. Drug runs burn the defender's stash the same way. Every unit a raid takes lands with the attacker.
