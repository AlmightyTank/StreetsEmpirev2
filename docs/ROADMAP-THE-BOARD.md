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
- A buy takes the whole offer. The buyer pays the sticker. The seller receives 92%. The 8% is deleted from the round.
- Cancel and expiry return the stack. The posting fee does not come back: 1% of book value, minimum $1.
- Six open offers per player.
- Pay on fill. No mail delay, no partial stack, no barter, no separate Board reputation.

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

One issue is still open before slice E:

- **The Salvage Yard breaks the rank rule at these books.** The yard sells commons for $100 and uncommons for $300, and it barters the rest. Two routes raise rank:
  - Cash alone. A fuel cell or specialist circuitry costs about $2,250 in yard cash, which is about $1,690 of weighted rank, for $2,500 of book.
  - Barter, once the Board is on. Every yard barter returns more book than it takes. For example, 5 commons plus 20 beer, roughly $24 of book, become an $80 motor assembly. Buying those commons on the Board at the floor is rank-neutral, so cash plus Board plus yard mints rank.

  The highest per-rarity books with no rank-raising yard route are $4 / $20 / $22 / $38 / $114. The books shipped as written by decision. The slice H sim has to resolve this, either by retuning the books or by changing the yard's prices and barters.

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

Turning the Board on for a real round now makes the Salvage Yard issue above live. Until the books or the yard are retuned, a round on 2.6.0-J-board can mint rank through yard barters.

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
