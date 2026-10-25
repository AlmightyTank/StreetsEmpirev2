# StreetsEmpire — The Board

Status: **Proposed** · Target: **beta** · Scope: a player-listings tab on Stores, then product, then keeper goods.

Builds on: [Hideout, stash, and scavenging](ROADMAP-HIDEOUT-STASH.md) · [Ammo & Parts](ROADMAP-AMMO-PARTS.md). The rank rule is the existing cash weight and buyback in `economy.netWorth`.

## Vision

Players post stacks other players can buy. The keepers stay the shelves, the unlocks, and the rank ceiling. The Board is the fifth Stores tab, one city-wide book, opened at `/game/stores/board`. It is not a new keeper, so it has no standing, no restock clock, and it does not join the basket.

Scavenge parts are the goods this exists for. Nothing in the game buys scrap, precision parts, or specialist circuitry, and the workshop is the sink. Product is the second cut. Guns, ammo, and cars come last, and only near the shelf.

All prices below are proposals to tune in simulation, not approved values. Re-read the live keeper prices when a slice is cut. The figures in this document match `classic-og-v0.1` weapons, Pip’s crack counter, and crack’s $5 ingredients on beta at the time of writing. `LATEST_RULESET` is `classic-og-v2.6-i`.

Rounds pinned before the Board keep today’s four tabs. A ruleset with `playerBoard.enabled` false behaves the same way.

## The listing

Same shape as a flea board, cut to this economy.

- Escrow a stack, name a unit price inside the band, and leave it up for 12 hours or 48 hours.
- Offers for an item sort cheapest first. The seller’s street name is on the row. You cannot buy your own.
- **Partial buys (added after slice F).** A buyer can take any amount of an offer, say 3 of 12, and the rest stays up. On cash, the buyer pays the sticker for what they take, the seller receives 92% of it, and the 8% is deleted from the round. On a barter, the buyer hands over the per-unit (or per-lot) ask that many times.
- Cancel and expiry return the stack. The posting fee does not come back: 1% of book value, minimum $1.
- Six open offers per player.
- Pay on fill. No mail delay, no separate Board reputation.
- **Barter (added after slice F, replacing "no barter").** A seller can ask for goods instead of cash. See "Player barter" below.

Parts leave `scavengedComponents`. The stash grid is derived from that balance, so the cell shrinks with the escrow and grows back on cancel. A fill that needs grid space checks free cells first and refuses when they do not fit.

## The band

Rank counts cash at 75% and a shop good at its buyback. That spread is what stops a keeper purchase from minting net worth. The Board uses the same rule.

With an 8% tax, a unit price is legal only from the floor through the cap, in integer cents:

- Floor = book / 0.75, rounded up.
- Cap = book / (0.75 × 0.92), rounded down.

Inside the band, neither side’s net worth rises. One cent outside raises exactly one side, which is an account-to-account rank transfer. The tax is what gives the band any width. Book for a keeper good is the buyback already in net worth. Book for a part is a new ruleset field, and holding the part counts toward rank the way a gun does.

The band is a ruleset constant. A round is too small for a trailing average. One whale would move it.

### Part books

One price per rarity. Holding the part counts the full book. Selling inside the band turns that rank back into weighted cash.

| Rarity | Keys | Book | Legal unit price |
| --- | ---: | ---: | --- |
| Common | 9 | $4.00 | $5.34 – $5.79 |
| Uncommon | 3 | $25.00 | $33.34 – $36.23 |
| Rare | 3 | $80.00 | $106.67 – $115.94 |
| Epic | 2 | $250.00 | $333.34 – $362.31 |
| Legendary | 2 | $2,500.00 | $3,333.34 – $3,623.18 |

Commons: scrap metal, wiring, tool kit, bottles, labels, packaging, lumber, fasteners, cloth. Uncommon: basic medicine, fuel can, radio. Rare: motor assembly, repair supplies, specialty container. Epic: precision parts, advanced medical. Legendary: high-capacity fuel cell, specialist circuitry.

A legendary near $2,500 sits next to an AK’s $2,450 liquidation value. One hundred commons are $400 of rank. Both are starting points for the sim in slice B.

### Keeper goods, when they are allowed

| Item | Book | Floor | Cap | Shelf |
| --- | ---: | ---: | ---: | ---: |
| Product (crack) | $3.00 | $4.00 | $4.34 | Pip $10.00 |
| Pistol | $35.00 | $46.67 | $50.72 | Tommy $50.00 |
| Shotgun | $315.00 | $420.00 | $456.52 | Tommy $450.00 |
| Tek-9 | $875.00 | $1,166.67 | $1,268.11 | Tommy $1,250.00 |
| AK-47 | $2,450.00 | $3,266.67 | $3,550.72 | Tommy $3,500.00 |
| Low-Rider | $3,000.00 | $4,000.00 | $4,347.82 | Charlie $5,000.00 |

Crack’s window is the useful one. Pip pays $3 and charges $10. A fill from $4.00 to $4.34 beats Pip’s buyback and undercuts Pip’s shelf. Ingredients are $5, so cooking in order to sell still loses money.

An AK’s legal range sits against Tommy at $3,500. A few percent of sold-out premium fits. A double price does not. Shortage stays on Tommy’s timer.

## Closed

These never join the allow-list.

| Goods | Why |
| --- | --- |
| Thugs and girls | Hiring is rank-neutral on purpose, and the thug shelf is what stops cash becoming an army in one click. |
| Condoms, beer, medicine | The corner shelf is the supply that keeps a crew out of a spiral. Their book value is a token fraction of the counter, so a listing would only move supplies to another account. |
| Cash, turns, standing, Drop cosmetics | Those are not stash stacks. Cosmetics are paid outside the round. |

A quest-locked gun can be listed by someone who owns it. The buyer still needs the unlock. The row is visible. The buy stays locked.

## Slices

One reviewable PR per slice into `beta`, in order. A through D merge dark. E is the first ruleset allowed to set `playerBoard.enabled`. Slice A inherits whatever `LATEST_RULESET` is when that PR is cut ( `classic-og-v2.6-i` as of this roadmap) and adds the next ruleset id. Do not take 2.7 Last Stand or 3.0 Empire Cohesion to make room.

| Slice | Delivers | Done when |
| --- | --- | --- |
| **A · Price band** | Ruleset block `playerBoard`, enabled false. Pure floor and cap. No rows, no tab. | A fill inside the band leaves both net worths at or under their start. One cent outside raises exactly one side. A ruleset without the block is unchanged. |
| **B · Part books** | A book value on all 19 scavenge keys, counted in net worth only while the flag is on. | Holding parts moves rank by book times quantity. A key with no book cannot be listed later. Flag off means today’s rank. |
| **C · Escrow** | `PlayerBoardOffer`. Post, cancel, expire. Fee kept. Cap of six open offers. | You cannot list more than you hold, a sixth offer, or a key outside the catalog. A second cancel returns nothing and charges nothing. |
| **D · The tab** | Fifth Stores tab. Filters: All and Parts. Cheapest first. Your offers, with cancel. Hidden when the flag is off. | A round with the flag off still renders Corner, Tommy’s, Charlie’s, and Pip’s. An empty book is an empty book. |
| **E · Fill** | One transaction. 92% to the seller, 8% deleted. Stash room checked. Flag may turn on for a new round. | The same action cannot fill twice. A sold offer cannot be cancelled. Item counts across both players plus escrow stay constant. Neither rank rises. |
| **F · Product** | Crack, and any other product whose book is already its Pip buyback, joins the same band. | A unit from $4.00 to $4.34 fills. Cooking to sell still loses against the $5 ingredients. A price above the cap is refused. |
| **G · Keeper goods** | Guns, ammo, and cars. Buyer must already have the unlock. Units bought from the Board that day stop at one keeper delivery: pistol 50, shotgun 5, Tek-9 3, AK-47 2, low-rider 3. Re-read ammo and parts deliveries from the ruleset when this slice is cut. | A locked buyer can read the row and cannot buy it. The next unit after the delivery cap is refused. Tommy’s and Charlie’s shelves do not change size. |
| **H · Release** | Staff ledger of posts, fills, and cancels. A sim that random-fills. New rounds pin the enabled ruleset. Old rounds stay pinned. | Flag off is the stores screen this roadmap started from. The sim fails if a fill creates an item, loses one, or raises either rank. |

Slice A shipped as `classic-og-v2.6-j` (2.6.0-J): `playerBoard: { enabled: false, taxPercent: 8 }` and `playerBoardBand`, `isPlayerBoardPriceLegal` and `playerBoardSellerProceedsCents` in `packages/rules-engine/src/calculations/player-board.ts`. Seller proceeds round down, so the deleted tax never rounds away and a fill inside the band holds for every cash balance under the 75% truncation. One cent outside the band raises one side by a fraction of a cent per unit, so the rank tests in `player-board.test.ts` use 100-unit fills to clear that rounding.

Slice B adds `playerBoard.partBookCents` to `classic-og-v2.6-j`, which is still unreleased and dark, with the books from the part table above for all 19 keys. `playerBoardPartBookCents` returns null for any other key, so it cannot be listed. `calculateNetWorthCents` counts held parts from the stored `scavengedComponents` only while `playerBoard.enabled` is true. Flag off is today's rank.

Parts count toward rank (decided after slice C). Every rank calculation already passes either the full player row or `toState(row)`, so held parts and the `playerBoardEscrow` column reach `calculateNetWorthCents` with no per-caller wiring. Three changes make the stored rank correct:

- **The action pipeline re-reads part balances before its whole-state write.** It does this unless the action returned a new balance itself, as hideout builds do. Before this fix, the write put the pre-action balance back. **Scouting finds were never kept and workshop crafts never used up their ingredients, on every round.** This fix applies regardless of the Board flag.
- **Routes that change parts or cash outside an action re-settle afterwards** when the Board is on: opening a cache, the generator, the Salvage Yard, and Board post and cancel. Rounds without the Board keep settling on the next read, as before.
- **Escrow lives in `RoundPlayer.playerBoardEscrow`** and counts at book like held parts. Posting moves rank only by the weighted fee, and cancel and expiry move nothing.

**The Salvage Yard imbalance is fixed.** At the roadmap's books, two yard routes raised rank once parts counted:

- **Cash alone.** A fuel cell or specialist circuitry cost about $2,250 in yard cash, roughly $1,690 of weighted rank, for $2,500 of book.
- **Barter.** Every barter returned more book than it took. For example, 5 commons plus 20 beer, about $24 of book, became an $80 motor assembly. Buying those inputs on the Board at the floor is rank-neutral, so cash plus Board plus yard minted rank.

The books stay as written. Instead, on a round with the Board on, every yard barter also asks for the cash that covers its shortfall at the cash weight: `playerBoardTradeTopUpCents`, rounded up to whole dollars. The shortfall is the output's book minus the book of the parts and goods handed over, with goods valued as `economy.netWorth` values them.

At these books the top-ups per unit are:

| Part | Top-up |
| --- | ---: |
| Motor assembly | $75 |
| Repair supplies | $52 |
| Specialty container | $77 |
| Precision parts | $203 |
| Advanced medical | $151 |
| High-capacity fuel cell | $2,854 |
| Specialist circuitry | $2,879 |

The cash prices for commons ($100) and uncommons ($300) already pay their way, so they don't change. Because the top-ups are derived from the books, retuning the books keeps the yard safe automatically. A test runs every part through `calculateNetWorthCents`, over several quantities and cash remainders, and holds that no yard trade raises rank. Rounds without the Board trade exactly as before.

The cost of the fix is that legendary barters are much dearer on Board rounds, by about $2,850 each. That falls on the hideout builds that need them: generator capacity and the intel room. The slice H sim should check that those builds stay within reach.

Slice C adds `PlayerBoardOffer` (migration `20261225000000_player_board_offers`) and `PlayerBoardService` with three routes: `POST /stores/board/offers`, `POST /stores/board/offers/:offerId/cancel` and `GET /stores/board/mine`. The listing rules are on the 2.6-j block: six open offers, 12 or 48 hours, and a fee of 1% of book rounded up with a $1 minimum. Posting needs the flag on, so nothing can post on 2.6-j. Notes for the slices that follow:

- **Six offers means six.** The table's "a sixth offer" contradicts "six open offers per player". The cap allows six and refuses the seventh.
- **Pause.** Each offer stores `Round.pausedMinutesTotal` at posting. Expiry is pushed back by every pause since then, including one still open, so a paused round never eats a listing. Posting and cancelling are refused while paused.
- **Expiry is lazy.** It runs when the seller posts, cancels or reads their offers, and in `PlayerBoardService.expireDue(round)`. D's book read model must call `expireDue` or filter on the effective expiry.
- **A stack that needs a new stash cell when none is free is not lost.** Cancel refuses with `STASH_FULL`. Expiry marks the offer `EXPIRED` with `returnedAt` null, and the stack goes back on the next settle that has room. Escrow for E's item count is `OPEN` plus `EXPIRED` with `returnedAt` null. Today a level-0 stash has 60 cells and only 37 distinct stacks exist, so this path cannot trigger yet.
- **Escrow counts toward rank.** Escrowed stacks are held in `RoundPlayer.playerBoardEscrow` and count at book, the same as held parts. `OPEN` offers plus `EXPIRED` offers with `returnedAt` null always equal that column.

Slice D adds the Board tab at `/game/stores/board`. It is the sixth tab, not the fifth, because the Salvage Yard shipped as the fifth after this roadmap was written.

- **Hidden when off.** `GET /stores` sets `playerBoard: true` only when the round's ruleset has the flag on, and the tab renders only then. `GET /stores/board` answers `BOARD_CLOSED` otherwise, and the page shows the same "store is not open" notice as an unknown shop.
- **The read model.** `PlayerBoardService.book` runs `expireDue` first, so nothing past its time is ever listed. Offers are grouped by item in catalog order and sorted cheapest first, oldest first on a tie, with seller round names and the viewer's own offers marked.
- **Filters.** All and Parts return the same rows until slices F and G add product and keeper goods.
- **On the tab.** It also shows your offers with cancel, and a listing form with the band, the fee and the after-tax payout, all computed the way the server computes them. There is no buy button until slice E.

Slice E adds fills through `PlayerBoardService.fill` and `POST /stores/board/offers/:offerId/buy`, plus the first enabled ruleset.

- **The ruleset is opt-in.** `classic-og-v2.6-j-board` (2.6.0-J-board) is 2.6.0-J with `playerBoard.enabled` true. It is registered ahead of 2.6.0-J, so 2.6.0-J stays `LATEST_RULESET` and the default for new rounds, and a test holds that. An admin opts a new round in by picking it at scheduling. Making it the default is H's job.
- **One transaction.** Buyer and seller are locked in id order. The offer flips `OPEN` to `SOLD` with a conditional update, so two devices can never share it. The buyer pays the sticker. The seller gets 92% rounded down as `proceedsCents`, and the rest leaves the round. Both sides get an economy ledger line (`PLAYER_BOARD_BUY` and `PLAYER_BOARD_SALE`).
- **Retries.** A retried request with the same `actionId` returns the first receipt and charges nothing.
- **Refusals change nothing.** These all refuse: your own offer, a closed or expired one, too little cash, and no stash room. An expiry found during a buy is committed (the stack goes home) before the buy is refused.
- **Rank.** The route re-settles both players, so stored rank is current on both sides straight away. The integration suite shows neither rank rises at the floor, the middle or the cap, and that items across both players plus escrow stay constant.

Slice F lists every drug, not just crack: crack, weed, ecstasy, cocaine, meth and heroin.

- **The allow-list** is `playerBoard.listableProducts` on the 2.6-j block, and the live variant inherits it.
- **Books.** A drug's book is its net worth value: `perCrackCents` for crack and `economy.netWorthCents` for the others. A drug is listable only while that book equals Pip's buyback, and a test holds all six there.

| Drug | Book | Floor | Cap | Cook cost |
| --- | ---: | ---: | ---: | ---: |
| Crack | $3.00 | $4.00 | $4.34 | $5.00 |
| Weed | $2.40 | $3.20 | $3.47 | $4.20 |
| Ecstasy | $9.00 | $12.00 | $13.04 | $17.00 |
| Cocaine | $12.00 | $16.00 | $17.39 | $28.00 |
| Meth | $4.50 | $6.00 | $6.52 | $8.00 |
| Heroin | $4.50 | $6.00 | $6.52 | $8.50 |

- **Cooking to sell always loses.** Every cook cost is above its cap, so cooking for the Board never pays.
- **Storage.** Drugs post from, and fill into, product inventory: the `crack` column and `PlayerProduct` rows, through `ProductInventoryService`. They take no stash cell, so fills and returns skip the stash check.
- **Escrow** values parts and drugs alike (`playerBoardEscrowNetWorthCents`).
- **The tab** gains a Drugs filter. The book lists drugs first, then parts.
- **The rank tests** cover drug fills at the floor and the cap.

### Player barter

The Board is player-to-player for both kinds of price. An offer is either **cash** (a unit price inside the band, as above) or a **barter**: up to `maxAskItems` (3) other listable items, parts or drugs, asked **per unit**, or per lot of `lotSize` units for goods worth less than anything you could ask for (for example, every 10 crack for 1 radio). A buyer takes any number of units, or whole lots, and hands over the ask that many times. The buyer must hold the goods, or the cash for a cash offer.

The rule that keeps barter from moving rank:

- **The seller can't gain.** One lot's ask may not be worth more, at book, than the lot (`ASKS_TOO_MUCH`). No fill therefore raises the seller's rank.
- **The buyer can't gain.** When the units taken are worth more than the goods handed over, the buyer also pays the gap to the Board in cash at the cash weight, rounded up to whole dollars (`playerBoardBarterFeeCents`, built on the same `playerBoardTradeTopUpCents` as the Salvage Yard fix). It is priced on what each fill takes, all together, never per lot. That cash is deleted from the round, so no fill raises the buyer's rank either. An even swap costs nothing extra.
- **No 8% cut.** The posting fee still applies, but barter has no cut, because it isn't needed to keep rank fair.

Mechanics:

- The offer stores `priceKind`, `lotSize`, `askItems` (per lot) and `askBookCents` (per lot). A listing must be a whole number of lots, and a fill takes whole lots (`BARTER_LOT`).
- On a fill, the buyer's goods go straight into the seller's holdings, and the stack goes from escrow to the buyer.
- The buyer's top-up is booked as `PLAYER_BOARD_BARTER_FEE`.
- The fill is refused if the buyer is short of goods or cash, if the buyer has no stash room for the stack, or if the seller has no stash room for a part they asked for.

On the tab, barter rows show "Trade: 2 × Radio + 5 × Scrap metal" with the cash top-up, and the button reads Trade. It is disabled with a reason when the viewer is short of something. The listing form has a Cash or Barter switch, a builder for up to three lines, and a value meter that shows the buyer's top-up. Tests sweep offers against baskets with the real net worth calculator and show neither side's rank rises. Integration tests cover posting, refusals, the swap, item conservation and rank on a live Board round.

### Partial buys

- **Selling down.** An offer keeps `quantity` (units posted) and `remainingQuantity` (units still in escrow and for sale). Each purchase writes a `PlayerBoardFill` row (buyer, quantity, cash paid, seller proceeds), and that table is the record slice H's staff ledger reads.
- **Fill size.** A fill takes `quantity` units of a cash offer, or whole lots of a barter, or everything left when it's omitted. More than is left is refused with `NOT_ENOUGH_LEFT`. The offer closes as `SOLD` when nothing is left.
- **Concurrency.** Buyers lock the seller, so two buyers take turns. The decrement is also conditional on enough being left, so a unit is never sold twice.
- **Cancel and expiry** return only what's left.
- **Rank.** The band is per unit and proceeds round down on each fill, so a partial buy is as rank-fair as a whole one, and the tests check it at 1, 7 and 22 units.
- **On the tab,** cash rows get a quantity box beside the button, which reads "Buy 3" or "Buy all". Your offers show "9 of 12 left".

### Any price, steeper outside the fair range

The band is no longer a hard limit: it is the **fair range**. A seller can post any cash price of at least one cent, or a barter asking for any amount. Inside the fair range, nothing extra is charged. Outside it, whoever would gain rank pays exactly what cancels the gain, rounded up to whole dollars, so the charge grows the further out the price is:

| Situation | Who pays | When | Helper |
| --- | --- | --- | --- |
| Cash price above the range | Seller, as a listing tax for the whole stack | At posting, kept like the posting fee | `playerBoardCashListingTaxCents` |
| Cash price below the range | Buyer, as a Board fee on what they take | At each fill, deleted | `playerBoardCashBuyerFeeCents` |
| Barter asking more than the lots are worth | Seller, as a listing tax | At posting, kept | `playerBoardBarterListingTaxCents` |
| Barter asking less than the lots are worth | Buyer, as a top-up | At each fill, deleted | `playerBoardBarterFeeCents` |

Example with 100 crack (book $3, fair range $4.00–$4.34):

- **Too high.** Listing at $4.50 costs $14 of tax, at $6 costs $152, and at $10 costs $520.
- **Too low.** Selling at $3.50 costs buyers a $50 Board fee for the lot, and at $2 a $200 fee.

A below-range price has to charge the *buyer*, never the seller. Otherwise a second account could sell cheap to a main account and pass it rank.

- **Rank timing.** The listing tax drops the seller's rank at posting, and the overpriced sale lifts it back to at most where it started. The integration test therefore measures the seller from before posting.
- **Storage and ledger.** The offer stores `listingTaxCents`. The economy ledger gains `PLAYER_BOARD_LISTING_TAX` and `PLAYER_BOARD_BUYER_FEE`.
- **On the tab.** The price box shows the fair range and the tax or fee a price would cost. Cheap rows are marked "+ Board fee", and the buy button and confirmation include it.
- **Tests.** Sweeps cover crack and parts of every rarity, at prices from 1 cent to many times the book, for whole and partial buys and odd cash balances. Neither side's rank rises across posting and selling together.

F and G both sit on E. Product is the smaller cut, so it goes first. H is last. D lands before E so the tab exists on the round where fills turn on.

What each slice may touch:

- A is rules-engine tests and the disabled block.
- B adds the book map to net worth behind the flag.
- C is the server ledger and escrow.
- D is the Stores tab and its read model.
- E is the buy transaction and the first enabled ruleset.
- F and G only widen the allow-list.
- H adds the sim and the staff view.

## Guardrails

- No purchased listings, fees, or Board access with Crowns or Supporter perks.
- Fills are idempotent on retry. Two devices cannot buy one offer.
- Pause stops expiry the way it stops other round clocks. A paused round does not eat a listing.
- Missing a listing, or being offline when it expires, returns the stack. It does not confiscate anything else.
- The Board does not credit keeper standing and does not sell a discount.
- Seller names are public round names. The staff ledger is the wash-trade record.
- Old rounds are never changed.
