# Quest Progression: Recipe Unlocks

## Purpose

Expand the quest system from teaching players where actions live to opening new ways to run their operation. Quests should reward mastery with new product recipes, production options, and supplier relationships while keeping the existing city, crew, Heat, and economy rules authoritative.

The first expansion builds on the current product catalog:

- Crack, Meth, and Ecstasy already have production recipes. Today all three are cookable from the start of a round.
- Weed, Cocaine, and Heroin are in the economy but are not currently cookable.
- Existing permanent product unlocks grant purchase access at Pip. Purchase access and production access must remain separate capabilities.

In the new ruleset, a player starts with **only the Crack recipe**. Every other recipe is earned through Pip's quest ladder, in this order:

> **Crack** (starting recipe) → **Ecstasy** → **Meth** → **Weed** → **Cocaine** → **Heroin**

**The question:** What can my operation do now that I have earned a contact's trust?

**Core loop:**

> Learn the operation → complete product jobs → earn recipe access → produce and move the product → unlock the next opportunity

This is a proposed roadmap. It does not change live or historical rulesets until a new pinned ruleset ships.

## Design principles

1. **Reward new play.** A major product quest should unlock a recipe, production option, or useful contact capability, not only cash or a page link.
2. **Separate permissions.** Buying a product from Pip, acquiring it elsewhere, and producing it are distinct access rules.
3. **Keep pages open.** Scout, Produce, Products, and Travel remain navigable. Recipe access gates what the player can do, not whether they can open a page.
4. **Use existing authority.** Production still spends normal turns, ingredients, and available crew, and adds Heat according to the active ruleset. A recipe unlock creates no staff, stock, or cash.
5. **Keep choices fair.** Product recipes have different costs, output, pressure, and market roles. No one recipe should dominate every city or strategy.
6. **Make progress legible.** A locked recipe explains the job that opens it and links to that job. Locked quests do not appear in the Available list.
7. **Preserve old rounds.** Add recipe access and new production behavior only to a new pinned ruleset. Do not reinterpret existing `PlayerUnlock` records or alter earlier rounds.
8. **Keep objectives rooted in play.** Quests observe normal production, orders, travel, sales, and Heat events; they do not introduce quest-only actions.

## Slice status and roadmap

Slice A is implemented on beta as the access foundation. Slice B is implemented in ruleset `classic-og-v1.8-f` and Slice C in `classic-og-v1.8-m`. Slice D is the next implementation slice.

| Slice | Status | Theme | Outcome |
| --- | --- | --- | --- |
| **A — Quest Access Foundation** | **Complete on beta** | Unlock recipes and districts through quests | Add permanent recipe access plus district access for Scout and Turf, server-side checks, visible locked-state data, and direct links to unlocking quests. Existing purchase unlocks keep their current behavior. |
| **B — Pip's Cookhouse Ladder** | **Implemented (1.8.0-F)** | Start on Crack, earn the rest | Gate Ecstasy and Meth production behind quests in the new ruleset, then add quest chains for Weed, Cocaine, and Heroin. Each chain requires the previous one and opens one recipe in the current round. Quests use existing actions and award no free ingredients, stock, or crew. |
| **C — Product Identity & Balance** | **Implemented (1.8.0-M)** | Make each recipe a real choice | Define per-product production costs, output, variance, and Heat in the pinned ruleset. Confirm a Crack-only opening is viable, then simulate production, market sales, Heat, city demand, and supply so no product becomes a universal best pick. |
| **D — Quest Presentation** | **Next** | Show the progression clearly | Present recipe locks and their unlocking quest in Products and Produce. Keep Available quests limited to quests that are actually available; show future progression on the existing quest progression view. |
| **E — Admin, Tests & Release** | Planned | Verify access and economy | Add unlock, objective, exploit, and balance coverage; expose recipe access in admin quest inspection; release behind the new ruleset only after the gates pass. |

## Slice details

### A — Quest Access Foundation

- Extend the permanent unlock effect model with `PRODUCT_PRODUCTION_ACCESS`, keyed by product.
- Keep it independent from `PRODUCT_PURCHASE_ACCESS`; a quest can grant one, both, or neither.
- Enforce recipe access in the authoritative production transaction. Hiding a recipe in the client is not an access check.
- Return each product's recipe state and, when locked, its unlock name and the quest that grants it.
- Show locked recipes as visible future options, with their role and the required quest. Do not offer them as selectable batches.
- Keep old rulesets ungated unless they already define a production unlock. Historical players retain the behavior their round began with.
- Support `DISTRICT_ACCESS`, keyed by district, as a separate effect that gates Scout and Turf actions only. Keep every district visible on the Scout and Turf pages and explain which quest opens a locked district; Turf controls in a locked district remain unavailable until the quest is complete.

**Gate:** A locked recipe cannot be produced through a direct or replayed API request, and locked districts reject Scout and Turf actions through direct or replayed API requests. Locked options remain visible with their quest path. Unlocked actions retain the existing turn, ingredient, crew, Heat, turf, and idempotency checks.

### B — Pip's Cookhouse Ladder

A new round opens with Crack as the only cookable product. Pip opens each further recipe once the player proves the operation can handle the one before it. Each rung is a prerequisite for the next, so recipes unlock in a fixed order.

The first two rungs reuse Pip's existing side quests, **Party Favors** and **Bulk Order**, rather than adding new jobs. Today those quests require cooking Ecstasy and Meth; in the new ruleset they become the quests that open those recipes, so their objectives change to products the player can already cook.

| Step | Quest | Recipe opened | Requires | Objective direction |
| --- | --- | --- | --- | --- |
| 0 | — | **Crack** | Starting recipe | Available from the start of the round. Keeping Them Happy and Cookhouse already teach Produce with Crack. |
| 1 | **Party Favors** (existing) | Ecstasy | Cookhouse, Pip rep 12 | Run a working Crack operation: produce Crack after accepting and move it through ordinary sales or orders. |
| 2 | **Bulk Order** (existing) | Meth | Party Favors | Handle two products: produce and sell Ecstasy alongside Crack while keeping the operation's Heat in check. |
| 3 | **Green Thumb** (new) | Weed | Bulk Order | Handle Weed through ordinary product orders and sales; prove the operation can move a steady, lower-pressure product. |
| 4 | **A Better Cut** (new) | Cocaine | Green Thumb | Build a record with premium product sales while managing the operation's Heat and costs. |
| 5 | **Pip's Red Ledger** (new) | Heroin | A Better Cut | Fulfill a scarce-product contract through normal sourcing and sales before Pip trusts the player with the recipe. |

Names for the new quests are working titles. Objective quantities and cash rewards are set during balance work. The chains should be completable through normal play, should start counting after acceptance where appropriate, and should never require a player to cook a product they cannot yet cook or buy an item they cannot yet access.

**Changes to existing Pip quests in the new ruleset:**

| Quest | Today | New ruleset |
| --- | --- | --- |
| **Party Favors** | Requires Cookhouse and Pip rep 25. Produce 100 Ecstasy. Grants Ecstasy purchase access. | Requires Cookhouse and **Pip rep 12** (lowered from 25). Produce and sell Crack. Grants the **Ecstasy recipe** and keeps Ecstasy purchase access. Cookhouse leaves the player at Pip rep 10. Pip daily contracts give +2 rep each, and four of them already work with Crack (Cook Order, Move Product, Crack Batch, Counter Cash), so a single daily closes the gap. |
| **Bulk Order** | Requires Cookhouse. Produce 150 Meth. Grants Meth purchase access. | Requires **Party Favors**. Produce and sell Ecstasy (with Crack). Grants the **Meth recipe** and keeps Meth purchase access. |
| **Taking Sides** | Requires Bulk Order and Heavy Hands. Produce 250 of any product. | No change. Its objective already counts any product, and it now follows the Meth unlock. |
| **Move the Weight** | Sell Pip Weed, Ecstasy, and Meth. Grants Cocaine and Heroin purchase access. | No change. Its Ecstasy and Meth sales are only reachable after rungs 1–2, which fits the ladder. |

**Other content that must move behind the ladder.** Daily contracts that require cooking a product (**Meth Cook**, **Party Pack**, and any later product contracts) are offered only to players who can cook that product.

Party Favors and Bulk Order each grant two separate unlocks: the recipe and purchase access. They remain distinct effects, so other quests can still grant one without the other.

Recipe identity is expressed only through game rules. No real-world production instructions or ingredients are part of quest text or the UI.

**Gate:** A new round starts with only Crack cookable. Party Favors opens Ecstasy, Bulk Order opens Meth, and each later recipe opens only after its quest, in ladder order. No available quest or daily contract requires cooking a locked product. Historical rounds keep their existing recipes and the old Party Favors and Bulk Order objectives.

**Implemented in 1.8.0-F** (`classic-og-v1.8-f`, built on 1.8.0-E, so new rounds also get the sportsbook):

- **Recipe gates.** The ruleset adds `PRODUCT_ECSTASY_RECIPE`, `PRODUCT_METH_RECIPE`, `PRODUCT_WEED_RECIPE`, `PRODUCT_COCAINE_RECIPE` and `PRODUCT_HEROIN_RECIPE`. Crack has no gate. Purchase access keys are unchanged.
- **Recipes.** Weed, Cocaine and Heroin had no recipe, so 1.8.0-F adds a provisional one for each. Slice C sets the final values in 1.8.0-M; see below.
- **Party Favors:** Cookhouse and Pip rep 12; produce 150 Crack and sell 100 Crack to Pip. Pays $12,500, Pip rep 15, Ecstasy purchase access, the Ecstasy recipe and a Pip Connection favor. The old 50-crack reward is removed, because a recipe job pays no free stock.
- **Bulk Order:** requires Party Favors; produce 100 Ecstasy and sell 50 Ecstasy to Pip, with the existing 50-Crack bonus. Pays its existing rewards plus the Meth recipe.
- **Green Thumb** (`PIP_GREEN_THUMB`): requires Bulk Order; sell 150 Weed to Pip. Pays $15,000, Pip rep 15 and the Weed recipe.
- **A Better Cut** (`PIP_A_BETTER_CUT`): requires Green Thumb. In 1.8.0-F, sell 100 Meth and $60,000 of product to Pip; from 1.8.0-M, sell 100 Meth and 60 Ecstasy to Pip, because Pip's buyback is below cooking cost and the $60,000 target lost a player about $40,000. Pays $20,000, Pip rep 20 and the Cocaine recipe.
- **Pip's Red Ledger** (`PIP_RED_LEDGER`): requires A Better Cut; produce 40 Cocaine and sell 40 Cocaine to Pip. Pays $25,000, Pip rep 20 and the Heroin recipe.
- **Daily board.** The board stays dealt from the round's shared deck. A card that cooks a product whose recipe the player lacks (Meth Cook, Party Pack) is replaced by the next card in the same deck, so a player with every recipe sees the shared board. A recipe that opens mid-day never adds a fourth card; the full board returns at the next reset.
- **Tests.** `cookhouse-ladder.test.ts` checks the gates, ladder order, the rep 12 rung, separate purchase access, no stock rewards, that no non-daily job cooks a product before its recipe can be open, and that no earlier ruleset is gated. `daily-contract-recipes.test.ts` covers the daily substitution and the mid-day cap. `cookhouse-ladder.integration.test.ts` (`PRODUCT_INTEGRATION=1`) plays the first rung through the real API on PostgreSQL: every locked recipe is refused, Party Favors opens at rep 12, ordinary Crack production and Pip sales complete it, Ecstasy cooks immediately after the claim, only Bulk Order opens next, and a 1.7.0-E round still cooks Meth from the start.
- Selected operation teams carry over. (They were enabled by an exact list of ruleset IDs that later stopped at 1.8.0-G; Slice C replaced the list with a `crewRoster.selectedTeams` flag set in 1.7.0-E, so every later ruleset inherits it, including 1.8.0-H to 1.8.0-L.)

### C — Product Identity & Balance

- Keep each recipe's tradeoff visible before the player spends turns.
- Candidate identities for balancing:
  - **Crack:** the forgiving starter: cheap to cook, quick to sell, enough margin to fund early growth.
  - **Ecstasy:** a step up in value, with demand that varies more by city.
  - **Meth:** higher output per batch with more Heat per unit.
  - **Weed:** steady output and low Heat, with modest unit value.
  - **Cocaine:** slower, more expensive production with premium market value and greater Heat.
  - **Heroin:** limited or costly production with strong demand and sharper operational risk.
- Treat these as hypotheses. The ruleset and simulations determine final values.
- Require ingredient costs to preserve the existing no-free-money production invariant.
- Confirm that a Crack-only operation can fund early growth and reach the Ecstasy unlock at a reasonable pace without forcing a single play pattern.
- Check results across different city markets, crew sizes, production boosts, and the 1.6 supply loop. Sourcing and dealer distribution remain separate decisions; a recipe does not bypass orders, capacity, or delivery.

**Gate:** No recipe generates stock or cash from a retry, no recipe creates a guaranteed sell profit, and multiple products remain viable in different situations.

**Implemented in 1.8.0-M** (`classic-og-v1.8-m`, built on 1.8.0-L; `npm run qa:recipes`; report in [RECIPE-BALANCE-1.8.0-M.md](RECIPE-BALANCE-1.8.0-M.md)). 1.8.0-F had shipped, with 1.8.0-G to 1.8.0-L built on it, so its provisional recipes stay as they were:

| Recipe | Per thug a turn | Ingredients | Heat a unit | Variance | Identity |
| --- | ---: | ---: | ---: | ---: | --- |
| Crack | 0.5 | $5.00 | 0 | 0.2 | Unchanged. The starter, and the only cook with no Heat. |
| Weed | 0.6 | $4.20 | 0.01 | 0.15 | Steady, the least Heat of any other cook, modest value. |
| Ecstasy | 0.15 | **$17.00** (was $15.00) | 0.1 | 0.2 | A step up in value; where it sells best depends on the city. |
| Cocaine | 0.06 | $28.00 | 0.15 | 0.2 | The slowest and dearest cook with the most Heat, and the most value a unit. |
| Meth | 0.4 | **$8.00** (was $7.00) | 0.05 | 0.2 | High output, more Heat than Weed. |
| Heroin | 0.25 | $8.50 | 0.06 | 0.3 | Limited output and the widest swings; best where its demand is strong. |

- **No guaranteed sell profit.** Pip's home buyback never follows the city, but a player can stack full Pip standing (+5%), a store-price racket (+8% on Ecstasy) and full market pressure (+25% on products), and a top workshop with a Drug Lab cuts ingredients 8% and adds 20% free output. At the 1.8.0-E prices that let Ecstasy and Meth be cooked and sold back at home for a profit. `recipeResaleLoops` checks that worst case, and 1.8.0-F raises Ecstasy and Meth just enough to pass. Pip's counters in other cities pay their city's price, but reaching them takes a run with road risk, so that is a trade rather than a guaranteed profit.
- **Multiple products remain viable.** `recipeBalance` runs a day of cooking and dealer sales for every recipe in every city at three stages (25 thugs and 2 dealers, 80 thugs and a 6-dealer crew with workshop 2, 250 thugs and three crews with workshop 5 and a Drug Lab). The crew cooks what its dealers can sell, up to its turns, and cooks past its free Heat only when the margin pays the bribe. Every recipe is within 85% of the best earner somewhere, and none is the best in more than half of the 33 situations: Ecstasy 11, Cocaine 9, Meth 5, Heroin 5, Crack 2, Weed 1. Cheap, low-Heat recipes win once Heat is expensive or dealers are many; dear ones win where turns or dealers are scarce. The result holds with turns, dealers, thugs, net worth and the workshop pushed both ways.
- **Crack-only opening.** Crack alone earns money a day from the start in every city. Party Favors needs 20 turns of cooking with 15 thugs and costs about $950 against $12,500 paid.
- **Ladder pacing.** `ladderPacing` costs each rung for a player at that stage. Every rung cooks within a day of turns and costs less than its cash reward (the dearest is Bulk Order, about $2,100 against $10,000).
- **Supply loop.** Cooking undercuts every supplier (Weed $4.20 against $6.00, Ecstasy $17.00 against $25.00, Cocaine $28.00 against $31.00, Meth $8.00 against $12.50, Heroin $8.50 against $13.00) but costs turns and thugs. Once dealers can sell more than the crew can cook, product still comes from orders and pickups. A recipe changes no order, capacity or delivery rule.
- **Retries.** Production stays inside the existing idempotent action. The PostgreSQL suite replays an Ecstasy cook with the same action id and checks that the result is identical, with no extra stock, cash or turns.

### D — Quest Presentation

- On the Products page, separate **Can buy**, **Can produce**, and current stock so purchase and recipe permissions are not conflated.
- On Produce, show locked recipes with a short gameplay identity, the job that unlocks them, and a direct link to that job. A new player sees Crack as selectable and the rest of the ladder as locked future goals.
- Keep locked jobs out of Available quests. The quest progression view can show the longer path and prerequisites.
- Completing a recipe quest refreshes recipe access immediately, without requiring a page reload.
- Keep Scout, Produce, Products, and Travel as distinct destinations rather than nesting more tabs inside them.

### E — Admin, Tests & Release

- Test each unlock's quest source, round scope, duplicate award behavior, and pinned-ruleset behavior.
- Test that direct API calls cannot cook a locked product and that a successful unlock takes effect immediately.
- Test objective progress for both old product events and any new product-specific fields.
- Simulate product production and sale economics with and without workshops, favors, and crew supply policies.
- Add admin inspection for recipe unlocks and their source quest; corrections remain audited.
- Test that a new round starts with only Crack cookable and that each rung's quest is unavailable until the previous rung is complete.
- Test that Party Favors needs Pip rep 12 after Cookhouse and that a Crack-only player can reach it through Pip daily contracts.
- Test that Party Favors grants the Ecstasy recipe and purchase access, Bulk Order grants the Meth recipe and purchase access, and Bulk Order is unavailable until Party Favors is complete.
- Test that Meth and Ecstasy daily contracts are not offered before the matching recipe is unlocked.
- Run historical-ruleset tests and verify no old round receives new recipes or gates; rounds that started with Meth and Ecstasy keep them.

## Implementation notes

- The current quest system already supports permanent unlock rewards and product-specific production objectives. Reuse those systems rather than adding a second quest reward ledger.
- The permanent unlock service currently understands product purchase access, weapon access, travel access, and vehicle purchase access. Production access should be an explicit new effect and should not change the meaning of existing unlock keys.
- The current `Produce` page builds selectable batches from the recipe list returned by the product page. The API and production endpoint must agree on recipe availability; server validation is the source of truth.
- The Slice A gate already locks any product that has a `PRODUCT_PRODUCTION_ACCESS` definition in the ruleset. Gating Ecstasy and Meth needs only new unlock definitions in the new ruleset; Crack has none, so it stays open.
- A reward key should name the product recipe it opens, for example `PRODUCT_ECSTASY_RECIPE` or `PRODUCT_WEED_RECIPE`.
- Override `PIP_PARTY_FAVORS` and `PIP_BULK_ORDER` in the new ruleset's quest catalog, as `classic-og-v1.6.5-e2/guided-campaign.ts` does for earlier quests. Keep their quest keys so completion history, admin inspection, and `Taking Sides` prerequisites still line up. This keeps admin inspection and support readable.
- Use a new ruleset ID for every shipped behavior change. Do not edit an already-used ruleset in place.

## Release gates

- The player understands how a quest unlock changes the operation before accepting and after completing it.
- A production unlock never grants purchase access unless the quest explicitly grants that too.
- Locked products remain visible as future goals but cannot be cooked by manipulating the client or calling the API directly.
- Recipe output, ingredient cost, Heat, inventory, and sales reconcile exactly in the ledger and receipts.
- A new round starts with only Crack cookable, and the ladder opens recipes in order: Ecstasy, Meth, Weed, Cocaine, Heroin.
- All historical rounds continue to behave as pinned, including rounds where Meth and Ecstasy were cookable from the start.
- No recipe quest silently adds thugs, changes staffing, or bypasses supply and delivery rules.

## Guiding question

**Can each major quest give the player a new, understandable way to run the empire while keeping the existing economy fair?**
