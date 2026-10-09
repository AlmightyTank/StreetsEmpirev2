# StreetsEmpire 1.6.0 — Supply Lines & City Footprints

## Purpose

1.6.0 expands the map by giving players a complete supply and distribution loop. Players commit game cash to bulk orders, arrange transport in one or more trips, stage stock at properties, assign dealer crews to local markets, and earn money as those crews sell the stock.

**The question:** How does my organization move supply across the map and turn it into local business?

**Core loop:**

> Order in bulk → collect in loads → store locally → stock dealer crews → sell → reinvest and reorder

Properties, vehicles, and cities should support this loop. They should create choices about capacity, distance, timing, cost, and market demand rather than grant passive income or remove existing risks.

## Design principles

1. **Supply must be earned through logistics.** Dealer crews can sell only stock that has been delivered and assigned to them.
2. **Orders can exceed one vehicle's capacity.** A paid order remains available for pickup in partial loads; players can return in later trips until it is collected.
3. **Show the commitment before dispatch.** Display the order cost, remaining quantity, vehicle capacity, route time, service cost, storage capacity, and a readable risk band before the player commits.
4. **Every city and route has tradeoffs.** No city, supplier, vehicle class, or route should be the automatic best choice.
5. **Properties enable activity; they do not print money.** Warehouses add bounded storage and staging. Safehouses provide a local foothold. Neither creates product or earnings on its own.
6. **Keep recurring sales bounded.** Dealer crews have finite stock, demand, capacity, and operating costs. Sales consume inventory.
7. **Resolve economic actions on the server.** Order placement, pickup, transfers, sales, and earnings must be authoritative, idempotent, auditable, and protected from duplicate requests.
8. **Preserve past rounds.** Each slice pins a ruleset. Existing rounds continue to use their original city, travel, vehicle, and economy behavior.
9. **Keep law pressure legible.** Use player-facing risk descriptions and outcomes. Do not expose hidden rolls or make a shipment loss feel arbitrary.
10. **Keep route content fictionalized.** Route types are game abstractions with distinct costs, capacities, times, and risk profiles, not real-world operating instructions.

## Release shape

Slices **A–F** deliver a complete loop on the existing map. Slices **G–H** expand the network with new cities and supply lanes. Slice **I** balances and gates the beta release.

Each slice should have its own release gate and pinned ruleset, following the project's established release pattern. Names and exact ruleset identifiers can be finalized during implementation.

**Beta progress:** Slices A through G are implemented on the beta branch: the core loop, and Chicago, Tulsa and Dallas on the map. Slice A adds the pinned supply foundation, thug availability accounting, dealer career assignment and release with experience preserved, and admin supply visibility. Slice B adds ruleset-pinned suppliers in Los Angeles and Detroit, round-wide finite offer stock, a three-open-order player limit, upfront payment, and durable retry-safe order placement. Slice C adds multi-trip pickups that ride the existing run system and land in a home stash. Slice D adds warehouses and safehouses with upkeep, and pickups that deliver to any warehouse. Slice E adds dealer crews: set up, staffed, stocked and priced, with their expected pace shown. Slice F makes crews sell, pays out, ships stock between cities, and adds the supply ledger and history. Slice G adds Chicago, Tulsa and Dallas. International lanes and the balance pass remain Slices H–I.

## Proposed slices

| Slice | Theme | Outcome |
| --- | --- | --- |
| **1.6.0-A — Supply Foundation** | Data, invariants, and rulesets | Server-owned supplier, order, shipment, warehouse, dealer assignment, individual dealer careers, durable experience, inventory, and sales records; state transitions; ledger categories; admin visibility; historical-ruleset tests. |
| **1.6.0-B — Prepaid Bulk Orders** | Commit cash and reserve supply | Players select an available supplier, product, quantity, and quote. The full game-cash cost is paid when the order is placed. The order is held for pickup and shows ordered, awaiting pickup, and collected quantities. |
| **1.6.0-C — Multi-Trip Pickup Routes** | Collect orders in vehicle-sized loads | Players select vehicles and a pickup quantity up to their combined cargo capacity. Partial loads travel through the existing run system and vehicle conditions; remaining stock stays on the order for a later trip. Delivered quantities are credited once. |
| **1.6.0-D — Properties & Local Storage** | Create supply nodes | Warehouses provide bounded storage and staging in a city. Safehouses provide a local operating foothold. Players can see property capacity, stock, service costs, and active shipments. Properties provide no passive cash or supply. |
| **1.6.0-E — Dealer Crews** | Establish local outlets | Players assign thugs from their existing crew to a city district. Those thugs remain owned but are unavailable for other jobs while assigned. Players choose products and stock, set a price, and review capacity and operating costs. |
| **1.6.0-F — Sales, Restocking & Ledger** | Close the core loop | Sales resolve on a server-controlled schedule against available stock, local demand, price, and crew capacity. Active dealer crews gain experience over time; greater skill improves performance and raises the dealer's cut. Inventory, earnings, cuts, and costs are recorded, and players restock from local storage. Moving stock between cities requires a shipment. |
| **1.6.0-G — Chicago, Tulsa & Dallas** | Expand U.S. city play | Add the proposed cities as distinct markets and route nodes. Each needs its own travel connections, property costs, demand profile, district availability, and operating pressure. None should dominate every product or route. |
| **1.6.0-H — International Supply Lanes** | Broaden sourcing | Add abstract route archetypes such as freight, overland, air, and northern supply. Monterrey and Mexico City are candidates for a southern branch. Select a Canadian city after the map connections and gameplay role are defined. |
| **1.6.0-I — Balance, Admin & Release** | Validate the season | Simulate order economics, partial pickups, vehicle use, property capacity, dealer sales, city demand, and incident outcomes. Add admin fleet and supply views, audited corrections, exploit checks, mobile review, and release gates. |

## Slice details

### 1.6.0-A — Supply Foundation

**Status: Implemented on the beta branch as the data and career foundation.**

Establish the authoritative supply lifecycle before adding economic actions.

- Define supplier offers, prepaid orders, shipment legs, pickup batches, property storage, dealer assignments, dealer inventory, and sale records.
- Treat dealer staffing as a reservation from the player's existing thug pool. Assigned thugs remain owned and count toward net worth, but cannot be used for other work until released.
- Persist experience on each promoted thug's dealer career. Releasing him returns him to the available thug pool without erasing his experience; a replacement starts at the base tier. Later sale rules derive each dealer's skill and rising cut from his own experience, and record the actual cut on every sale receipt.
- Track quantities through explicit states: **ordered → awaiting pickup → in transit → stored → assigned to dealers → sold**. Support partial quantities at each stage.
- Record every cash movement with a source and destination: wholesale payment, route expense, property expense, dealer operating cost, dealer cut, and player earnings.
- Make each action idempotent so retries cannot charge twice, duplicate stock, or duplicate earnings.
- Keep all balances, quantities, and state transitions server-authoritative.
- Add per-round limits for open supplier orders, stored stock, and active dealer crews. Set final values during simulation.
- Pin the system behind a new ruleset while leaving existing rounds unchanged.

**Gate:** Tests prove that no stock or cash is created by duplicate requests, partial quantities always reconcile, and old rulesets do not receive the new system.

### 1.6.0-B — Prepaid Bulk Orders

Let players plan purchases larger than a single run.

**Status: Implemented on the beta branch.**

- Show a supplier's available product, quoted unit price, minimum or maximum order, and total cost before purchase.
- Pin West Coast Depot to Los Angeles and Great Lakes Depot to Detroit; each has finite, shared per-round stock with product-specific prices and order ranges.
- Charge the full quoted amount at placement and reserve the order under the player's round. Persist the quote and order state, and make retries safe across repeated requests and page reloads.
- Show the order's total quantity, remaining pickup quantity, supplier location, status, and recent order history.
- Keep paid orders available at the supplier until collected. Do not silently expire or delete a paid order. A bounded number of open orders prevents unlimited source-side stockpiling.
- Refuse the order cleanly if the player lacks cash, the supplier lacks stock, or a round limit would be exceeded.

**Gate:** Passed for placement and inspection: a player can place and inspect an order without owning a vehicle capable of carrying the full amount in one trip. Pickup and quantity reconciliation across trips remain Slice C.

### 1.6.0-C — Multi-Trip Pickup Routes

**Status: Implemented on the beta branch (`classic-og-v1.6-c`).**

Use the existing vehicle and run systems to collect an order over multiple trips.

- Let players choose a pickup amount up to the selected fleet's combined cargo capacity.
- Use existing vehicle classes, route profiles, vehicle conditions, and travel timing wherever possible.
- Show the trip's capacity, selected vehicles, estimated time, visible route profile, and costs before dispatch.
- On return, credit only the delivered quantity to the destination warehouse and subtract exactly that quantity from the order's remaining pickup amount.
- Keep uncollected stock attached to the supplier order for the next trip.
- Keep cargo in transit unavailable to dealers and storage until delivery completes.
- If the existing travel rules allow only one active run per player, preserve that limit for the first pass; repeated trips still collect the same order over time.

**Gate:** One order can be completed across multiple trips; mixed vehicle capacity is counted once; a failed, interrupted, or retried action cannot duplicate stock or charge.

**As built:**

- A pickup is a dedicated run: it drives out empty, loads at the supplier when it arrives, and drives home. It counts toward the run limit and costs the route's turns, but it cannot trade, drive on, or service outposts. Escorts ride armed as on any run.
- Units are reserved on the order at dispatch, collected from the order when the run reaches the supplier, and credited to storage when the run gets home. Only the quantity still in the trunk at home counts as delivered, never more than was loaded.
- **Losses are real.** Units lost to road stops or convoy hits count as collected and do not return to the order. Returning them would let convoy loot duplicate stock: the attacker keeps the units while the order would offer them again.
- **Home stash.** Until Slice D adds warehouses, deliveries land in one stash per player in their home city (30,000 units, enough for three maximum-size orders). Loads on the road hold their room, so a dispatch that would overfill it is refused. Stored supply is not carried stock and is not counted in net worth.
- A supplier in the player's own city is collected locally: one turn, no road, straight into the stash, and the vehicles stay home.
- Gate coverage: `SUPPLY_INTEGRATION=1` runs `supply-pickup.integration.test.ts`.

### 1.6.0-D — Properties & Local Storage

**Status: Implemented on the beta branch (`classic-og-v1.6-d`).**

Give locations a practical job in the supply network.

- Add warehouses with finite capacity for product waiting to be assigned or shipped onward.
- Add safehouses as limited local operating bases for assigned dealer crews and local planning.
- Display stored, reserved, and available quantities separately so players can see what they can allocate.
- Show what will not fit before a shipment is dispatched.
- Keep property acquisition and operating costs visible. No property produces product or passive income.
- Start with a modest number of locations per player; tune limits with simulation.

**Gate:** A player cannot overfill a warehouse, allocate the same stock twice, or bypass vehicle capacity by transferring stock between distant cities instantly.

**As built:**

- **Warehouses:** one per city, up to three per player, besides the free home stash (12,000 units in D, down from 30,000 in C, so one full-size order fits at home). Each city sets its own price, daily upkeep and capacity: Detroit is big and cheap but far from the west, San Francisco small and dear, Las Vegas cheap staging four hours from Los Angeles.
- **Safehouses:** one per city, up to three, never in the home city. A safehouse is a foothold: a warehouse outside the home city needs a paid-up one there. Dealer crews (Slice E) can use the same footholds. This answers the open decision provisionally: dealers need a foothold, and home always counts as one.
- **Upkeep:** the price pays the first day, then upkeep is charged from cash every 24 hours, settled lazily like corner and business upkeep. A property the cash cannot cover falls behind. A warehouse that is behind keeps its stock but takes no new deliveries, and a safehouse that is behind stops counting as a foothold. Both catch up automatically once there is cash. Nothing is seized or destroyed.
- **Closing:** gives a property up with no refund. A warehouse must be empty with nothing on the way to it, and a safehouse cannot close while a warehouse in its city needs it.
- **Delivery anywhere:** a pickup chooses its warehouse. The run drives home → supplier → warehouse city → home and unloads at the warehouse stop. If the supplier is local and the warehouse is not, the load goes on as the run leaves. If the warehouse is in the supplier's city, the load comes straight off at that stop. A pickup run cannot head home before it unloads, so stock never jumps between cities.
- **Room:** each warehouse shows stored units, room held for loads on the way, and free room. A dispatch that would not fit is refused, saying how many units would not fit.
- **Deferred:** moving stock between warehouses is Slice F's shipment work.
- Gate coverage: `SUPPLY_INTEGRATION=1` runs `supply-properties.integration.test.ts`.

### 1.6.0-E — Dealer Crews

**Status: Implemented on the beta branch (`classic-og-v1.6-e`).**

Let players build and manage a small distribution network.

- Assign crews to eligible districts in cities where the player has a valid local foothold.
- Choose products, assign a quantity from local storage, and select a price within a player-readable range.
- Show crew capacity, current inventory, local demand description, operating cost, and expected sales pace.
- Keep crew count limited so city networks require meaningful investment and management.
- Allow players to pause, reassign, or change a crew's offering under clear timing and cost rules.
- Track experience per assigned thug, with a simple tier rather than a deep character tree. Releasing a dealer frees that thug for other work and preserves his dealer experience if he is hired again.

**Gate:** Dealer crews can only be assigned stock from a warehouse in the same city, and their inventory never exceeds their capacity.

**As built:**

- **Setup:** up to three crews, one per district per city, wherever the player has a foothold (home, or a city with a paid-up safehouse). Setting a crew up costs 4 turns and posts 1–6 dealers from the fit thugs at home. Released dealers come back first, most experienced first. A safehouse cannot close while crews in its city need it.
- **One product at a time:** this answers the open decisions. Switching product needs an empty crew; price changes are free, within 70%–200% of the street price.
- **Street price:** Pip's reference price for the product, times the city's price lean, times 1.6.
- **Capacity:** 400 units per dealer. Stock comes only from storage in the crew's city and goes back there. A load never exceeds capacity, and a dealer cannot be released if the rest could not carry what the crew holds.
- **Pace:** dealers × 12 units an hour × tier bonus × district traffic × city demand × (street price ÷ asking price)^1.6. The page shows units an hour, hours to sell out, gross, the dealers' blended cut, wages ($15 per dealer-hour) and net. Sales, cuts, wages and experience are recorded from Slice F; a paused crew neither sells nor pays wages.
- **Tiers:** Rookie (0 xp, 20% cut), Regular (1,000 xp, 23% cut, +15% pace), Veteran (4,000 xp, 26% cut, +30% pace), Connect (12,000 xp, 30% cut, +50% pace).
- **Pause, move, close:** pause or resume any time. A paused crew can move to a free district in its city for 4 turns. Closing needs an empty crew and releases its dealers, who keep their experience.
- **Turf:** crews use the five district archetypes for foot traffic only. Holding, or a rival holding, the block makes no difference yet.
- Gate coverage: `SUPPLY_INTEGRATION=1` runs `dealer-crews.integration.test.ts`.

### 1.6.0-F — Sales, Restocking & Ledger

**Status: Implemented on the beta branch (`classic-og-v1.6-f`).**

Make the business cycle understandable and sustainable.

- Resolve sales in bounded server-side intervals using available stock, local demand, chosen price, crew capacity, and city pressure.
- Reduce dealer inventory by exactly the sold quantity.
- Award each dealer experience only for completed, non-duplicated sales while assigned; higher experience improves sales performance and that dealer's cut, within ruleset-defined caps.
- Show the current experience tier, resulting cut, and net proceeds before the player commits stock or changes a crew.
- Pay the player after the crew's cut and operating costs are recorded.
- Show sales, unsold stock, earnings, crew costs, shipment expenses, and net result in the ledger.
- Let players restock from local storage. Restocking in another city requires a shipment and available transport capacity.
- Provide a player-readable activity history for orders, pickups, deliveries, assignments, sales, and restocks.
- Do not guarantee that a bulk order will be profitable; purchases tie up cash and sales depend on market conditions.

**Gate:** Repeated sale ticks cannot oversell stock, create cash from no stock, or use client time as the source of truth.

**As built:**

- **Sales clock:** working crews sell lazily, settled under the player's lock before anything reads cash, in whole hours of server time since the crew was last settled. A part hour waits. Batches run up to 24 hours at one pace, so experience earned in one batch speeds the next. Each batch is keyed by its start time, so settling again never sells twice.
- **Each batch:** it sells the pace times the hours, plus a carried fraction, never more than the crew holds. It takes exactly that from the crew's stock and writes a sale receipt and a SOLD movement. Each dealer gets 1 xp per unit, shared evenly.
- **Payouts:** the player is paid gross less the dealers' cut, then wages ($15 per dealer-hour) come out. Wages are owed every hour a crew works, even with nothing to sell, so pause an empty crew. If neither the takings nor cash can cover wages, the crew walks off and pauses; cash never goes below zero.
- **City pressure:** pace is scaled by police pressure ^ −0.5, about 79% in San Francisco and 129% in Atlanta. Sales report their cash as currency evidence to the Case in that city, as run trades do.
- **Shipments:** move stock between warehouses in different cities: a run drives to the source, loads, unloads at the destination and goes home. The units leave the source at dispatch, so nothing else can claim them, and only what arrives is stored. Restocking a crew elsewhere therefore takes a shipment and the cars for it.
- **Supply page:** a ledger for the round (sales, dealers' cut, wages, wholesale, properties, upkeep, net) with unsold stock by place (at suppliers, on the road, in storage, with crews), and a plain-words history of every order, pickup, delivery, restock, return, shipment and sale.
- **Profit is not guaranteed:** unsold stock is paid for but not counted as earned.
- Gate coverage: `SUPPLY_INTEGRATION=1` runs `dealer-sales.integration.test.ts`.

### 1.6.0-G — Chicago, Tulsa & Dallas

**Status: Implemented on the beta branch (`classic-og-v1.6-g`).**

Add the proposed cities after the basic loop works on the existing map.

- Connect the cities to a readable travel network; do not make Tulsa a filler stop.
- Give each city distinct district options, demand patterns, property costs, travel access, and operating pressure.
- Make Chicago a larger, competitive market; explore Tulsa as a useful connector with a smaller market; explore Dallas as a southern distribution hub. These are starting hypotheses for simulation, not locked balance values.
- Show route time and city differences before players buy supply or establish crews.
- Keep existing cities valuable for some products, routes, or play styles.

**Gate:** Simulations show multiple viable city and route choices, and each new city adds a reason to travel there.

**As built:**

- **The cities:** each new city appears in every city-keyed record: product leans and demand, Heat, districts and their names, hotel prices, turf locals, a business signature, a casino venue, law speeds and property prices. The eight existing cities keep every number they had.
- **Chicago, the contested market:** the deepest market after New York, with crack, weed and heroin dear and heroin in short supply. Tough locals, police pressure 1.2, fast files that cool slowly, and a Bar signature. I-94 from Detroit (4.5h), I-80/I-90 to New York (12.5h), and I-44 to Tulsa (10.5h).
- **Tulsa, the junction:** Pip's cheapest meth, the cheapest warehouse room on the map, quiet roads (police 0.7), and a slow law that goes cold fast. Its market is thin, so it is where stock is staged rather than sold. Roads run to Chicago, Dallas (US-75, 4h), Las Vegas (I-40, 19h) and Atlanta (12.5h).
- **Dallas, the southern hub:** Pip's cheapest cocaine, a new supplier (Southern Crossing: weed, cocaine and meth, the cheapest prices in the smallest lots), the biggest warehouses, and ecstasy and meth that both pay. I-20 east to Atlanta (11.5h) and west to Los Angeles (20h) on the watched border road.
- **Map:** city rows come from a migration; the travel map places each city where it really is.
- **Simulation:** `npm run qa:supply-cities` ranks every product's markets by what a full crew nets an hour and how far the cheapest supplier is; [SUPPLY-CITIES-1.6.0-G.md](SUPPLY-CITIES-1.6.0-G.md) is the run. It passes the gate: no city is the best market for everything, every product has a second market making at least half what the best does, and each new city has a reason to drive there. Chicago is the second weed market and Dallas the second meth market; before G, Los Angeles and Atlanta stood alone.

### 1.6.0-H — International Supply Lanes

Broaden the network only after domestic procurement and sales are balanced.

- Represent supply access with fictionalized route cards such as **Freight**, **Overland**, **Air**, and **Northern Supply**.
- Give route cards different capacity, cost, time, and player-facing risk profiles. No route removes law or travel pressure.
- Explore Monterrey and Mexico City as candidates for a southern source branch. A Canadian city remains an open map decision.
- Keep route details abstract and focused on game choices; do not model real-world transport procedures.
- Add city and supplier content only when it introduces a distinct market or strategic option.

**Gate:** No single supplier or route is optimal across order size, price, travel time, and risk; each failure outcome is communicated and recorded clearly.

### 1.6.0-I — Balance, Admin & Release

Prove the economic loop and provide tools to operate it safely.

- Add simulation coverage for small and large orders, one-trip and multi-trip pickups, mixed fleets, city demand, warehouse limits, dealer sales, operating costs, and route outcomes.
- Verify supplier orders, shipments, storage, dealer inventories, and ledger totals reconcile for every scenario.
- Add admin views for order and shipment states, stock by location, dealer assignments, sales and costs, and suspicious quantity mismatches.
- Make corrections auditable and prevent corrections from silently changing completed or historical rounds.
- Add exploit checks for duplicated orders, pickup overages, warehouse overflow, double allocation, overselling, and duplicate payouts.
- Verify mobile layouts for order planning, pickup selection, property storage, dealer management, and ledger history.
- Run historical-ruleset tests to prove that 1.6 behavior does not alter prior rounds.

**Release gates:**

- The complete order-to-sale loop works without admin intervention.
- Every cash and stock movement is reconciled and visible in the appropriate history.
- Large orders can be collected in partial trips without loss or duplication.
- No route, property, city, or dealer configuration is a must-pick in every tested scenario.
- All new market, route, property, and dealer behavior is pinned to the 1.6 ruleset.

## Open decisions

- The first suppliers are West Coast Depot in Los Angeles and Great Lakes Depot in Detroit. A player can have up to three open paid orders; review this limit during Slice I simulation.
- Do dealer crews need a safehouse to operate, or should a safehouse provide convenience while a dealer can operate without one?
- How many products can one crew carry at once?
- Does one crew sell one product at a time, or can it divide a limited capacity across products?
- Which Canadian city best completes the intended route map?
- Which route archetypes belong in the first international slice, and which should follow later?

## Explicitly deferred

- Automatic bulk pickup or automatic cross-city restocking.
- Unbounded passive income or property-generated product.
- Large individual dealer character trees.
- Property raids, property trading, or permanent property destruction.
- Real-money purchases that affect supply, routes, dealers, or earnings.
- Detailed simulation of real-world illicit transport methods.

## Guiding question

**1.6.0:** How does my organization source, move, store, and sell supply across the map?

The update should make cities and properties matter because players use them to run a network, while preserving the travel, vehicle, market, and risk systems they already understand.
