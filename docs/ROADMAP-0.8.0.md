**StreetsEmpire v0.8.0**

**Store Improvements & Street Economy Roadmap**

*Target base: turf-0.6.0 \| Planned after Hideout Improvements (0.7.0)*

# 0.8.0 Closeout

**Feature status:** closed on `beta` as of September 24, 2026. The H economy
hardening plus the final post-H UI/notification/store fixes are merged. New feature
work now belongs in 0.9.0 or a later maintenance release.

**Promotion status:** not asserted by this document. The release operator still needs
to run `npm run qa:store-economy`, `npm run qa:release`,
`npm run qa:release -- --with-db`, and the phone/desktop Store browser pass from
`docs/RELEASE-0.8.0-H.md`.

The full rotating Black Market and short-lived reserved-stock features remain
deferred by design; Special Orders are the 0.8.0 alternate-sourcing path.

# Release Vision

**Goal:** turn Stores from static buy/sell menus into a connected city
economy that reacts to stock, demand, travel, trader relationships,
turf, convoys, and the player's Hideout.

**Core design rule:** stores should remain fast to use for routine
purchases, while rewarding players who pay attention to prices,
availability, city differences, and relationships.

# Current Foundation to Preserve

- **Four distinct traders:** Corner Store, Tommy's, Charlie's, and
  Pip's.

- **Existing trade flow:** buy/sell, bulk quantity helpers, receipts,
  safe retry handling, and no-turn shopping.

- **Trader progression:** favors, reputation, weapon unlocks, and
  standing-based restock speedups.

- **Scarcity systems:** limited shelf stock and timed restocking.

- **Product economy:** Pip can deal multiple products with separate
  stock and pricing.

- **World systems already available:** travel, city markets, convoys,
  turf, production, and player product inventory.

# Milestone Overview

| **Milestone** | **Theme**                     | **Outcome**                                      |
|---------------|-------------------------------|--------------------------------------------------|
| **0.8.0-A**   | Store UX                      | Fast, clearer buying and selling                 |
| **0.8.0-B**   | Market Intelligence           | Price context and player-facing market info      |
| **0.8.0-C**   | Dynamic Economy               | Supply, demand, city pricing, buyback demand     |
| **0.8.0-D**   | Trader Relationships          | Meaningful standing perks and reserved stock     |
| **0.8.0-E**   | Shipments                     | Physicalized store deliveries and shortages      |
| **0.8.0-F**   | Special Orders & Black Market | Alternate sourcing and rotating rare inventory   |
| **0.8.0-G**   | System Integration            | Hideout, Turf, Travel, Convoys, city conditions  |
| **0.8.0-H**   | Balance & Polish              | Simulation, exploit prevention, mobile/UI finish |

# 0.8.0-A - Store UX

**Objective:** Make ordinary shopping quicker and easier before adding
more economic complexity.

## Player-facing scope

- **Shopping cart / order basket:** add multiple items and quantities,
  review the total, then complete one checkout.

- **Quick quantity actions:** Buy 1, 10, 25, 100, Max, one-day supply,
  and other context-aware helpers.

- **Clearer item cards:** show owned quantity, current stock, buy price,
  sell price, availability, and unlock state at a glance.

- **Favorites / quick buy:** let players pin commonly purchased items
  for faster repeat orders.

- **Recent transactions:** show a small history of store purchases and
  sales with quantity and unit price.

- **Mobile cleanup:** make store tabs, cards, quantity inputs, and
  checkout comfortable on phones.

## Technical focus

- Create a server-validated multi-line checkout request; never trust
  client totals.

- Keep idempotent action IDs so uncertain network responses can be
  retried safely.

- Return per-line success/failure details and an authoritative
  post-checkout player state.

- Reuse the existing store catalog and product counter rather than
  duplicating inventory logic.

## Done when

- A player can purchase several eligible items in one checkout.

- The checkout clearly shows total cost and post-purchase cash before
  confirmation.

- If stock or price changes before checkout, the server rejects or
  reprices cleanly without partial duplication.

- Existing one-item trade behavior remains compatible during migration.

# 0.8.0-B - Market Intelligence

**Objective:** Give players enough information to make economic
decisions without requiring external spreadsheets.

## Player-facing scope

- **Price context labels:** Cheap, Below Normal, Normal, Above Normal,
  Expensive.

- **Trend indicator:** show whether recent price pressure is rising,
  falling, or stable.

- **Stock context:** Plentiful, Normal, Low, Scarce, Sold Out.

- **City comparison view:** when known, compare local prices with other
  cities the player has market intel for.

- **Market history:** short rolling history for key prices rather than
  permanent full-round financial charts.

## Technical focus

- Add normalized/base-price metadata to market DTOs.

- Store only the history needed for gameplay and UI; avoid
  high-frequency tick logging.

- Gate remote-city information behind existing/future scouting, travel
  knowledge, or intel rules.

## Done when

- Every dynamic-price item explains why its current price is unusual.

- The UI never reveals hidden city information the player has not
  earned.

- Price history has bounded storage and predictable cleanup.

# 0.8.0-C - Dynamic Economy

**Objective:** Make store prices and purchasing behavior respond to
local supply, demand, and city identity.

## Player-facing scope

- **City-specific modifiers:** stores can have different effective
  prices and availability by city.

- **Demand pressure:** heavy player buying pushes prices upward within
  controlled bounds.

- **Supply pressure:** high stock and repeated player selling can push
  prices downward within controlled bounds.

- **Buyback demand:** traders have limited appetite for certain goods
  instead of buying infinite quantities at one price.

- **Price floors and ceilings:** prevent runaway inflation, collapse,
  and exploit loops.

- **Slow normalization:** markets drift toward baseline when player
  pressure fades.

## Technical focus

- Keep base values in the ruleset and compute effective prices
  deterministically.

- Separate demand state from player inventory so stock cannot be
  duplicated or lost.

- Add QA simulations for buy-low/sell-high loops, repeated dumping, and
  multi-city arbitrage.

- Make admin/ruleset knobs available for sensitivity, floor, ceiling,
  and normalization speed.

## Done when

- The same item can be meaningfully cheaper or more expensive in
  different cities.

- Selling thousands of one item eventually reduces trader demand or
  payout.

- No same-store or trivial two-store loop generates guaranteed infinite
  money.

- Prices move enough to matter but remain readable and strategically
  predictable.

# 0.8.0-D - Trader Relationships

**Objective:** Make reputation change how a trader treats the player,
not only how quickly shelves restock.

## Player-facing scope

- **Standing perks:** small buy discounts, improved sell offers, faster
  sourcing, or access perks depending on trader.

- **Reserved stock:** trusted players can receive short-lived
  reservations when scarce stock arrives.

- **Relationship offers:** occasional trader-specific deals unlocked by
  standing.

- **Expanded favors:** additional repeatable or progression favors that
  fit each trader's identity.

- **Visible progression:** show the next relationship benefit and
  progress toward it.

## Technical focus

- Define perks in rulesets rather than hard-coding percentages into UI
  or services.

- Reservations must expire and return unsold stock safely.

- Avoid stacking perks so strongly that high-standing players
  permanently dominate newer players.

## Done when

- Each trader has at least one relationship benefit that feels unique.

- Players can see exactly what their current standing changes.

- Reserved inventory cannot be duplicated, permanently locked, or
  oversold.

# 0.8.0-E - Shipments

**Objective:** Replace invisible restock timers with understandable
incoming deliveries that can later interact with the world.

## Player-facing scope

- **Incoming shipment display:** show quantity, estimated arrival, and
  destination trader.

- **Variable delivery sizes:** shipments can be partial, full, delayed,
  or unusually large.

- **Shortages:** a missed or delayed shipment can keep stock low instead
  of instantly resetting.

- **Store news:** trader flavor text explains major shortages or fresh
  stock.

## Technical focus

- Represent restocks as shipment records/events while preserving lazy
  settlement where practical.

- Do not require real-time background processing for every shipment;
  settle on authoritative access/actions.

- Provide hooks that Convoys can consume in 0.8.0-G without coupling
  shipment creation directly to convoy combat.

## Done when

- Players can see what is coming and approximately when.

- Shipment settlement is deterministic and safe across server restarts.

- A delayed shipment changes shelf availability without corrupting the
  existing stock system.

# 0.8.0-F - Special Orders & Black Market

**Objective:** Give players alternate ways to source scarce goods
without making normal traders obsolete.

## Player-facing scope

- **Special orders:** pay a markup to source an out-of-stock eligible
  item for later delivery.

- **Standing affects sourcing:** trusted customers can receive lower
  markups, shorter waits, or better order limits.

- **Black Market:** a rotating underground catalog with inconsistent
  pricing and limited quantities.

- **Rare lots:** temporary batches of weapons, vehicles, product, intel,
  or future Hideout materials.

- **Rotation timer:** clear refresh timing so the market feels
  opportunistic rather than random and opaque.

## Technical focus

- Special orders require stored order state, payment state, fulfillment
  time, and cancellation/refund rules.

- Black Market inventory should be generated server-side from weighted
  ruleset pools.

- Add hard safeguards so rotating deals cannot undercut every normal
  trader all the time.

## Done when

- A sold-out item can sometimes be sourced without waiting for normal
  shelf stock.

- The Black Market is occasionally attractive, occasionally overpriced,
  and never strictly superior.

- Orders survive logout/restart and cannot fulfill twice.

# 0.8.0-G - System Integration

**Objective:** Connect the Store overhaul to the rest of StreetsEmpire
so the economy feels like one game system.

## Player-facing scope

- **Hideout integration:** show missing upgrade materials, estimated
  supply burn, and Buy Missing Supplies shortcuts where appropriate.

- **Turf integration:** local control can grant a modest store advantage
  such as faster delivery, better information, or a small fee reduction.

- **Travel integration:** city-to-city price differences create
  legitimate trade opportunities.

- **Convoy integration:** selected store shipments can be represented by
  convoy movement, delay, interception, or loss.

- **Scout/intel integration:** remote prices, demand, and shipment
  rumors require information rather than global omniscience.

- **Production integration:** players can compare cooking/production
  cost with current local selling opportunities.

## Technical focus

- Keep integration bonuses modest and ruleset-driven.

- Avoid circular dependencies: Store exposes economy events/data; Turf,
  Travel, Convoy, and Hideout consume well-defined interfaces.

- Add audit/activity records for valuable shipments, special orders, and
  major market actions.

## Done when

- At least one meaningful connection exists between Stores and each of
  Hideout, Turf, Travel, and Convoys.

- Players can understand where a bonus or penalty came from.

- No integration makes owning turf or being wealthy a permanent
  compounding lockout for everyone else.

# 0.8.0-H - Balance, QA & Polish

**Status:** implementation complete. The dedicated Store Economy gate, H regression coverage,
admin economy visibility, release notes, and player help are built. Promotion still requires
running the full QA/DB gate and the final browser pass at phone and desktop widths.

**Objective:** Stabilize the economy, close exploits, and make the
release feel finished across desktop and mobile.

## Player-facing scope

- **Economy simulations:** full-round and stress simulations for stock,
  prices, arbitrage, special orders, and demand recovery.

- **Exploit testing:** rapid refresh, duplicate checkout, stale cart,
  negative inventory, cross-city price loops, reconnect/retry, and
  concurrency.

- **Accessibility/mobile pass:** touch targets, readable tables/cards,
  keyboard navigation, error messaging, and responsive checkout.

- **Admin visibility:** inspect current price state, shipment state,
  demand, reservations, and special orders.

- **Release tuning:** final ruleset values, copy, trader flavor, and
  documentation.

## Technical focus

- Add/extend QA scripts similar to existing product, travel, and turf
  simulations.

- Add integration tests for multi-line checkout and concurrent purchase
  attempts.

- Ensure all monetary math stays integer/cents based and all quantities
  remain whole/nonnegative.

## Done when

- No known infinite-money loop under the supported ruleset.

- Concurrent buyers cannot oversell limited shelf stock.

- All new economy state survives restart and round lifecycle correctly.

- Store pages are comfortable to use on common phone widths.

- 0.8.0 release notes and player-facing help are complete.

# Recommended Priority

**Must ship for 0.8.0:** A, B, C, D, and H. These establish the improved
shopping experience and actual economy.

**Strongly recommended:** E and G. They are what make the economy feel
connected to StreetsEmpire instead of being a standalone marketplace.

**Can be reduced if scope grows:** F. Special Orders can ship first and
the full Black Market can move to 0.8.1 without weakening the core
release.

# Design Guardrails

- Routine shopping must remain fast; economic depth should be optional
  knowledge, not mandatory busywork.

- Do not allow one city, one product, or one trader to become the
  permanent optimal answer.

- Use modest discounts and bonuses; reputation and turf should provide
  options, not unstoppable compounding power.

- Every transaction is server-authoritative, atomic, idempotent, and
  safe against stale client state.

- Prefer bounded, slow-moving price changes over minute-to-minute
  volatility.

- Keep Classic OG flavor: traders should feel like people and places,
  not generic exchange terminals.

# 0.8.0 Release Checklist

☐ All store DTO/schema changes versioned and shared cleanly across
server/web.

☐ Multi-item checkout cannot partially duplicate or overspend.

☐ Shelf stock and reservations cannot go negative.

☐ Dynamic prices remain inside configured floor/ceiling bounds.

☐ Buyback demand cannot produce an infinite sale loop.

☐ City arbitrage is profitable only when intended costs/risks justify
it.

☐ Shipments and special orders survive server restart.

☐ Trader standing perks are visible and ruleset-driven.

☐ Hideout/Turf/Travel/Convoy integrations explain their modifiers in UI.

☑ Admin/debug views can inspect Store pressure, empty shelves, shipment rules,
and special-order activity.

☑ Automated tests cover retry-safe multi-line checkout, concurrent shelf
purchases, existing retries, and settlement guardrails.

☐ QA simulations pass agreed economy targets. Run `npm run qa:release` and
`npm run qa:release -- --with-db` before promotion.

☐ Mobile Store workflow passes final UI review.

☑ Player-facing release notes and help text are written.

# Suggested Branch / Build Sequence

- \`store-0.8.0-a\` - Store UX and checkout foundation

- \`store-0.8.0-b\` - market intelligence

- \`store-0.8.0-c\` - dynamic economy

- \`store-0.8.0-d\` - trader relationships

- \`store-0.8.0-e\` - shipments

- \`store-0.8.0-f\` - special orders / Black Market

- \`store-0.8.0-g\` - system integrations

- \`store-0.8.0-h\` - balance, QA, polish

# Target End State

By the end of 0.8.0, a player should be able to notice that Pip is
paying more for Ecstasy in one city, see Tommy has an AK shipment
inbound, stock the crew for tomorrow in one checkout, benefit modestly
from trader standing or local turf, and decide whether traveling,
waiting, special-ordering, or using the Black Market is worth it. The
Store becomes a strategic part of StreetsEmpire without slowing down
basic play.
