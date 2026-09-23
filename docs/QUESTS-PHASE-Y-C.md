# Quest Phase Y-C — Quest-Only Cosmetics

Phase Y-C adds permanent prestige rewards that can only be earned by completing
specific one-time Jobs.

## Principle

Quest cosmetics are account-owned. They survive round resets and never affect
gameplay math. A completed qualifying Job writes a permanent
`AccountCosmeticUnlock` row in the same transaction as the quest claim.

The first cosmetic presentation is `TITLE_BADGE`, which plugs into the profile
system StreetsEmpire already has:

- the unlock is selectable as a public profile title;
- the same unlock can be featured as a permanent profile badge;
- it remains available between rounds and on forum badge lookups.

The catalog already reserves future kinds for profile frames, cosmetic accents
and hideout decor, but Phase Y-C does not grant those yet.

## Initial quest cosmetics

| Job | Contact | Cosmetic | Rarity |
| --- | --- | --- | --- |
| The Quiet Hour | Mama King | Ghost of the Block | Legendary |
| Top Shelf | Pip | Top Shelf Operator | Legendary |
| Full Rack | Tommy | Full Rack Enforcer | Legendary |
| Home Safe | Wheels | Road King | Epic |
| Clean Slate | Vic | No Paper Trail | Epic |
| Out-of-Town Box | Blocks | Corner Boss | Legendary |

All six source Jobs are `ONCE`. The quest catalog validator rejects permanent
cosmetic rewards on Daily, Weekly or Repeatable Jobs, so city/alliance/event
content cannot accidentally make them farmable.

## Persistence

`AccountCosmeticUnlock` stores a snapshot of:

- cosmetic key and kind;
- title and description;
- rarity;
- source quest;
- source ruleset id/version;
- awarded timestamp.

Snapshotting the display metadata means an earned title remains stable even if a
future ruleset changes or retires the source cosmetic.

The unique `(accountId, key)` constraint makes repeated/idempotent award calls
safe.

## Profile integration

Quest `TITLE_BADGE` unlocks are exposed as permanent `quest` awards to reuse
the current profile system. They appear in:

- account settings title picker;
- account settings featured badge picker;
- public player profiles;
- permanent/forum badge lookup.

They are cosmetic only and never modify player resources or competitive state.

## Compatibility

- New ruleset: `classic-og-v0.7-x` / `0.7.0-X`
- 0.7-W and older pinned rounds keep their previous quest rewards.
- One Prisma migration creates the permanent account cosmetic ownership table.
