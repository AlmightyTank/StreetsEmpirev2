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

**Beta progress:** Slices A and B are implemented on the beta branch. Slice A adds the pinned supply foundation, thug availability accounting, dealer career assignment and release with experience preserved, and admin supply visibility. Slice B adds ruleset-pinned suppliers in Los Angeles and Detroit, round-wide finite offer stock, a three-open-order player limit, upfront payment, and durable retry-safe order placement. Pickup and delivery remain Slice C; dealer establishment and sales remain Slices E–F.

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

Use the existing vehicle and run systems to collect an order over multiple trips.

- Let players choose a pickup amount up to the selected fleet's combined cargo capacity.
- Use existing vehicle classes, route profiles, vehicle conditions, and travel timing wherever possible.
- Show the trip's capacity, selected vehicles, estimated time, visible route profile, and costs before dispatch.
- On return, credit only the delivered quantity to the destination warehouse and subtract exactly that quantity from the order's remaining pickup amount.
- Keep uncollected stock attached to the supplier order for the next trip.
- Keep cargo in transit unavailable to dealers and storage until delivery completes.
- If the existing travel rules allow only one active run per player, preserve that limit for the first pass; repeated trips still collect the same order over time.

**Gate:** One order can be completed across multiple trips; mixed vehicle capacity is counted once; a failed, interrupted, or retried action cannot duplicate stock or charge.

### 1.6.0-D — Properties & Local Storage

Give locations a practical job in the supply network.

- Add warehouses with finite capacity for product waiting to be assigned or shipped onward.
- Add safehouses as limited local operating bases for assigned dealer crews and local planning.
- Display stored, reserved, and available quantities separately so players can see what they can allocate.
- Show what will not fit before a shipment is dispatched.
- Keep property acquisition and operating costs visible. No property produces product or passive income.
- Start with a modest number of locations per player; tune limits with simulation.

**Gate:** A player cannot overfill a warehouse, allocate the same stock twice, or bypass vehicle capacity by transferring stock between distant cities instantly.

### 1.6.0-E — Dealer Crews

Let players build and manage a small distribution network.

- Assign crews to eligible districts in cities where the player has a valid local foothold.
- Choose products, assign a quantity from local storage, and select a price within a player-readable range.
- Show crew capacity, current inventory, local demand description, operating cost, and expected sales pace.
- Keep crew count limited so city networks require meaningful investment and management.
- Allow players to pause, reassign, or change a crew's offering under clear timing and cost rules.
- Track experience per assigned thug, with a simple tier rather than a deep character tree. Releasing a dealer frees that thug for other work and preserves his dealer experience if he is hired again.

**Gate:** Dealer crews can only be assigned stock from a warehouse in the same city, and their inventory never exceeds their capacity.

### 1.6.0-F — Sales, Restocking & Ledger

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

### 1.6.0-G — Chicago, Tulsa & Dallas

Add the proposed cities after the basic loop works on the existing map.

- Connect the cities to a readable travel network; do not make Tulsa a filler stop.
- Give each city distinct district options, demand patterns, property costs, travel access, and operating pressure.
- Make Chicago a larger, competitive market; explore Tulsa as a useful connector with a smaller market; explore Dallas as a southern distribution hub. These are starting hypotheses for simulation, not locked balance values.
- Show route time and city differences before players buy supply or establish crews.
- Keep existing cities valuable for some products, routes, or play styles.

**Gate:** Simulations show multiple viable city and route choices, and each new city adds a reason to travel there.

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
