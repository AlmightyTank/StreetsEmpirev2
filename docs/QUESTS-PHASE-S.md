# Quest System — Phase S Dynamic City Contracts

Phase S adds short-lived market opportunities to the unified Jobs & Contacts system.

The goal is to make the existing city economy generate work instead of adding another fixed
catalog of hand-written Jobs.

## Ruleset boundary

Phase S ships as:

- `0.7-Q` — Branching Jobs, 54 quest definitions
- `0.7-R` — everything in Q plus two reusable dynamic city-contract slots

The catalog grows from **54 to 56 definitions**, but those two new definitions are templates.
Their displayed city, product, target, description and reward are generated per board window.

No schema migration is required.

## Board

The City board has:

- **2 offers**
- **12-hour windows**
- UTC boundaries at **00:00** and **12:00**
- the same offers for every player in the same round
- a new `PlayerQuest.attempt` for each template on the next board

The board is deterministic from:

- round id
- board-window start
- city
- product
- the pinned ruleset's city economy

This means refreshing the page cannot reroll a better contract.

## What generates an opportunity

At the start of each 12-hour window, the generator evaluates every real city/product pair in
the pinned ruleset.

It reads:

- current scheduled Pip supply from the existing supply-swing system
- drought/glut events active at the board boundary
- the city's configured demand for the product
- the city's high-market baseline sell price

It deliberately **does not** use player-driven high-market push when selecting or pricing the
board. Shared player trades can move that price after the board opens; using the stored push
would otherwise let two players opening the page at different moments receive different Jobs.

A permanent `supply: null` row means Pip simply does not carry that product in that city. It
is not treated as a temporary shortage.

### Pressure scoring

The strongest opportunities rise to the two board slots:

- Out of stock: highest live supply pressure
- Low supply: strong pressure
- Normal supply: small pressure
- Plentiful supply: negative pressure
- Active drought: large positive pressure
- Active glut: negative pressure
- Higher configured city demand: additional positive pressure
- deterministic tiny tie-breaker: prevents permanent ordering ties without adding randomness

A glut is normally the opposite of a delivery shortage. A glut can stay eligible only when
the city's underlying demand is still unusually strong.

## Contract size

The generated target is deliberately simple:

| Live condition | Delivery target |
| --- | ---: |
| Drought or OUT | 750 units |
| LOW supply or high demand | 500 units |
| Other qualifying market order | 250 units |

This preserves the original Phase S roadmap range of **250–750 units**.

## Reward — effective 1.35× opportunity

The player still receives the actual money from selling the product through the normal market
or Pip trade.

The contract adds a cash bonus equal to **35% of the expected sale value** captured when the
board opens:

`bonus = round(expected unit sale price × target × 0.35)`

Nominally:

`expected sale + contract bonus = 1.35 × expected sale`

The actual market sale can differ because players can move the shared high market after the
board is published. The contract bonus itself stays fixed for the full window.

This avoids rewriting or bypassing the existing market economy.

## Fulfillment

A contract requires the exact generated:

- city
- product
- direction = sell
- quantity total

Two existing sale paths can advance it:

1. **RUN_TRADE**
   - a run reaches the target city
   - the player sells the specified product at Pip or the high market
2. **STORE_SELL**
   - the player's home is already the target city
   - the player sells the specified product through Pip's local counter

Phase S adds a quest-only action signal for `RUN_TRADE`. Run trades remain intentionally
absent from the normal activity feed, but the quest engine now receives city, product,
direction, venue, quantity and total value.

Home Pip product/store sale activities now also include the player's city. Crack sold through
the ordinary Pip store path includes its product key as well.

Buying product never advances a city delivery.

Selling the right product in the wrong city never advances it.

## Persistence

Each generated attempt stores its immutable offer under:

`PlayerQuest.rewardState.cityContract`

That state contains:

- board window start/end
- city and display name
- product and display name
- market condition
- generated title/description
- target
- expected unit sale value
- expected total sale value
- fixed cash bonus
- payout multiplier metadata

The existing `PlayerQuest` schema already has `rewardState`, `attempt` and `expiresAt`,
so Phase S needs no migration.

## Deadline behavior

The deadline belongs to the board, not the accept click.

Therefore:

- accepting with one hour left gives one hour
- abandoning and reaccepting does not reset the timer
- abandoning does not reroll the city/product/reward
- an open contract becomes EXPIRED at the board boundary
- a new attempt is created for the next board
- completed historical attempts remain intact

This matches the server-authoritative Daily/Weekly contract behavior already used elsewhere in
the quest system.

## UI

The Quest page adds a **City** tab alongside Available, Daily, Weekly, Active and Completed.

A City card shows the generated:

- city/product/condition title
- live-condition explanation
- exact delivery objective
- fixed cash contract bonus
- board refresh time

City contracts are excluded from the ordinary Available count so the rotating board does not
inflate the handcrafted Job total.

## Compatibility

Phase S preserves:

- all 54 Phase R/Q quest definitions
- branching choices
- Secret Jobs
- Daily Contracts
- Weekly Contracts
- favors
- permanent unlocks
- Hideout v2
- travel route/risk rules
- high-market price-impact rules
- city supply/event schedules

Older pinned rulesets do not receive the City board.

## Tests

Phase S coverage includes:

- 54 → 56 ruleset boundary
- exactly two runtime templates
- fixed 12-hour board boundaries
- deterministic same-round offers
- targets restricted to 250 / 500 / 750
- 35% fixed bonus math
- exact city/product/sell objective matching
- buys and wrong-city sales rejected by the objective
- generated reward recovery from `rewardState`
- two-slot materialization
- attempt increment after reset
- historical completed attempt preservation
- inherited Branching/Secret/Daily/Weekly/Favor/Unlock/Hideout behavior
- ruleset registry count
