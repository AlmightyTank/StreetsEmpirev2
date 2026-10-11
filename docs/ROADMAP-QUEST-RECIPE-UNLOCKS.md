# Quest Progression: Recipe Unlocks

## Purpose

Expand the quest system from teaching players where actions live to opening new ways to run their operation. Quests should reward mastery with new product recipes, production options, and supplier relationships while keeping the existing city, crew, Heat, and economy rules authoritative.

The first expansion builds on the current product catalog:

- Crack, Meth, and Ecstasy already have production recipes.
- Weed, Cocaine, and Heroin are in the economy but are not currently cookable.
- Existing permanent product unlocks grant purchase access at Pip. Purchase access and production access must remain separate capabilities.

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
| **B — Pip's Cookhouse Ladder** | **Next** | Earn three new recipes | Add quest chains for Weed, Cocaine, and Heroin. Completing each chain opens that product's recipe in the current round. Quests use existing actions and award no free ingredients, stock, or crew. |
| **C — Product Identity & Balance** | Planned | Make each recipe a real choice | Define per-product production costs, output, variance, and Heat in the pinned ruleset. Simulate production, market sales, Heat, city demand, and supply so no product becomes a universal best pick. |
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

The ladder follows the current economy and does not make players wait to use the existing Crack, Meth, or Ecstasy recipes.

| Quest | Product access | Objective direction |
| --- | --- | --- |
| **Green Thumb** | Weed recipe | Handle Weed through ordinary product orders and sales; prove the operation can move a steady, lower-pressure product. |
| **A Better Cut** | Cocaine recipe | Build a record with premium product sales while managing the operation's Heat and costs. |
| **Pip's Red Ledger** | Heroin recipe | Fulfill a scarce-product contract through normal sourcing and sales before Pip trusts the player with the recipe. |

Quest objective quantities, prerequisites, and cash rewards are set during balance work. The chains should be completable through normal play, should start counting after acceptance where appropriate, and should never require a player to buy an item they cannot yet access.

Recipe identity is expressed only through game rules. No real-world production instructions or ingredients are part of quest text or the UI.

### C — Product Identity & Balance

- Keep each recipe's tradeoff visible before the player spends turns.
- Candidate identities for balancing:
  - **Weed:** steady output and low Heat, with modest unit value.
  - **Cocaine:** slower, more expensive production with premium market value and greater Heat.
  - **Heroin:** limited or costly production with strong demand and sharper operational risk.
- Treat these as hypotheses. The ruleset and simulations determine final values.
- Require ingredient costs to preserve the existing no-free-money production invariant.
- Check results across different city markets, crew sizes, production boosts, and the 1.6 supply loop. Sourcing and dealer distribution remain separate decisions; a recipe does not bypass orders, capacity, or delivery.

**Gate:** No recipe generates stock or cash from a retry, no recipe creates a guaranteed sell profit, and multiple products remain viable in different situations.

### D — Quest Presentation

- On the Products page, separate **Can buy**, **Can produce**, and current stock so purchase and recipe permissions are not conflated.
- On Produce, show locked recipes with a short gameplay identity, the job that unlocks them, and a direct link to that job.
- Keep locked jobs out of Available quests. The quest progression view can show the longer path and prerequisites.
- Completing a recipe quest refreshes recipe access immediately, without requiring a page reload.
- Keep Scout, Produce, Products, and Travel as distinct destinations rather than nesting more tabs inside them.

### E — Admin, Tests & Release

- Test each unlock's quest source, round scope, duplicate award behavior, and pinned-ruleset behavior.
- Test that direct API calls cannot cook a locked product and that a successful unlock takes effect immediately.
- Test objective progress for both old product events and any new product-specific fields.
- Simulate product production and sale economics with and without workshops, favors, and crew supply policies.
- Add admin inspection for recipe unlocks and their source quest; corrections remain audited.
- Run historical-ruleset tests and verify no old round receives new recipes or gates.

## Implementation notes

- The current quest system already supports permanent unlock rewards and product-specific production objectives. Reuse those systems rather than adding a second quest reward ledger.
- The permanent unlock service currently understands product purchase access, weapon access, travel access, and vehicle purchase access. Production access should be an explicit new effect and should not change the meaning of existing unlock keys.
- The current `Produce` page builds selectable batches from the recipe list returned by the product page. The API and production endpoint must agree on recipe availability; server validation is the source of truth.
- A reward key should name the product recipe it opens, for example `PRODUCT_WEED_RECIPE`. This keeps admin inspection and support readable.
- Use a new ruleset ID for every shipped behavior change. Do not edit an already-used ruleset in place.

## Release gates

- The player understands how a quest unlock changes the operation before accepting and after completing it.
- A production unlock never grants purchase access unless the quest explicitly grants that too.
- Locked products remain visible as future goals but cannot be cooked by manipulating the client or calling the API directly.
- Recipe output, ingredient cost, Heat, inventory, and sales reconcile exactly in the ledger and receipts.
- Existing product recipes and all historical rounds continue to behave as pinned.
- No recipe quest silently adds thugs, changes staffing, or bypasses supply and delivery rules.

## Guiding question

**Can each major quest give the player a new, understandable way to run the empire while keeping the existing economy fair?**
