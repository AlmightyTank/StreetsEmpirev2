# 0.4.0 roadmap - Products & Vice

Status: **in progress.** 0.4.0-A and 0.4.0-B are built.

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
