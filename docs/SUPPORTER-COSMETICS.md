# Supporter cosmetics

Supporter rewards are cosmetic only. They never change stats, prices, cargo,
seats, speed, ranking, visibility or combat (see "Never sell" in
`ROADMAP-FUTURE.md`, section 1.9). Once granted they are permanent: there is
no revoke, and a player keeps them after they stop supporting.

## What a supporter gets

Both come from `SUPPORTER_COSMETICS` in `packages/rulesets/src/supporter.ts`.

| Unlock key | Kind | Style key | What it is |
| --- | --- | --- | --- |
| `supporter-midnight-chrome` | `ITEM_COLLECTION` | `midnight-chrome` | Midnight Chrome looks for the Thug, Hoe, Sedan, Van and Low-Rider |
| `midnight-chrome-frame` | `PROFILE_FRAME` | `midnight-chrome-frame` | The Signature Profile Card |

## Granting

`SupporterService.grant(db, accountId)` writes the missing `AccountCosmeticUnlock`
rows with `sourceQuestKey = 'supporter'` and returns the keys it added. Granting
twice adds nothing. A paid Stripe checkout or invoice grants it automatically
(see "Payments" below), and an admin can also grant it from the account page
("Grant supporter rewards", `POST /admin/accounts/:id/supporter`) or from
Admin → Supporters. Every grant is audited as `account.grant-supporter`; Stripe
grants show the actor "Stripe".

## Payments (Stripe)

Players support from Account → Supporting, which opens Stripe Checkout for a
recurring subscription (`POST /api/supporter/checkout`). The checkout session
and the subscription both carry the account id (`client_reference_id` and
`metadata.accountId`), so every payment matches its account. Stripe's billing
portal (`POST /api/supporter/portal`) handles card changes, receipts and
cancelling.

Stripe calls `POST /api/internal/stripe/webhook`. The route checks the
`Stripe-Signature` header against the raw body, then
`SupporterBillingService.handleEvent` applies the event once: its id is stored
in `StripeWebhookEvent` in the same transaction as its changes, so a failure
rolls back and Stripe's retry applies it cleanly.

| Event | What happens |
| --- | --- |
| `checkout.session.completed` (paid) | Membership saved as active; rewards granted at once |
| `invoice.paid` (amount above 0) | Payment recorded; membership active; any missing rewards granted |
| `customer.subscription.created`, `.updated`, `.deleted` | Status, renewal date and "cancels at period end" kept current |
| `charge.refunded` (full) | The newest payment from that customer is marked refunded |
| `charge.dispute.created` | The newest payment from that customer is marked disputed |

Refunds, disputes, cancellation and failed payments never take rewards back. A
free trial or 100% coupon invoice records and grants nothing. Events for
customers we cannot match are acknowledged and logged as a warning. Deleting an
account (by the player or an admin) cancels its subscription right after the
deletion commits; if Stripe cannot be reached, the error is logged so an admin
can cancel it in the Stripe dashboard.

`SupporterMembership` holds the current status (active and trialing count as
supporting now; past_due and unpaid show as "payment failing"). `SupporterPayment`
keeps each paid invoice, and keeps it, unlinked, if the account is deleted.

### Setup

1. In Stripe, create a product with a recurring price. Copy the price id.
2. Add a webhook endpoint at `https://<site>/api/internal/stripe/webhook` for
   the events in the table above. Copy its signing secret.
3. Turn on the customer portal in Stripe's billing settings.
4. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
   `STRIPE_SUPPORTER_PRICE_ID`, then restart the API. Supporting stays off
   until all three are set, and it is always off in tests.

Use test-mode keys on dev and beta. For local testing, `stripe listen
--forward-to localhost:3001/api/internal/stripe/webhook` prints a signing
secret to use as `STRIPE_WEBHOOK_SECRET`.

## Admin → Supporters

`/game/admin/supporters` (`AdminSupportersPage`, `AdminSupporterService`) lists
every account holding a supporter reward, with when it started, its last login,
which rewards it has and whether it wears the card.

- **Grant** (`POST /admin/supporters/grant`) takes up to 100 pasted usernames.
  A preview (`dryRun`) sorts them into new, missing rewards, already done, not
  found, self and listed twice. The commit grants the first two, one audited
  account action each, and keeps any failure on its own row.
- **Backfill** (`POST /admin/supporters/backfill`) gives every supporter the
  catalogue rewards they lack. Run it after adding a reward to
  `SUPPORTER_COSMETICS`; existing supporters do not get a new reward otherwise.
- **Recent grants** shows the last ten `account.grant-supporter` audit entries.
  The audit log's action filter also has "Supporter grants".

The roster shows each supporter's Stripe subscription (Active, Ends <date>,
Payment failing, Ended, or Manual for an admin grant with no subscription), and a
Payments panel lists the newest paid, refunded and disputed invoices. A notice
says when Stripe checkout is not configured.

## Midnight Chrome collection

Midnight Chrome is the first collection that covers only some items.
`COLLECTION_COVERAGE` in `packages/shared/src/cosmetics.ts` names the keys it
has art for. `collectionCovers(style, key)` is checked in four places:

- the locker pickers, which only offer covered collections
- the settings schema, which refuses an uncovered pair
- the public loadouts, which read a stale uncovered value as Classic
- the art tests, which expect a file only where coverage says so

Locked, it shows the hint "Supporter reward." instead of a Street Pass tier.

Art follows the existing cosmetic pipeline: SVG masters in
`apps/web/art/cosmetics/{crew,rides}/*-midnight-chrome.svg`, rendered by
`scripts/art/render-cosmetic-art.mjs` to lossless WebP in
`apps/web/public/items/cosmetics/`. Ride masters draw the Classic geometry inset
to 94% about the canvas centre, which keeps at least 40px of clear space on the
1024×512 render.

## Signature Profile Card

The card turns on while `midnight-chrome-frame` is the avatar frame. Popup
frames are retired, so the avatar frame carries the whole card: equipping it
restyles the existing profile header, hover card and settings preview and adds
the chrome ring. It is not a separate component.

- **Plate:** `midnight-chrome-plate.webp`, a 9-slice border image (slice 96,
  drawn at 24px). It is painted on the element's border box, so it fits any
  size and stays put while the hover card scrolls.
- **Surface:** `profileSurface` (Brushed, Carbon or Engine-turned) picks a
  seamless 512px tile. It is public only while the card is equipped.
- **Nameplate:** the honorific in chrome small caps, the supporter mark
  (`midnight-chrome-mark.svg`), and a chrome rule with a crimson tick. The mark
  shows only with the card.
- **Avatar ring:** `midnight-chrome-avatar.webp`, drawn with the card. Its inner edge sits on the avatar at every size (68px hover,
  88px and 64px header, 76px settings preview).
- **Effect:** `midnight-chrome` ("Chrome Glint"), offered once the frame is
  owned. One glint crosses the ring every 9s. It is masked to the ring art and
  off under reduced motion.

Profile-frame masters live in `apps/web/art/profile-frames/` and render to
`apps/web/public/profile-frames/` with the same script
(`node scripts/art/render-cosmetic-art.mjs profile-frames`).
