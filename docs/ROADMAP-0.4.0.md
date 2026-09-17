# 0.4.0 roadmap - Products & Vice

Status: **in progress.** 0.4.0-A through 0.4.0-D are built.

0.3.0 made a round a season you play together. 0.4.0 turns Product from one generic
upkeep number into a management system: several products, each useful for different
work, supplied under a policy the player sets, with shortages that cost something.

Travel moves to **0.5.0**. Building the product economy first gives travel something
to change city to city: prices, availability, production bonuses and demand.

## Where 0.3.0 leaves us

- **Product is crack.** `RoundPlayer.crack` is read in about 40 places:
  - work upkeep (a Scout trip burns condoms, crack and beer);
  - whore happiness, and Produce Product, which cooks crack;
  - Pip's single Product shelf;
  - raid loot, drug runs and lure runs;
  - net worth, quests, and the admin grant, correction and inspector tools.
- **Work is already per district.** A Scout trip sends the whole crew into one district:
  - Casino, Nightclub, Low Rent, Urban Ghetto or Wino Slums;
  - it recruits at that district's rates;
  - it pays that district's multiplier;
  - it needs that district's thug cover.

  A "Casino shift" is one Scout trip into the Casino, so product policy attaches to the
  trip. No standing per-district crew assignments are needed.
- **Heat does not exist yet.** The ruleset has an `evidence` block with bust thresholds and
  decay, switched off, and nothing reads it.

## Decisions

- **Hybrid product inventory (decided).**
  - One `ProductInventory` layer everywhere, keyed by product.
  - `CRACK` stays on the existing `RoundPlayer.crack` column in every round, so no older
    round or crack reader changes.
  - Every other product lives in `PlayerProduct` rows, so a new drug never needs a column.
  - Definitions and effects live in the pinned ruleset. A round only knows the products its
    ruleset lists.
- **Heat is built in 0.4.0-C (decided).**
  - The evidence system is switched on as product Heat: risky products raise it, and it
    decays per turn.
  - High Heat has a cost, such as confiscation or a bust.
  - It is simulated together with the product effects.
- **Groups, not individuals.** Preferences belong to a role and a job ("Casino hoes",
  "production thugs"), never to individual workers.
- **Effects are game identities**, not real-world pharmacology.

## Stages and gates

| Stage | Deliverable | Gate |
| --- | --- | --- |
| **0.4.0-A - Product foundation** | Product catalog in the ruleset, hybrid inventory, `PlayerProduct` storage, products page, admin visibility. | A 0.4.0-A round plays exactly like 0.3.0-D; inventory changes are locked and never go negative; older rounds are untouched. |
| **0.4.0-B - Work supply** | Primary, fallback and emergency product per district, or strict supply; consumption aware of role, district, action, product and turns; shortfalls split across the trip; preview before clicking. | A trip that runs dry part-way is charged and paid proportionally, never all-or-nothing; the preview matches the result. |
| **0.4.0-C - Product effects & Heat** | Each product's identity for hoes and thugs by district and action; Heat switched on. | A simulation shows no product is the best answer everywhere, and Heat can be managed down. |
| **0.4.0-D - Product economy** | Pip's multi-product stock and restock, per-product prices and selling, Produce Product choices, product loot in drug runs and raids, product net worth, recon product hints. | Net worth, loot and store math stay integer cents and conserve product; no product is a free money loop. |
| **0.4.0-E - UI, consequences & balance** | Supply status on work screens, shortage warnings, full-round simulations, release regression. | A full-round simulation and a 0.3.0-E-style release gate pass on a products round. |

## 0.4.0-A - Product foundation

- **Ruleset catalog:** `products` lists each product's key, name, blurb and order.
  - Crack keeps its current numbers.
  - Ecstasy, Cocaine, Weed, Meth and Heroin are defined but cannot be acquired yet.
- **Storage:** `PlayerProduct(roundPlayerId, productKey, quantity)`, unique per player and
  product, deleted with the round.
- **Inventory service:** `ProductInventoryService` reads a player's whole inventory and
  applies changes inside the caller's locked transaction.
  - `CRACK` maps to the `crack` column; every other product maps to its row.
  - A change that would go negative, or names a product the round does not know, is refused.
- **Products page:** under Actions, it shows every product in the round with stock.
  Rounds without a catalog keep today's single Product.
- **Admin:** the player inspector shows product stock.
- **Net worth:** unchanged in A. Non-crack products count once they have prices, in D.

Built: the `classic-og-v0.4-a` ruleset (0.3.0-D balance plus the catalog), `PlayerProduct` with a
database check that stock is never negative, `ProductInventoryService`, `GET /api/game/products`
and the Products page, product stock in the admin player inspector, and a `PRODUCT_INTEGRATION`
suite in the release gate covering column and row mapping, whole-change refusal, unknown products,
concurrent spending and single-product rounds.

## 0.4.0-B - Work supply

- Per district, a supply policy: **primary → fallback → emergency → work without**, or
  **strict** (only the primary is ever burned).
- The Scout trip consumes by turn slices:
  - With 14 turns of Ecstasy and a 20-turn trip, turns 1-14 run on Ecstasy.
  - Turns 15-20 take the next allowed product, or run dry.
  - Income and happiness are weighted by those portions, so 1 Ecstasy never supplies
    100 hoes.
- **Three states per slice:** supplied, substituted, dry.
- **Preview before clicking:** consumption per turn, turns of supply left, and when it
  switches.
- Consumption is aware of role (hoes, thugs), district, action (work, produce) and turns.

Built, in the pinned `classic-og-v0.4-b` ruleset:

- **Jobs and policies.** A policy per job: each district, plus `PRODUCE` for the girls' shift while
  the thugs cook (a separate job keeps Produce's district hidden, as it always was). No saved
  policy means crack only, so every older habit keeps working.
- **Slices.** The trip's need is `floor(whores x rate x turns)`, the formula crack always used. Each
  allowed product covers what its stock allows, in order, and the rest is dry. A slice's share is
  its units over the need, and the take is weighted by `share x multiplier` per slice.
- **Numbers.** B ships the machinery, not the balance: every product burns at crack's rate and pays
  like crack, and a dry slice pays the same (`dryTakeMultiplier: 1`), so a crack-only player sees no
  change. Product take multipliers and the cost of running dry are set in 0.4.0-C.
- **Where products are burned.** Crack burned by a trip stays on the action's state, written to the
  crack column; other products leave through the inventory service in the same locked transaction.
- **Preview.** Scout and Produce show the job's policy, what the trip burns per turn and in total,
  and whether it stays supplied, switches after N turns, or runs dry. The receipt carries the same
  plan.
- **Admin.** Compensation grants can include non-crack products, capped at 500 each.
- **Still to come in C.** Whore happiness still reads crack only; product-aware happiness is part of
  product effects. Thugs do not burn product yet.

## 0.4.0-C - Product effects & Heat

Starting identities, to be tuned by simulation:

| Product | Identity | Hoes | Thugs | Tradeoff |
| --- | --- | --- | --- | --- |
| Crack | Street work, general use | Strong happiness and upkeep | Minor morale | Cheap and dependable, no specialty |
| Ecstasy | Casino, Nightclub | Higher take and client attraction | Poor | Expensive, specialized |
| Cocaine | Casino, high-end districts | Higher income | Better output | Costly, raises Heat |
| Weed | Low-pressure work | Happiness and stability | Strong morale | Slightly lower productivity |
| Meth | Production, thug jobs | Weak | Production and protection boost | Incidents, raises Heat |
| Heroin | Desperate, low-end crews | Strong short-term happiness | Keeps struggling crews working | Serious crash when supply runs out |

- **District fit:** preferred products per district (Casino: Ecstasy or Cocaine; Nightclub:
  Ecstasy; Urban Ghetto: Cocaine or Crack; Low Rent: Crack or Weed; Wino Slums: Crack). Fit is
  never a lock: any product works anywhere, just not as well.
- **Hoe effects:** earnings, happiness, client attraction, capacity use, departures,
  recruitment, and Heat.
- **Thug effects:** morale, protection cover, production output, raid readiness, defense, and
  injury chance.
- **Heat:** per-product Heat, decay per turn interval, visible to the player, and a cost at
  high Heat. The whole system is simulated before it ships.

Decided: C ships **production thugs only**; thug effects on raids, drive-bys and defense
(readiness, defense, injury chance) move to 0.4.0-E. High Heat costs **both** a take drag and
bust rolls. Heat comes down by **decay and bribes**, with bribes priced on net worth.

Built, in the pinned `classic-og-v0.4-c` ruleset:

- **Identities.** Each product carries `effects` for hoes (take, per-job fit, happiness weight,
  recruits, walkouts, an optional crash when it runs out, Heat per turn) and thugs (output,
  morale, walkouts, Heat per turn), plus a reference cost for simulation. Every multiplier
  applies only to the share of the trip that product supplied.
- **Running dry now costs.** The dry part of a trip takes x0.8 and walkouts x1.5. A crew whose
  Heroin ran out part-way crashes: walkouts on the dry part are multiplied again.
- **Needs round up**, so a small crew on a short trip cannot take a product's effects free.
- **Production thugs.** A `COOK` job with its own policy. Cooks burn 0.05 a thug a turn from
  what the girls' shift left; product sets output, adds morale for the shift and changes thug
  walkouts. Cooks without product work exactly as before.
- **Happiness reads every product.** Whore happiness counts stock at each product's weight
  (Heroin 2, Weed 1.4, Crack 1 and down to Meth 0.4). Combat, treatment and admin tools all
  recalculate with it.
- **Heat** is stored on the player (0-100) and cools 1 a turn interval on the turn clock, in
  settling and in every action. A trip adds its products' Heat, scaled by the square root of
  crew size. From 40 the take drags (up to 35% at 100); from 70 each Scout or Produce trip rolls a
  bust (up to 35% at 100), rolled at the Heat the trip started with. A bust seizes half of every
  product, fines 5% of cash and burns off 40 Heat.
- **Bribes.** `POST /api/game/heat/bribe` takes points off at the greater of $100 or 0.2% of net
  worth a point.
- **UI.** Heat in the status bar and a Heat panel with the bribe on Scout and Produce; supply
  previews and receipts show each plan's effects and Heat; Produce has a cooks' supply panel;
  receipts and the activity feed show busts and bribes; the admin inspector shows Heat.
- **Simulation gate.** `npm run qa:products` runs every product on every job for three crew
  sizes, happy and struggling, spending a banked cap and playing all day, as expected values.
  It fails if one product is best on every job anywhere. The current report is
  [PRODUCTS-SIMULATION-0.4.0-C.md](PRODUCTS-SIMULATION-0.4.0-C.md): every product wins at least
  one job, and Heat from max clears the bust line in 2.5 hours of waiting.
- **Not in C.** Client capacity use is unchanged. Reference costs are for simulation only until
  0.4.0-D prices products at Pip's and in net worth.

## 0.4.0-D - Product economy

- **Pip:** a dealer inventory with per-product buy and sell prices, stock and restock,
  using the existing lazy shelf clocks.
- **Produce Product:** a choice of what to make. Crack is cheap and high volume, Meth is
  moderate with high output, and Ecstasy is costly with low output and high value. Cocaine is
  bought, stolen or imported, never cooked.
- **Loot:** drug runs and raids take a mix of products. Recon can show product stock level and
  the primary product without exact counts.
- **Net worth:** every product counts at its ruleset value.
- **Reconcile Produce batches.** The Produce page already offers batch types from earlier work
  (Weed, Coke, Downers, Ecstasy, Heroin, Acid). They do not match this catalog and all still produce
  crack; D replaces them with the catalog's producible products.

Built, in the pinned `classic-og-v0.4-d` ruleset (0.4.0-C balance plus the economy):

- **Prices live on the product.** Each non-crack product carries `economy`: net worth value, Pip's
  buy and sell prices and shelf, and a recipe where it can be cooked. Crack keeps Pip's Product
  item, `perCrackCents` and `production.crack`. Prices sit at 0.4.0-C's reference costs.
- **Pip's counter.** `GET /api/game/products` lists each product with its value, Pip's prices,
  a settled shelf and the most you can buy; `POST /api/game/products/trade` buys or sells. Each
  product has its own shelf on the lazy restock clock (`ProductShelf`, no row means full),
  shortened by standing with Pip, and a trade counts as a day at Pip's for reputation. Crack is
  still bought and sold as Product at Pip's store, which now points to the Products page.
- **Produce Product** cooks what you pick from the round's recipes: Crack (0.5 a thug a turn, $5),
  Meth (0.4, $7, draws Heat) or Ecstasy (0.15, $15, draws Heat). Cocaine, Weed and Heroin cannot be
  cooked. Cooked product lands in its own stock, and a workshop bonus applies to any recipe. Older
  rounds cook crack whatever the batch was called, as before; the old batch list is gone from the page.
- **Net worth** counts every product at its value, in integer cents, in actions, settling, combat,
  treatment, bribes, grants and battle voids. The combat target list reads stored worth.
- **Loot.** A raid's product haul is drawn from the whole stash with crack's old share and carry
  caps, then split across products in proportion to holdings by largest remainder, so the parts
  sum exactly and every unit taken lands with the attacker. Drug runs burn the stash the same way.
  Reports list each product that moved, and voiding a battle returns it.
- **Recon** on a product round shows a stash level (empty, light, stocked, heavy, by units per
  whore) and the product held most, instead of the crack count.
- **Gate.** `productLoops` fails if Pip ever buys back at or above his price, net worth values a
  unit above Pip's buyback, or ingredients cost less than the buyback or the value. It runs in unit
  tests and in `npm run qa:products`, which writes
  [PRODUCTS-ECONOMY-0.4.0-D.md](PRODUCTS-ECONOMY-0.4.0-D.md). A `PRODUCT_INTEGRATION` suite checks
  trades, shelves, recipes, raid conservation, recon and net worth against PostgreSQL.

## 0.4.0-E - UI, consequences & balance

- Supply status on work screens: fully supplied with turns left, running low with when it
  switches, or short with how many workers and the estimated income loss.
- Full-round simulations so no product is the automatic answer.
- A release regression and exploit checks in the 0.3.0-E style, against a products round.

## Not in 0.4.0

- **Travel and city economies (0.5.0).** Cities already carry scout, income and crack
  modifiers; 0.5.0 extends them to per-product prices and demand.
- **Individual worker records.** Preferences stay per role and job.
- **Pills.** Possible later as one more ruleset entry, with no schema change.
