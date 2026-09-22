# Quest System — Phases C through G

This slice turns the Phase A/B foundation into the first playable quest release.

## Replacement, not a second system

The handcrafted quest/contact system is now the player-facing job system.

Retired runtime paths:

- `GET /api/game/reputation`
- `POST /api/game/reputation/quest`
- `POST /api/game/stores/unlock`
- store-counter favor cards
- favor-only purchase/supply counters in Store trades
- passive-reputation weapon unlock buttons

Historical ruleset data, old helper code and old RoundPlayer columns are intentionally left in place for database/ruleset compatibility. They no longer drive the current beta quest flow.

Existing weapon access flags remain honored. A player who already earned access before the migration does not lose it.

## C — Quest API/runtime

Current endpoints:

- `GET /api/game/quests`
- `POST /api/game/quests/:key/accept`
- `POST /api/game/quests/:key/abandon`
- `POST /api/game/quests/:key/track`
- `POST /api/game/quests/:key/claim`

The runtime synchronizes the active ruleset's `questDefinitions` into version-pinned `QuestDefinition` rows.

It materializes one `PlayerQuest` row per player/definition and evaluates:

- completed-quest prerequisites
- contact reputation prerequisites
- active quest limit: 8
- tracked quest limit: 3
- expiration
- required objective completion
- bonus objective completion

Claiming uses the normal `ActionService` transaction/idempotency pipeline.

## Rewards

Implemented reward kinds:

- `CASH`
- `TURNS`
- `ITEM`
- `CONTACT_REP`
- `WEAPON_ACCESS`

Current item reward fields are the existing core inventory fields:

- condoms
- medicine
- crack
- beer
- pistols
- shotguns
- tek9s
- ak47s
- lowRiders

Weapon access currently supports:

- SHOTGUN
- TEK9
- AK47

These set the existing permanent-for-the-round access flags. The player still buys the weapon normally from Tommy.

## D — Quest page

`/game/quests` now shows:

- Available / Active / Completed tabs
- active and tracked limits
- objective progress
- bonus objectives
- reward previews
- contact names
- accept
- claim
- track/untrack
- abandon
- expiration when present

Locked jobs are visible so the chain has shape before it opens.

## E — Tracking and notifications

Up to three active jobs may be tracked.

Tracked jobs appear in a compact strip across game pages.

New activity types:

- `QUEST_READY`
- `QUEST_CLAIMED`

When all required objectives finish, the player receives a feed entry telling them to return to Quests and collect payment.

## F — Contacts

Initial contacts:

- Mama King — Street Operations
- Pip — Products & Distribution
- Tommy — Weapons & Muscle
- Wheels — Transportation
- Vic — The Fixer
- Blocks — Turf Broker

`/game/reputation` is now a client page for these underworld contacts and reads the new quest API. It no longer uses the retired trader-favor endpoint.

Contact standing tiers:

- Unknown — 0
- Acquaintance — 25
- Regular — 75
- Trusted — 150
- Partner — 300
- Inner Circle — 500

The existing `PlayerReputation` table stores contact reputation for compatibility. Pip and Tommy therefore retain continuity with their existing relationship rows.

## G — First ten handcrafted story jobs

1. First Night Out — Mama King
2. Fresh Faces — Mama King
3. Keeping Them Happy — Mama King
4. Cookhouse — Pip
5. Payday — Mama King
6. Heavy Hands — Tommy
7. Eyes Open — Tommy
8. Collection Day — Tommy
9. Pack Your Bags — Wheels
10. Plant the Flag — Blocks

The chain moves through the current game rather than creating quest-only actions:

- Scout
- crew ownership
- supplies
- Produce
- street income
- armed thugs
- Recon
- Raid
- Travel runs
- Turf claims

Weapon progression moves into the story chain:

- Heavy Hands -> Shotgun access
- Collection Day -> Tek-9 access
- Plant the Flag -> AK-47 access

## Compatibility boundary

The old favor rules and helper functions remain in historical rulesets/source so old round definitions and migrations do not need to be rewritten.

For the current beta ruleset, they are inert:

- stores do not expose favor cards
- the old favor completion API is gone
- the manual reputation weapon unlock API is gone
- old favor counters do not determine current quest progress

Future cleanup can physically remove those compatibility fields after historical-round support no longer needs them.
