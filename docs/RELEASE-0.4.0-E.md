# StreetsEmpire 0.4.0-E: products release

E closes 0.4.0. It adds the last product consequence held back from C, product carried
into fights, makes supply screens warn before a job runs short, and adds the gates a
products season has to pass before it ships.

## What E adds for players

- **Fight supply.** Two opt-in supply policies on the Combat page:
  - **RAID** supplies the squad you send on a raid, drive-by or special raid.
  - **DEFENSE** supplies the crew holding your block when someone hits it.

  Neither burns anything until you save it, and **Stop supplying** switches it off again.
  A fight burns 0.25 units a committed thug, from the policy's primary, fallback and
  emergency products in order, and adds that product's Heat. Each side's battle report
  shows what it took in.

  | Product | Attack | Defense | Wounds |
  | --- | ---: | ---: | ---: |
  | Crack | x1.015 | x1.015 | x1 |
  | Weed | x0.97 | x1.03 | x0.9 |
  | Ecstasy | x1 | x0.98 | x1.1 |
  | Cocaine | x1.05 | x1 | x1.05 |
  | Meth | x1.03 | x1.05 | x1.2 |
  | Heroin | x0.96 | x1.01 | x0.7 |

  Strength effects stay within a few percent because fights turn on a narrow margin (home
  advantage x1.1, rolls ±10%). In an even fight the attacker wins 14% of the time; Cocaine
  raises that to about 30% and a Meth defense drops it to under 5%. A clearly bigger crew
  still wins either way. See [COMBAT-PRODUCTS-0.4.0-E.md](COMBAT-PRODUCTS-0.4.0-E.md).
- **Supply status.** Every supply panel (Scout, Produce, cooks, fights) leads with one line:
  - fully supplied, with the turns (or fights) of supply on hand;
  - running low, with when it switches to the fallback;
  - short, with how many whores, cooks or thugs go without and, for girls, roughly how much
    take that costs.

  Any saved policy can be reset: districts go back to crack only, fights stop burning.
- **Fixes carried from D.** A raid target holding only non-crack product is no longer refused
  as having nothing to take. The admin player inspector shows what each product holding is
  worth.

## Automated gate

From the repository root:

```powershell
npm run qa:release
```

With PostgreSQL running:

```powershell
npm run qa:release -- --with-db
```

`qa:release` now also runs **the product balance gates** (`npm run qa:products`), which fail
the release if any of these break:

1. **Effects (0.4.0-C).** In any crew size, mood and play style, one product is best on every
   job.
2. **Economy (0.4.0-D).** Any product is a money loop: Pip buying back at or above his price,
   net worth above his buyback, or ingredients below it.
3. **Combat (0.4.0-E).** Any product swings a fight by more than 20 points of win rate, or one
   product is best at attacking, defending and avoiding wounds.
4. **Full round (0.4.0-E).** Over a 28-day round, a single-product strategy beats every
   strategy that mixes products by district.

Write the reports with:

```powershell
npm run qa:products -- --output docs/PRODUCTS-SIMULATION-0.4.0-C.md --economy-output docs/PRODUCTS-ECONOMY-0.4.0-D.md --combat-output docs/COMBAT-PRODUCTS-0.4.0-E.md --round-output docs/PRODUCTS-ROUND-0.4.0-E.md
```

`--with-db` runs every `PRODUCT_INTEGRATION` suite (inventory, work supply, Heat, economy) and
the 0.4.0 season regression in `release-0.4.integration.test.ts`, alongside 0.3.0's. The
regression plays one products season through the HTTP API on the current ruleset:

- Three players join through the real join route.
- Pip's counter sells Ecstasy, Cocaine and Weed; a Casino policy runs Cocaine then Ecstasy; the
  preview matches the Scout receipt; Heat lands; the cooks burn Weed while cooking Meth.
- A raid with a RAID policy against a crew with a DEFENSE policy burns exactly each squad's
  supply, both reports show it, every product unit is accounted for, and clearing the
  defense policy stops the burn.
- Stored net worth equals the column worth plus every product at its value, in integer cents,
  after trades, trips, cooking and fights.
- Exploits are refused:
  - zero, negative and fractional quantities, unknown products, crack at the product counter,
    selling what you do not hold;
  - a replayed trade answers with the original result and charges once;
  - two buys racing for one shelf never oversell it, and two sales of the same stock never go
    negative;
  - policies for unknown jobs or products, clearing an unknown job, unknown fields;
  - cooking Cocaine; bribing more Heat than you have, or none.
- The round closes: trades and cooking are refused, and the Hall of Fame is written.

## Load smoke

Unchanged from 0.1.0-H. Start the production build, then:

```powershell
npm run qa:load
```

## Deploying 0.4.0

Migrations since 0.3.0-E, in order:

1. `20260917050000_player_products`
2. `20260917050100_player_products_nonnegative`
3. `20260917070000_work_supply_policies`
4. `20260917090000_heat`
5. `20260917110000_product_shelves`

E adds no migration: fight policies are rows in the existing `WorkSupplyPolicy` table under the
jobs `RAID` and `DEFENSE`. Rounds keep the ruleset they were created with, so a running 0.3.0
round is unchanged; create the next round on `classic-og-v0.4-e`.

## What to watch in the first products round

- **Cocaine and Meth shelves.** The round simulation expects Pip's short shelves (80 Cocaine
  an hour) to keep any one product from running a whole crew. If players routinely buy out a
  shelf the moment it lands, raise the cap rather than the price.
- **Busts.** Meth on every job is ruinous for a player who plays all day, by design: its Heat outruns decay. If real players still run
  it on the street, Heat is too cheap to manage; if nobody ever gets busted, it is too
  forgiving.
- **Fight supply.** Every battle report records each side's supply, so raid win rates with and
  without it can be compared. The simulation's largest swing is 15.6 points, in an even fight.
