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

Slice A is implemented on beta as the access foundation. The remaining work is sequenced below; Slice B is the next implementation slice.

| Slice | Status | Theme | Outcome |
| --- | --- | --- | --- |
| **A — Quest Access Foundation** | **Complete on beta** | Unlock recipes and districts through quests | Add permanent recipe access plus district access for Scout and Turf, server-side checks, visible locked-state data, and direct links to unlocking quests. Existing purchase unlocks keep their current behavior. |
| **B — Pip's Cookhouse Ladder** | **Next** | Start on Crack, earn the rest | Gate Ecstasy and Meth production behind quests in the new ruleset, then add quest chains for Weed, Cocaine, and Heroin. Each chain requires the previous one and opens one recipe in the current round. Quests use existing actions and award no free ingredients, stock, or crew. |
| **C — Product Identity & Balance** | Planned | Make each recipe a real choice | Define per-product production costs, output, variance, and Heat in the pinned ruleset. Confirm a Crack-only opening is viable, then simulate production, market sales, Heat, city demand, and supply so no product becomes a universal best pick. |
| **D — Quest Presentation** | Planned | Show the progression clearly | Present recipe locks and their unlocking quest in Products and Produce. Keep Available quests limited to quests that are actually available; show future progression on the existing quest progression view. |
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

| Step | Quest | Recipe opened | Requires | Objective direction |
| --- | --- | --- | --- | --- |
| 0 | — | **Crack** | Starting recipe | Available from the start of the round. The onboarding quests teach Produce with Crack. |
| 1 | **Party Starter** | Ecstasy | Onboarding complete | Run a working Crack operation: cook batches and move them through ordinary sales or orders. |
| 2 | **Glass House** | Meth | Party Starter | Move Ecstasy through ordinary sales and keep the operation's Heat in check while running two products. |
| 3 | **Green Thumb** | Weed | Glass House | Handle Weed through ordinary product orders and sales; prove the operation can move a steady, lower-pressure product. |
| 4 | **A Better Cut** | Cocaine | Green Thumb | Build a record with premium product sales while managing the operation's Heat and costs. |
| 5 | **Pip's Red Ledger** | Heroin | A Better Cut | Fulfill a scarce-product contract through normal sourcing and sales before Pip trusts the player with the recipe. |

Quest names are working titles. Objective quantities and cash rewards are set during balance work. The chains should be completable through normal play, should start counting after acceptance where appropriate, and should never require a player to cook a product they cannot yet cook or buy an item they cannot yet access.

**Content that must move behind the ladder.** Several existing jobs assume Meth and Ecstasy are cookable from the start. In the new ruleset:

- The side quests **Bulk Order** (cooks Meth) and **Party Favors** (cooks Ecstasy) require the matching recipe quest as a prerequisite.
- Daily contracts that require cooking a product (**Meth Cook**, **Party Pack**, and any later product contracts) are offered only to players who can cook that product.
- Existing Pip purchase access (`PRODUCT_METH_ACCESS`, `PRODUCT_ECSTASY_ACCESS`) is unchanged. A player can still buy those products at the counter without the recipe, and earning a recipe does not grant purchase access.

Recipe identity is expressed only through game rules. No real-world production instructions or ingredients are part of quest text or the UI.

**Gate:** A new round starts with only Crack cookable. Each later recipe opens only after its quest, in ladder order. No available quest or daily contract requires cooking a locked product. Historical rounds keep all of their existing recipes.

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
- Test that Meth and Ecstasy side quests and daily contracts are not offered before the matching recipe is unlocked.
- Run historical-ruleset tests and verify no old round receives new recipes or gates; rounds that started with Meth and Ecstasy keep them.

## Implementation notes

- The current quest system already supports permanent unlock rewards and product-specific production objectives. Reuse those systems rather than adding a second quest reward ledger.
- The permanent unlock service currently understands product purchase access, weapon access, travel access, and vehicle purchase access. Production access should be an explicit new effect and should not change the meaning of existing unlock keys.
- The current `Produce` page builds selectable batches from the recipe list returned by the product page. The API and production endpoint must agree on recipe availability; server validation is the source of truth.
- The Slice A gate already locks any product that has a `PRODUCT_PRODUCTION_ACCESS` definition in the ruleset. Gating Ecstasy and Meth needs only new unlock definitions in the new ruleset; Crack has none, so it stays open.
- A reward key should name the product recipe it opens, for example `PRODUCT_ECSTASY_RECIPE` or `PRODUCT_WEED_RECIPE`. This keeps admin inspection and support readable.
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
