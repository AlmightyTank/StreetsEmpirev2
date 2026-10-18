# StreetsEmpire — The Drop
## Crown Currency, Original Cosmetics, Rotating Storefront & Cosmetic Pass

**Status:** Slices A–F built on `beta` behind `DROP_ENABLED`; Crown packs stay off until `DROP_CROWN_PACKS_ENABLED` and Stripe keys are set. See [THE-DROP.md](THE-DROP.md) for how it works.  
**Reference branch:** `AlmightyTank/StreetsEmpirev2` → `beta`  
**Prepared:** October 18, 2026  
**Suggested document path:** `docs/ROADMAP-THE-DROP.md`  
**Release version:** To be assigned; do not silently add to the existing 3.0.0 scope.

---

## 1. Vision

Build **The Drop**, a first-class, Fortnite-inspired cosmetic storefront inside StreetsEmpire. It uses the existing StreetsEmpire shell, current player-selected accent/theme variables, and the same navigation and UI density as Dashboard, Stores, Street Pass, and Collection. Fortnite inspires the merchandising model—featured collections, rotating item cards, clear Crown prices, preview-before-purchase—not a new visual identity or copied assets.

Players can **earn or buy Crowns** and spend them on **entirely new, Drop-origin cosmetic content**. Crowns and purchased cosmetic ownership persist across rounds. All transactions and offers are server-authoritative. The Drop must never sell anything that influences competitive results.

### Locked product decisions

1. **Currency:** Crowns (integer units; no fractional Crowns).
2. **Acquisition:** earn through bounded gameplay rewards **or** buy fixed packages with real money.
3. **Use:** spend on original Drop cosmetics, original Drop bundles, and Street Pass level skips (any tier; product decision 2026-10-18, see Slice E).
4. **Fair play:** absolutely no cash, turns, weapons, product, premium casino chips, odds, faster progression in competitive systems, boosts, tactical intelligence, or pay-to-win advantages.
5. **Account permanence:** wallet balance and cosmetic unlocks belong to the account, not the round.
6. **Existing systems stay special:** Street Pass, login-final rewards, supporter exclusives, event/achievement rewards are not repackaged for sale.
7. **Ownership:** no duplicates sold to the same account; owned singles reduce bundle pricing fairly or offer an explicitly calculated, server-authoritative adjustment.
8. **The Drop ≠ gameplay Stores:** `/game/stores` and its cash-based item shops remain untouched.
9. **No chance-based monetization:** no paid random loot boxes, gambling, cash-out, or Crown conversion to casino chips/cash.
10. **Versioning:** the existing `docs/ROADMAP-3.0.0.md` explicitly defers new currencies; schedule The Drop as a separately approved feature release rather than treating it as already committed to 3.0.0.

### Non-goals at initial launch

- Player-to-player Crown transfer or trading.
- Cashing out or converting Crown balances into real money.
- Purchasing old Street Pass levels that award gameplay resources.
- Reselling limited event, supporter, quest, login, or achievement cosmetics.
- Auto-renewing Crown subscriptions, randomized pack contents, or external marketplaces.

---

## 2. Pricing & economic design

### 2.1 Proposed Crown packs (USD, draft)

**Reference value:** approximately **100 Crowns per US dollar** for the smallest pack, with progressively higher value on larger packs. The numbers below are proposed product pricing; they are **not verified provider prices and are not activated until approved**.

| Pack | Price (USD) | Crowns credited | Approx. Crowns / USD | Positioning |
|:---|---:|---:|---:|:---|
| Starter | $4.99 | 500 | 100.2 | entry purchase |
| Street | $8.99 | 1,000 | 111.2 | standard |
| Boss | $22.99 | 2,800 | 121.8 | featured |
| Kingpin | $36.99 | 5,000 | 135.2 | collector |
| Empire | $89.99 | 13,500 | 150.0 | highest value |

Display **both the currency quantity and actual USD cost** clearly at checkout. Do not claim a discount or bonus value unless the comparison is mathematically honest. Regional storefront pricing, taxation, and platform-specific product IDs require separate approval; the actual billing-provider charge, not client UI state, is authoritative.

### 2.2 Proposed initial cosmetic pricing

| Category | Crowns | Notes |
|:---|---:|:---|
| Badge / simple nameplate | 150–300 | Accessible to Crown earners |
| Profile frame / avatar accent | 300–500 | Preview on own avatar |
| Street sign / hideout decoration | 350–650 | Account-owned scene variant |
| Vehicle look | 500–900 | Fits existing sedan/van/low-rider art pipeline |
| Crew outfit | 500–900 | Cosmetics only, no stats |
| Weapon look | 400–800 | Visual skin, no weapon access granted |
| Animated profile / special FX | 700–1,200 | Reduced-motion alternative required |
| Full game-shell theme | 1,000–1,500 | Respects theme, layout, and contrast constraints |
| Curated cosmetic bundle | 1,800–2,800 | Real, visible savings versus buying its singles |
| Optional cosmetic-only pass level skip | 150 | No gameplay resources or Crowns from skipping |
| Optional pack of 10 cosmetic-only skips | 1,200 | Discount versus 10 individual skips |

Pricing is content-dependent, not a guarantee every rarity uses the same value. Avoid pricing tricks, fake strikethrough amounts, or randomized rewards.

### 2.3 Earnable Crowns: baseline for a standard 28-day round

Target **about 400–600 earnable Crowns per active player per typical 28-day round** with reasonable participation, without requiring perfect daily attendance.

| Earning source | Illustrative payout | 28-day max |
|:---|---:|---:|
| One eligible daily Crown contract | 5 once/day | 140 |
| One eligible weekly Crown contract | 40 once/week | 160 |
| Three round milestones | 50 each | 150 |
| Featured community/season event | up to 50 total | 50 |
| **Illustrative maximum** | | **500** |

Use a **server-side per-round earning budget** and unique grant keys. An account's unused Crowns persist, even when the earning cap refreshes with a new round. Earning methods must not be exploitable by repeatable actions, replays, duplicate event processing, alts, or retry storms. Do not require an account to buy anything to claim earned Crowns. For longer/shorter rounds, adjust caps and contract cadence via configuration.

### 2.4 Wallet principles

- Purchased and earned Crowns become **one spendable balance**. Keep source metadata in the ledger for accounting, refunds, and audits.
- Wallet total is server-controlled, integer-only, transactional, and nonnegative under ordinary purchases.
- Purchases must deduct Crowns **atomically with entitlement grants**; either both happen or neither does.
- Display `balance`, `earned this round`, `remaining earnable`, `history`, and a link to the Crown pack page.
- Never trade Crowns for game cash, chips, sportsbook balances, real-world money, or virtual items with competitive utility.

---

## 3. Art direction and exclusivity policy

### 3.1 Native StreetsEmpire interface

Current house UI: black/crimson/chrome, compact high-information panels, existing `GameLayout`/`Shell`, page hero, section heading rhythm, restrained borders, 4px spacing scale, player theme variables (`--se-accent`, `--se-accent-rgb`, and other `--se-*` tokens). Keep the game's current responsive sidebar and mobile tab/directory navigation.

- Main route: **`/game/drop`** in **Progress & Rewards** beside Street Pass and Collection.
- Subroutes: `/game/drop/item/:slug`, `/game/drop/wallet`, `/game/drop/crowns`, and optional `/game/drop/pass`.
- Shop content: compact header with wallet → category chips → featured collection → daily offers → original bundles → vaulted/catalog info.
- Pricing tiles: artwork, rarity, original name, Crown icon/amount, OWNED state, clear details and accessibility text.
- Item preview: full resolution art on top of a restrained panel, wardrobe/vehicle/scene context, rotate where meaningful, player-owned preview where available.
- Mobile: usable 360px viewport, one-column cards where necessary, no horizontally clipped actions, stable scrolling; switching item/category must not jump to page top or break existing swipe-navigation gestures.
- User-selected Compact mode, reduced-motion, keyboard, screen reader, contrast, and themed accents must work.
- Never allow decorative effects or rarity labels to overpower item names, prices, or purchase confirmations.

### 3.2 The Drop's new-at-source rule

An item may enter the Drop catalog only if its art/identity is newly authored **for The Drop** and has an origin classification such as `drop`. No previously unlocked set is relabeled and sold. Previous high-value rewards retain their original entitlement source.

Proposed sale-status badges: **Drop Exclusive**, **Daily**, **Featured**, **Returning**, **Vaulted**, and **Permanent Catalog**. A **Never Returning** claim must be backed by a deliberate, irreversible release policy and avoid surprise returns; default to honest **May Return** language.

### 3.3 Three launch collections (all original)

These are creative briefs, **not copies of existing Street Pass/supporter cosmetics**. Art review must compare against currently available silhouettes, motifs, frames, vehicle art, and unlock keys.

| Collection | Visual identity | Initial product slots |
|:---|:---|:---|
| **Kingpin Luxe** | tailored high-end street luxury, black lacquer, restrained warm-metal trim, bespoke geometry distinct from Cartel Gold | sedan look, two crew outfits, profile card, hideout centerpiece, shell accent, bundle |
| **Neon Underworld** | moody city nightlife, neon reflections, steel/violet/teal lighting, custom edge patterns | low-rider look, crew outfit, weapon finish, nameplate effect, street sign, profile frame, bundle |
| **Winter Heist** | urban winter operation, frosted windows, layered outerwear, icy road texture, city dusk | van look, winter crew set, snow-lit hideout décor, winter avatar frame, animated-but-optional snow effect, bundle |

Minimum launch quality bar: **three collections; at least 18 individually authored cosmetic SKUs across them; three coherent bundles; previews and ownership states for every SKU**. A collection may expand beyond that after the underlying render slots are verified.

### 3.4 Ownership integration

- Reuse `AccountCosmeticUnlock` where possible for permanent cosmetics, with unique stable `drop-*` keys and origin metadata.
- Render correctly in Collection, Profile, avatar frame picker, theme selector, crew customization, garage and hideout where applicable.
- If an art slot does not yet exist, ship the necessary renderer/equipper support before selling the item.
- Purchasing a visual for a weapon/vehicle **never unlocks the functional weapon/vehicle**.
- Provide fallback thumbnail and visible unsupported-slot explanation when an item can only be equipped after the player owns a matching base item; never hide this on the detail page.

---

## 4. Roadmap: implementation slices A–F

### Slice A — Crown Wallet, Data Foundation & Native Page Shell

**Goal:** Create the safe, persistent foundation and the first native-looking The Drop page with **read-only preview/test catalog**; no live payments.

**Build**

1. Account-level integer `CrownWallet` balance and version; append-only `CrownLedger` for earn, paid grant, spend, return, refund adjustment, and admin adjustment.
2. Unique idempotency keys per source event and purchase action; database transaction isolation/row locks to prevent lost updates and double-spend.
3. `DropCatalogItem`, `DropOffer`, `DropBundle`, and purchase/order audit models; prohibit collisions with existing cosmetic unlock keys.
4. Shared DTOs and API: `GET /api/drop`, `GET /api/drop/wallet`, `GET /api/drop/items/:slug`; unauthenticated/private data separation.
5. `DropPage` + `drop.css`, `GameLayout` route, page identity + sidebar/mobile navigation under **Progress & Rewards**. Use `theme.css` aliases, `Panel`, `Button`, `ItemTile`, and shared assets/components.
6. Admin/test-only Crown grants and seed inventory behind a beta feature flag; require logged actor and reason.

**Acceptance tests**

- Two simultaneous spends against one balance cannot both succeed when insufficient.
- Repeated request IDs or grant events cannot double-credit or double-charge.
- Wallet and owned cosmetic records never reference round state for lifetime.
- Page behaves at phone/tablet/desktop breakpoints, normal and Compact density, all selected accents, keyboard focus, and after route changes.
- Feature disabled = no exposed Crown purchase button or incomplete APIs on production.

**Deliverable:** functional wallet ledger, new nav/page shell, basic staged product catalog.

### Slice B — Featured Storefront, Scheduling, Listings & Previews

**Goal:** Implement the polished Fortnite-like browse experience inside the existing StreetsEmpire layout.

**Build**

1. Hero carousel/featured collection layout using existing page hero proportions rather than a full-screen splash.
2. Daily offers reset on a configurable **UTC** schedule; featured/weekly rotations use separate schedule; always show users exact local end times and server-sourced countdowns.
3. Category filters: **Featured**, **Vehicles**, **Crew**, **Profiles**, **Shells & Hideouts**, **Bundles**. Avoid nested navigation sprawl; compact responsive chips.
4. Detail panel supports multiple art views and context previews (car, crew, game shell, avatar, hideout).
5. Catalog states: coming soon, available, owned, scheduled, sold out/expired, vaulted, not applicable.
6. Visible item provenance/exclusivity label, return policy, base-item requirements, and clear Crown price.
7. Cache/bust active rotation data correctly and prevent stale or client-clock-based price claims.

**Acceptance tests**

- Clock boundary switches active offers exactly once; items cannot be bought after server expiry.
- Swiping shop categories does not interfere with page scrolling/mobile navigation sheet.
- Selecting a product preserves scroll context, and returning from an item preview preserves reasonable list position.
- Accessible text/labels, fallback media, and reduced-motion are present.

**Deliverable:** complete browsing/preview UI driven by server catalog, still in beta test mode.

### Slice C — Original Drop-Only Cosmetics & Permanent Fulfillment

**Goal:** Create and integrate brand-new cosmetic artwork; make safe Crown-only purchase fulfillment operable in beta with seeded balances.

**Build**

1. Create unique art briefs, source assets, optimized WebP thumbnails, detail previews, and visual QA for the three launch collections.
2. Integrate equipped looks with existing Collection/vehicle/crew/hideout/profile/shell rendering systems as appropriate.
3. Server-authoritative `POST /api/drop/purchase` using offer ID + action ID; server resolves current price, account balance, offer availability, already-owned content and bundle eligibility.
4. Single database transaction: lock wallet → validate offer → deduct Crowns → grant permanent entitlements → write ledger/purchase receipt. Outbound notifications run after commit.
5. Insufficient funds, already owned, expired offers, missing required base item (if applicable), and duplicate requests produce clear outcomes.
6. Display item in **Collection** immediately; allow equip/unequip and verify appearance in player profile, crew, garage, and shell without losing ownership on round rollover.
7. Asset provenance and uniqueness checklist prevents accidental reuse of Street Pass, login, supporter, or event exclusives.

**Acceptance tests**

- Purchase is exactly once even with retries or double-taps; a failure rolls back both debit and unlock.
- Item stays owned after a new round, logout, reconnection, and account session refresh.
- No game economy or gameplay stat is changed by equip/unequip.
- Shop refuses a second paid purchase of an owned SKU; thumbnails and real equip views match.

**Deliverable:** The Drop has newly authored, equip-ready cosmetic SKUs and safe test purchase flow.

### Slice D — Earnable Crowns & Real-Money Crown Packs

**Goal:** Launch the two Crown acquisition paths only after the ledger/fulfillment layer is solid.

**Build: earn path**

1. One daily Crown contract, one weekly contract, round milestones, and bounded community-event rewards; tuned initially for about **500/28 days**.
2. Server-side completion proof; individual reward keys; per-round cap; anti-abuse safeguards against duplicate events, idempotency replay, repeated quest turn-ins and account-farming patterns.
3. Wallet UI: balance, earned this round, remaining Crown opportunities, next activities, and history.
4. Earned Crowns remain after round reset, while caps/achievement eligibility reset according to explicit rules.

**Build: buy path**

5. Fixed packs per the draft pricing table, shown in real-world currency; payment is optional and separate from earning.
6. Integrate existing Stripe billing foundations for eligible web purchases, **as one-time orders rather than supporter subscriptions**. Review Google Play Billing integration and current platform rules for Android before enabling packs there.
7. Credit only after verified, provider-confirmed payment/receipt; unique provider event, account match and purchase state. Handle retries, duplicate webhooks, abandoned checkouts, payment failure and account deletion safely.
8. Receipt/history, refund/chargeback audit, reconciliation tasks and customer support path. Reverse unspent paid grants when appropriate; if spent, flag/hold the wallet and route to manual dispute resolution rather than silently causing negative balances or stripping unrelated earned cosmetics.
9. No account balance changes from a checkout redirect/URL alone. No unauthorized client-adjustable pack amount/price.

**Acceptance tests**

- No Crown credit from forged webhook, unverified receipt, failed checkout, repeated event, or wrong account.
- Play and web product deliveries are idempotent and reconcile by provider order.
- Earn-only players can buy at least an entry-level cosmetic over time; buying players get no competitive advantage.
- Minors/platform store disclosures, taxes, purchase confirmation and refund policy are reviewed before general launch.

**Deliverable:** trustworthy earn/buy economy, wallet history, payment operations, and reconciliation.

### Slice E — Bundles, Vaults, Collection Management & Cosmetic-Only Pass

**Goal:** Add merchandising depth without changing the existing gameplay Street Pass.

**Build**

1. Bundles grouping original Drop SKUs. Calculate genuine savings; adjust owned contents by a documented server-side rule; never charge full Crown price for items already owned without clear consent/value.
2. Vaulting and return rules. Explicit `returnable` / `never_returning` metadata with an approval gate for permanent exclusivity claims. Item remains equipped/owned if an offer disappears.
3. Filter by owned/unowned/category/rarity/collection; gifting/trading deferred.
4. Add optional **Drop Pass**, a **separate cosmetic-only** account-owned progression track with its own clear season dates and rewards. Its progress may come from play activity; its levels contain **cosmetics only** and are not tied to gameplay outputs.
5. Crown purchase of cosmetic-pass level skips: **150 per tier / 1,200 for 10**, configurable. Never grant Crowns as skip rewards, to avoid mint/spend loops. Reject attempts to skip past max or unlock non-cosmetic gameplay rewards.
6. ~~Do not add purchased skips to the existing free Street Pass.~~ **Changed 2026-10-18 (product decision):** Crown level skips apply to **any tier of the existing Street Pass**. A skip only raises Cred to the next tier's threshold; the player still claims each tier, skips never pay Crowns, and nothing past the last tier can be bought. The separate Drop Pass track is not built; the Street Pass is the skip target.
7. Seasonal art collection archive and item history; returnable collections can re-enter rotations without breaking ownership.

**Acceptance tests**

- Bundle discounts are correct with partial ownership; entitlements never duplicate.
- Vaulting affects availability, not existing ownership/equipping.
- ~~Cosmetic level skips never advance or reward anything from the gameplay Street Pass.~~ Superseded: skips advance the Street Pass by Cred only; claiming is unchanged and no skip mints Crowns.
- No passage of time, rotation edge, or refund grants a second copy, extra Crowns, or cash utility.

**Deliverable:** complete rotating merch ecosystem plus optional cosmetic-only level-skip experience behind a separate feature flag.

### Slice F — Admin Content Tools, Quality Gates & Release

**Goal:** Ship to beta safely, give operators everything needed to maintain the catalog, and launch with proven fairness.

**Build**

1. Admin → **The Drop**: edit draft catalog, art links, category, rarity, price, active schedules, bundles, return status, homepage slots, and preview campaigns.
2. Content publishing workflow: Draft → QA → Scheduled → Live → Vaulted/Archived; confirmation for irreversible flags; audit user, before/after, reason and timestamp.
3. Wallet admin actions with dual safeguards: role restriction, reason, immutable audit, optional second approval for large Crown grants/removals; no direct SQL edits as normal operations.
4. Operational dashboard: Crown grants by source, purchase success/errors, chargebacks, outstanding paid delivery, unexpected wallet movement, offer impressions and item ownership without exposing private payment details.
5. QA automation: API integration tests, economy concurrency, webhook replay, purchases, timezone rollover, account/round resets, art loading, accessibility, mobile navigation and scroll persistence.
6. Staging acceptance with sandbox providers, account purchase receipts and reconciliation; regression checks for existing Stores, Street Pass, Collection, Supporter, casino, mobile shell, and theming.
7. Controlled beta rollout: catalog preview → earned Crowns + test purchases → sandbox payments → limited live checkout after policy/business approval → broader release.
8. Check CI, PR review feedback, billing policies, data migrations, rollback strategy and version/patch notes before merging to `beta`.

**Acceptance tests**

- Every published cosmetic is original to The Drop, displayed correctly, and has its supported equip path.
- A balance or ownership audit can reconcile ledger, order records and entitlements without manual guessing.
- No benefit in gameplay or casino changes when Crowns are granted, spent, refunded or removed.
- Storefront and Crown purchases can each be independently disabled via kill switches, with wallets/entitlements preserved.
- No mobile scroll/pull-to-refresh regression and no navigation tab conflict.

**Deliverable:** beta-ready The Drop, support/admin tooling and a repeatable release checklist.

---

## 5. Dependencies and implementation sequence

| Slice | Depends on | Merge/readiness gate |
|:---|:---|:---|
| A | Existing `GameLayout`, account/auth, Prisma, theme tokens | wallet concurrency tests green |
| B | A catalog and route shell | reliable offers/preview UX |
| C | A wallet; B item model | 18 unique cosmetics, idempotent test purchase |
| D | A ledger; C entitlements; payment credentials/policies | zero false credits in sandbox; earning caps verified |
| E | B/C/D store + ownership | bundles and cosmetic skips never touch Street Pass gameplay rewards |
| F | A–E | complete QA, admin, rollout and rollback readiness |

**Recommended engineering tactic:** ship one focused PR per slice against the latest `beta`, rebase before final integration, run existing test/build checks, resolve review comments, then deploy beta. Do not assume an older cached branch head is current.

## 6. Suggested backend/data contracts (planning names)

- `CrownWallet`: accountId, balance, version, updatedAt.
- `CrownLedger`: immutable entryId, accountId, signedDelta, balanceAfter, kind (`EARN`, `PAID_GRANT`, `SPEND`, `ADJUSTMENT`, `REVERSAL`), externalRef unique, reason/metadata, createdAt.
- `DropItem`: key, name, category, rarity, source=`DROP`, unlockKind, asset keys, flags, published state.
- `DropOffer`: offerId, item/bundle reference, Crown price, startAt, endAt, rotationGroup, returnPolicy, state.
- `DropOrder`: id, accountId, actionId unique, offerId, Crown price snapshot, purchasedAt, status, entitlement links.
- `CrownPackOrder`: id, provider/platform, providerPaymentId unique, packId, real currency/amount snapshot, creditedCrowns, status, provider event references.
- `CrownEarnAward`: accountId, activityEventKey unique, roundId, awardedCrowns, capBucket.
- `DropPassSeason`, `DropPassTierProgress`, `DropPassSkipOrder` (Slice E only).

Keep actual names consistent with your existing ORM and account ownership model; prefer reusing safe services/types and source-aware `AccountCosmeticUnlock` rather than inventing a parallel equipment inventory.

## 7. Functional user journeys

### Free-to-play buyer

1. Opens The Drop and sees balance plus a reachable first purchase target.
2. Completes a weekly Crown contract; sees the server-confirmed balance update.
3. Saves enough for an original badge or vehicle cosmetic over time.
4. Purchases with earned Crowns; immediately owns/equips it in Collection.
5. Starts a new round with the same balance and cosmetic inventory.

### Paid Crown buyer

1. Opens Crown packs, sees actual USD prices and Crowns credited.
2. Chooses pack → trusted checkout → payment confirmation.
3. Once payment is verified, wallet ledger and balance update exactly once.
4. Buys a featured original cosmetic; receives permanent entitlement and a clear receipt.
5. If payment is disputed, support can follow a reliable audit trail without corrupting unrelated purchases.

### Cosmetic-only pass buyer

1. Sees **Drop Pass — cosmetics only**, separate from free Street Pass.
2. Earns cosmetic progression by playing or purchases clearly-priced cosmetic-tier skips.
3. Claims new Drop Pass visual rewards only; no cash, turns, guns, or gameplay rewards are affected.

## 8. Release and anti-abuse checklist

- [ ] Exclusive artwork copyright/source/uniqueness approved; images actually exist.
- [ ] Crown balance and offers confirmed by server, not mutable client state.
- [ ] Ledger idempotency and database atomicity tested under concurrent calls.
- [ ] Payment confirmation is verified using trusted provider credentials/signatures/receipts.
- [ ] Correct provider tax/currency/age/store compliance and refund disclosures reviewed.
- [ ] No paid chance-based items; no monetary or casino exchange route.
- [ ] No existing Street Pass, login, supporter, event or achievement cosmetics are sellable.
- [ ] No competitive stat changes from any Drop entitlement.
- [ ] Owned, vaulted and offline states are clear and correct.
- [ ] Wallet balance and cosmetics survive round rollover.
- [ ] Accessible at 360px, 768px, and desktop; user-selected theme and Compact mode work.
- [ ] All navigation deep links and scroll transitions are stable on phone and desktop.
- [ ] Independent kill switches for storefront browsing, Crown earn, Crown purchase and checkout.
- [ ] Admin changes and wallet adjustments leave immutable audit entries.
- [ ] Build/CI green, beta tests complete, PR reviews resolved, patch notes written.

---

## 9. Existing beta implementation references

These are implementation touchpoints verified against `beta` during roadmap preparation, not claims that The Drop is already implemented:

- [Game navigation](https://github.com/AlmightyTank/StreetsEmpirev2/blob/beta/apps/web/src/layouts/gameNav.ts)
- [Theme tokens](https://github.com/AlmightyTank/StreetsEmpirev2/blob/beta/apps/web/src/styles/theme.css)
- [Stores styles](https://github.com/AlmightyTank/StreetsEmpirev2/blob/beta/apps/web/src/styles/stores.css)
- [Collection page](https://github.com/AlmightyTank/StreetsEmpirev2/blob/beta/apps/web/src/pages/CollectionPage.tsx)
- [Street Pass contract](https://github.com/AlmightyTank/StreetsEmpirev2/blob/beta/docs/STREET-PASS.md)
- [Supporter cosmetics and Stripe payments](https://github.com/AlmightyTank/StreetsEmpirev2/blob/beta/docs/SUPPORTER-COSMETICS.md)
- [Supporter billing and Google Play integration touchpoints](https://github.com/AlmightyTank/StreetsEmpirev2/blob/beta/apps/server/src/services/supporter-billing.service.ts)
- [Existing 3.0.0 roadmap](https://github.com/AlmightyTank/StreetsEmpirev2/blob/beta/docs/ROADMAP-3.0.0.md)

**Project decision required before implementation:** Pick the release target/version and approve the draft Crown pricing. The rest of the design can proceed on `beta` behind flags. This file is a roadmap only; it does not make GitHub changes or enable payments.
