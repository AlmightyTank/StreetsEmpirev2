# The Drop

A cosmetic storefront paid in **Crowns**. Players earn Crowns from play or buy
them in fixed packs, then spend them on looks authored only for The Drop and on
Street Pass level skips. Crowns and everything bought with them belong to the
account and survive every round. Plan and acceptance criteria:
[ROADMAP-THE-DROP.md](ROADMAP-THE-DROP.md).

Status: Slices A–F built. Off in production until `DROP_ENABLED=true`; Crown
packs off everywhere until `DROP_CROWN_PACKS_ENABLED=true` with Stripe keys.

## Decisions

| Question | Decision |
| --- | --- |
| Currency | Crowns, whole numbers only, one balance (earned and bought together; the ledger keeps the source). |
| What Crowns buy | Drop cosmetics, Drop bundles and Street Pass level skips. Never cash, turns, guns, product, chips or odds. |
| Street Pass skips | Any tier of the current round's Street Pass (decided 2026-10-18). 125 a tier, 1,000 for ten. A skip raises Cred to that tier; the player still claims each tier. |
| Drop Pass | Not built. The roadmap's optional cosmetic-only pass was replaced by Street Pass skips. |
| Randomness | None. Every offer shows exactly what it grants and costs. |
| Supporter discount | Active, paid supporters (Stripe `active`, or a Google Play subscription that is active, in grace or paid through) pay 10% less for items, bundles and Street Pass skips, rounded down, never below 1 Crown (decided 2026-10-18). Free trials pay full price. It applies after the bundle adjustment, ends when the membership does, and never touches Crown packs. A birthday week gives 15% instead ([BIRTHDAYS.md](BIRTHDAYS.md)); an account gets the larger discount, never both. Rule: `supporterDropPrice` in `packages/rulesets/src/drop.ts`; the order metadata records the discount and the pre-discount price. |
| Ownership | `AccountCosmeticUnlock` rows with `sourceQuestKey = 'drop'`, keys starting `drop-`. Never sold twice. |
| Existing rewards | Nothing from the Street Pass, login track, supporter catalogue, events or achievements is sold. A test checks the keys and style keys never collide. |

## Catalogue

Defined in code, `packages/rulesets/src/drop.ts`. Twenty-three collections,
seven to nine SKUs each (179 in all), one bundle each, plus **Street Singles**: 30
one-off pieces (10 ride and gun looks, 4 outfits, 6 frames, 6 accents, 4
titles) with no set, bundle or shell. Singles are never featured; they fill
the random daily picks. Nineteen are in rotation; the
four holiday sets (Graveyard Shift, Naughty List, Heartbreaker, Block Party)
are held as Draft and hidden until an admin releases them in their season (see
[DROP-COLLECTIONS-NEXT.md](DROP-COLLECTIONS-NEXT.md)). The three launch sets came
first; the twelve after them were added on 2026-10-18 and three movie homages
(Quarter Mile, 88 Club, Swamp Kingdom) and Zombie Apocalypse on 2026-10-19 (see
[DROP-COLLECTIONS-NEXT.md](DROP-COLLECTIONS-NEXT.md)):

| Collection | Vehicle | Crew | Weapon | Profile | Shell & accent | Title |
| --- | --- | --- | --- | --- | --- | --- |
| Kingpin Luxe | Sedan (700) | Thug (600), Hoe (600) | — | Frame (400); avatar: crown (300), fur coat (400), crown drops (250) | Shell (1,050), Lacquer Brass accent (300) | Old Money (200) |
| Neon Underworld | Low-Rider (700) | Thug (600), Hoe (600) | Tek-9 (500) | Frame (400); avatar: visor (300), glow (500) | Shell (1,050), Underworld Violet accent (300) | After Hours (200) |
| Winter Heist | Van (700) | Crew set, both types (750) | Shotgun (450) | Frame (400); avatar: parka (400), snowfall (500) | Shell (1,000), Heist Frost accent (250) | Cold Case (150) |
| Biscayne Sunset | Sedan (700) | Thug (600), Hoe (600) | Pistol (450) | Frame (400) | Shell (1,000), Flamingo Pink accent (250) | Ocean Drive (150) |
| Velvet Speakeasy | Sedan (700) | Thug (600), Hoe (600) | AK-47 (500) | Frame (400) | Shell (1,050), Merlot Velvet accent (300) | Bootlegger (200) |
| Platinum Funk | Low-Rider (700) | Thug (600), Hoe (600) | — | Frame (400) | Shell (1,050), Tangerine Funk accent (300) | Funk Royalty (200) |
| Redline Syndicate | Sedan (700) | Thug (600), Hoe (600) | AK-47 (500) | Frame (400) | Shell (1,050), Redline Red accent (300) | Redline (200) |
| Wet Paint | Low-Rider (700) | Thug (550), Hoe (550) | Pistol (450) | Frame (400) | Shell (1,000), Spray Mint accent (250) | All City (150) |
| Hazard Cook | Van (700) | Crew set, both types (750) | Shotgun (450) | Frame (400) | Shell (1,000), Hazard Yellow accent (250) | The Chemist (200) |
| Dockside | Van (700) | Thug (600), Hoe (600) | AK-47 (500) | Frame (400) | Shell (1,000), Harbour Blue accent (250) | Off the Books (150) |
| Crown Jewels | Sedan (850) | Crew set, both types (850) | AK-47 (550) | Frame (450) | Shell (1,150), Sapphire accent (300) | Crowned (200) |
| Bayou Smoke | Van (700) | Thug (600), Hoe (600) | Shotgun (450) | Frame (400) | Shell (1,000), Firefly Green accent (250) | Swamp King (150) |
| Desert Mirage | Low-Rider (700) | Thug (600), Hoe (600) | Tek-9 (500) | Frame (400) | Shell (1,050), Turquoise Stone accent (300) | Dust Devil (200) |
| Rewind | Van (700) | Thug (600), Hoe (600) | Tek-9 (450) | Frame (400) | Shell (1,000), Tracking Magenta accent (250) | Run It Back (150) |
| Snake Eyes | Sedan (700) | Thug (600), Hoe (600) | Pistol (450) | Frame (400) | Shell (1,050), Card Felt accent (300) | Loaded Dice (200) |
| Graveyard Shift | Sedan (700) | Thug (600), Hoe (600) | Pistol (450) | Frame (400) | Shell (1,050), Ghost Green accent (250) | Night Shift (200) |
| Naughty List | Van (700) | Crew set, both types (750) | Tek-9 (450) | Frame (400) | Shell (1,000), Candy Red accent (250) | Coal Collector (150) |
| Heartbreaker | Low-Rider (700) | Thug (600), Hoe (600) | Tek-9 (500) | Frame (400) | Shell (1,050), Heartbreak Rose accent (300) | Cold Hearted (200) |
| Block Party | Van (700) | Thug (600), Hoe (600) | Shotgun (450) | Frame (400) | Shell (1,000), Mango Heat accent (250) | Block Captain (150) |
| Quarter Mile | Sedan (700), Low-Rider (700) | Thug (600), Hoe (600) | Tek-9 (500) | Frame (400) | Shell (1,050), Nitrous Blue accent (300) | Ride or Die (200) |
| 88 Club | Van (700) | Thug (600), Hoe (600) | Pistol (450) | Frame (400) | Shell (1,000), Flux Blue accent (250) | Ahead of Time (200) |
| Swamp Kingdom | Van (700) | Thug (600), Hoe (600) | Shotgun (450) | Frame (400) | Shell (1,000), Loch Green accent (250) | I'm Old Gregg (150) |
| Zombie Apocalypse | Van (700) | Thug (600), Hoe (600) | Shotgun (450) | Frame (400) | Shell (1,000), Quarantine Orange accent (250) | Last One Standing (200) |

Bundles: Kingpin Luxe 2,800 (list 4,800), Neon Underworld 2,800 (list 5,150), Winter Heist 2,750 (list 4,600), Biscayne Sunset 2,350 (list 4,150), Velvet Speakeasy 2,400 (list 4,350), Platinum Funk 2,250 (list 3,850), Redline Syndicate 2,400 (list 4,350), Wet Paint 2,300 (list 4,050), Hazard Cook 2,250 (list 3,750), Dockside 2,350 (list 4,200), Crown Jewels 2,400 (list 4,350), Bayou Smoke 2,350 (list 4,150), Desert Mirage 2,400 (list 4,350), Rewind 2,350 (list 4,150), Snake Eyes 2,400 (list 4,300), Graveyard Shift 2,400 (list 4,250), Naughty List 2,250 (list 3,700), Heartbreaker 2,400 (list 4,350), Block Party 2,300 (list 4,150), Quarter Mile 2,400 (list 5,050), 88 Club 2,350 (list 4,200), Swamp Kingdom 2,350 (list 4,150), Zombie Apocalypse 2,350 (list 4,200).

### Shell themes

Each collection has a full game-shell theme (`SITE_THEME`, style key
`<collection>-shell`, e.g. `kingpin-luxe-shell`). Like the
other premium shells they reskin the whole game: palette tokens, panel, stat,
button, input, top bar and footer fills in `apps/web/src/styles/drop-shells.css`,
plus an illustrated backdrop under the page content
(`apps/web/src/components/theme-scenes/<Collection>Scene.tsx`, registered in
`SiteThemeDecor`). Kingpin Luxe: a deco sunburst and brass-lit
towers. Neon Underworld: buzzing tube signs (a slow, soft dip, never a flash),
rain and a neon-lit wet street. Winter Heist: a vault dial, a frosted skyline
and falling snow. The twelve later shells: deco hotels and swaying palms
(Biscayne Sunset), a hidden bar with a gramophone and cigar smoke (Velvet
Speakeasy), a turning mirror ball (Platinum Funk), a parking-garage meet with
light trails (Redline Syndicate), a piece drawing itself on a yard wall (Wet
Paint), a desert lab with bubbling flasks (Hazard Cook), cranes and a sweeping
searchlight (Dockside), a crown and glinting stones (Crown Jewels), cypress and
fireflies (Bayou Smoke), mesas and heat shimmer (Desert Mirage), a CRT and a
rolling tracking glitch (Rewind) and a card table under a swinging lamp (Snake
Eyes). Every scene stops under reduced motion; the snow is parked in
view. The player's chosen accent still colours buttons and links, as with every
shell. A shell does not include its collection's frame; frames are sold
separately. Equip in Account → Profile → Site theme; the server refuses a shell
the account does not own.

Each look is one partial-coverage collection (`COLLECTION_COVERAGE` and
`ITEM_COSMETIC_STYLES` in `packages/shared/src/cosmetics.ts`), so it dresses
only the items it was drawn for and the locker never offers it elsewhere. A
weapon or vehicle look shows on items the player already has; it never grants
the item or buying access. Art is plain SVG in
`apps/web/public/items/cosmetics/drop/`, generated by
`node scripts/art/generate-drop-art.mjs` from the Classic geometry with new
paint, clothes and details. Accents are CSS in `apps/web/src/styles/drop.css`
and frames in `apps/web/src/styles/drop-art.css`; the animated frames (Neon
Underworld, Winter Heist, Platinum Funk, Redline Syndicate, Wet Paint, Crown
Jewels, Bayou Smoke, Desert Mirage and Rewind) stop under reduced motion.

### Bundle pricing with partial ownership

`bundlePriceFor`: price × (list value of the items you don't own ÷ list value
of all items), rounded up. Owning nothing pays the bundle price; owning
everything means it can't be bought. Only the missing items are granted.

## Storefront and rotation

All computed on the server clock for every request and every purchase
(`rotationAt` in `drop-catalog.service.ts`), so a window boundary switches
offers exactly once and an expired offer id is refused.

- **Featured:** two sets a week, Monday 00:00 UTC (plus the reset hour), each
  shown as its bundle and every piece in it, cycling in pairs through
  collections with a live item. A live holiday set always takes one of the
  two slots. An admin Featured offer replaces both.
- **Daily:** `dailyOfferCount` random items (default 8) picked deterministically per
  UTC day from the daily pool, excluding anything already on sale.
- **Permanent catalog:** entries whose return policy is Permanent.
- **Admin offers:** scheduled windows with their own price and badge. Shown as
  Coming soon for up to 7 days before they start.
- **Homepage order:** Admin catalog `homepageSlot` values order Featured and
  Permanent Catalog cards (1 first); unplaced entries follow in stable key order.

Offer ids carry their window (`rot:D:2026-10-18:<key>`, `rot:F:W<n>:<key>`,
`cat:<key>`, `adm:<id>`). The client never sends a price.

Routes: `/game/drop` (shop), `/game/drop/item/:slug`, `/game/drop/wallet`,
`/game/drop/crowns`, `/game/drop/pass`. The menu entry sits in Progress &
Rewards and only appears when `GET /api/drop/status` says the storefront is on.
Category and ownership filters live in the URL, so returning from an item
keeps them.

## Wallet and ledger

`CrownWallet` (one row per account, `CHECK balance >= 0`) and the append-only
`CrownLedgerEntry`. Every change goes through `CrownWalletService.apply`:

1. `INSERT … ON CONFLICT DO NOTHING`, then `SELECT … FOR UPDATE` on the wallet.
2. Refuse a repeated `externalRef` (unique), returning the original entry.
3. Refuse a spend that would go below zero, or any spend while the wallet is held.
4. Update balance and version, append the entry with `balanceAfter`.

Kinds: `EARN`, `PAID_GRANT`, `SPEND`, `ADJUSTMENT`, `REVERSAL`. The admin
dashboard lists any wallet whose balance differs from its ledger sum.

## Buying (Slice C)

`POST /api/drop/purchase { offerId, actionId }`. One transaction: lock the
wallet → replay check on `(accountId, actionId)` → resolve the offer at the
server's now → refuse owned content → write the `DropOrder` → debit → grant
unlocks. Any failure rolls everything back. A repeated action id returns the
original order with `replayed: true`. Owned items appear in Collection and the
profile pickers at once and stay after round rollover.

## Earning (Slice D)

Inside the transaction that earned it, with a unique key per window:

| Source | Crowns | Key |
| --- | --- | --- |
| First daily contract turned in, per UTC day | 5 | `earn:daily:<account>:<day>` |
| First weekly contract, per ISO week | 40 | `earn:weekly:<account>:<week>` |
| Check-in milestones at 5, 12 and 20 login days in a round | 50 each | `earn:milestone:<account>:<round>:<n>` |
| Event contracts | 25 each, up to 50 a round | `earn:event:<account>:<round>:<source>` |

All play earnings stop at `roundEarnCap` (500) per round. The balance carries
over; the cap starts again with the next round. Hooks:
`StreetPassCredService.creditQuest` and `RoundRollCallService.checkIn`.

## Crown packs (Slice D)

| Pack | Price | Crowns |
| --- | --- | --- |
| Starter | $3.99 | 500 |
| Street | $7.49 | 1,000 |
| Boss | $19.49 | 2,800 |
| Kingpin | $30.99 | 5,000 |
| Empire | $74.99 | 13,500 |

Draft prices from the roadmap; change them in `CROWN_PACKS`.

`POST /api/drop/crowns/checkout { packId }` creates a pending `CrownPackOrder`,
then a Stripe Checkout session in `payment` mode with inline `price_data` from
the server's pack table and metadata `{ kind: 'crown-pack', accountId, packId,
orderId }`. The existing webhook (`/api/internal/stripe/webhook`) hands Crown
pack events to `CrownPackService.applyStripeEvent` before supporter billing:

| Event | What happens |
| --- | --- |
| `checkout.session.completed` / `async_payment_succeeded`, paid | Credits once if account, pack, amount, currency and mode all match the order; else `unmatched`. |
| `checkout.session.async_payment_failed` / `expired` | Order marked failed or expired. |
| `charge.refunded` (by payment intent) | Full refund with the Crowns still there: `REVERSAL`. Otherwise the wallet is held and the order goes to `refund_review`. Never a negative balance; unrelated items are never touched. |
| `charge.dispute.created` (by payment intent) | Wallet held, order `disputed`. |

A redirect URL never moves a balance. Admins can **Reconcile** a pending
order, which reads the session back from Stripe and applies the same checks.
Crown packs are hidden in the Android app (`?platform=android`) until Google
Play billing is reviewed.

Setup: add `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed` and `checkout.session.expired` to the
Stripe webhook's events, then set `DROP_CROWN_PACKS_ENABLED=true` and turn on
**Crown pack checkout** in Admin → The Drop.

## Street Pass skips (Slice E)

`POST /api/drop/street-pass-skip { tiers, actionId }` runs as a game action
(player lock, replay by action id, refuses an ended round). It debits
`streetPassSkipPrice(tiers)` and raises Cred to exactly the target tier's
threshold. It refuses skipping past the last tier. Rewards are claimed on the
Street Pass as before; a skip never pays Crowns, so there is no mint loop.

## Admin (Slice F)

Admin → Economy → **The Drop** (`/game/admin/drop`). Every write needs a
reason and writes an `AdminAuditLog` entry with before/after.

The catalog table includes an authenticated **Preview** action. It can inspect
Draft, QA, Scheduled, Vaulted or Archived content without making it visible in
the player storefront or creating a purchasable offer. Preview campaigns with
shareable staging links are still a future content-tooling enhancement.

- **Kill switches:** storefront, Crown purchases, Crown earning, Crown pack
  checkout, Street Pass skips. Each is independent; wallets and unlocks are
  never touched. `DROP_ENABLED=false` turns off every player route (404).
- **Tuning:** daily offer count, daily reset hour (UTC), weekly auto-feature,
  per-round earning cap, second-approval threshold.
- **Catalog:** state (Draft → QA → Scheduled → Live → Vaulted/Archived), price
  override, return policy, daily pool. Archiving and **Never returning** need
  an explicit confirmation; Never returning can't be undone and the item can
  never go live again.
- **Offers:** schedule or cancel admin offers.
- **Wallets:** look up by username, see the ledger, grant or remove Crowns
  (at or above the threshold, a second, different admin must approve), clear a
  hold.
- **Dashboard:** totals by kind and source, orders, Crown pack orders by
  status, ledger mismatches.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DROP_ENABLED` | on except in production | Every player Drop route. |
| `DROP_CROWN_PACKS_ENABLED` | `false` | Real-money Crown packs (also needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`). |

The Stripe webhook now runs whenever `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` are set, even without a supporter price.

## Tests

- `packages/rulesets/src/__tests__/drop.test.ts`: catalogue integrity, key
  collisions, bundle and skip pricing, pack value, earning budget, windows.
- `apps/server/src/services/__tests__/drop.service.test.ts`: wallet
  idempotency and holds, purchase replay, bundles, expired offers, Stripe
  credit/refund/dispute handling.
- `apps/web/src/items/dropArt.test.ts`: every look has its own art, fits only
  its items, and saves through the settings schema.
- `apps/server/src/services/__tests__/drop.integration.test.ts`
  (`DROP_INTEGRATION=1`): racing spends, racing grant replays, HTTP double
  tap, signed-out browsing. Creates no rounds.

## Release checklist

### 2.2.18 launch approvals and disclosures

- Release target: **2.2.18**.
- Approved USD web Crown packs: Starter $3.99/500, Street $7.49/1,000, Boss $19.49/2,800, Kingpin $30.99/5,000, Empire $74.99/13,500. The server owns these amounts; clients never submit a price.
- Proposed player-facing disclosure copy (business/legal owner must approve before production): “Crowns are virtual currency for cosmetic items and cosmetic-only Street Pass skips in The Drop. Crowns do not provide competitive advantages, cannot be exchanged for cash, and are not transferable. Purchases are optional. Prices are shown in your store currency at checkout; taxes, local pricing, age limits, and refunds follow the payment platform and applicable law. Cosmetic purchases are permanent unless a platform or support refund process applies. Google Play purchases are processed by Google Play; web purchases are processed by Stripe.”
- Add the Stripe endpoint `POST /api/internal/stripe/webhook` with: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, plus the existing supporter events `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
- Google Play one-time Crown products are configured with `GOOGLE_PLAY_CROWN_PACK_PRODUCT_IDS=starter=...,...` before Android checkout is enabled. The app sends only a product ID and purchase token; the server verifies both with Google before crediting Crowns.
- Hideout and street-sign products are not launch inventory until their renderer/equipper slots and art assets ship. No unsupported SKU may be activated in the catalog.
- Purchase confirmations are queued after the Crown debit/entitlement transaction commits; notification delivery is retryable and cannot roll back a purchase.

- [x] Artwork original to The Drop; keys and styles checked against every other reward.
- [x] Balance and offers server-confirmed; client never sends a price.
- [x] Ledger idempotency and row locking (integration suite).
- [x] Payment credit only from signed events matching the order.
- [ ] Tax, currency, age-rating and store disclosures reviewed for general launch.
- [x] No random items; no exchange to money, chips or cash.
- [x] Owned, vaulted, coming-soon and expired states shown.
- [x] Wallet and unlocks are account-owned, not round-owned.
- [x] Phone, tablet and desktop layouts; Compact density; player accent; reduced motion.
- [x] Independent kill switches.
- [x] Admin changes and wallet adjustments audited.
- [x] Pack prices approved (2026-10-19).
- [ ] Release version assigned.
