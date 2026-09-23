# Quest Roadmap — Phase X: Admin & Content Tools

Phase X gives support/admin staff server-authoritative controls for the quest and favor systems without creating a second reward path.

## Shipped

### Quest content controls
- Admin Quest Content page scoped to a round's pinned ruleset version.
- Enable/disable any persisted quest definition.
- Quest definition switches survive normal definition synchronization.
- Disabled quests disappear from player quest pages and direct accept/claim requests are rejected.
- Existing player quest state is preserved while disabled so a temporary kill switch is reversible.
- Daily and weekly rotation selection is recalculated from enabled definitions, preventing disabled entries from leaving empty board slots.
- Current daily/weekly rotation and reset time are visible in admin.

### Favor kill switches
- Per-ruleset favor enable/disable state is persisted in the database.
- New timed favor activations and single-use arms are blocked while disabled.
- Already-active timed favors stop contributing gameplay bonuses immediately.
- Already-armed single-use favors cannot be consumed for their effect while disabled.
- Armed favors remain visible/disarmable so inventory is not trapped by an emergency switch.

### Player support tools
The existing player inspector now exposes every quest attempt and current favor state.

Audited support actions:
- Grant a static/daily/weekly quest.
- Reset a non-completed broken quest attempt.
- Mark a player quest ready to turn in.
- Grant or remove favor inventory.

Safety rules:
- Admins cannot use support corrections on their own player.
- Finished rounds stay frozen.
- Claimed/completed quests cannot be reset or re-granted when that could duplicate rewards.
- Support completion does **not** pay rewards directly; it marks the quest ready so the normal claim/reward/branch validation path still runs.
- Shared alliance/community-event completion cannot be forced for one player.
- Generated city contracts remain on their authoritative board rather than being fabricated by admin.
- Every content/support write requires a reason and is stored in the admin audit log.

### Data-driven admin UI
The Quest Content and player-support selectors render the server-provided ruleset catalog. They do not hardcode current quest or favor keys.

## Database

Adds `FavorContentSetting`, keyed by:

- `rulesetId`
- `rulesetVersion`
- `key`

Missing rows mean enabled. This preserves existing pinned ruleset behavior unless an admin explicitly changes a favor switch.

Quest enable/disable continues to use the existing `QuestDefinition.isEnabled` column.

## Validation coverage

Focused tests cover:
- Daily rotation filling its slots after a selected definition is disabled.
- Weekly rotation filling its slots after a selected definition is disabled.
- Disabled timed favors no longer contributing an already-active bonus.
- Disabled timed favors refusing new activation.
- Disabled single-use favors refusing new arm operations.
- Disabled already-armed single-use favors not matching/consuming their effect.

## Acceptance checklist

- [x] Quest enable/disable
- [x] Player quest inspection
- [x] Reset broken quests
- [x] Grant quests for support
- [x] Complete quests for support through the normal claim path
- [x] Grant/remove favor inventory
- [x] Inspect active and armed favors
- [x] Emergency favor kill switch
- [x] Daily/weekly contract rotation honors enabled content
- [x] Admin UI driven by server catalog rather than hardcoded quest/favor keys
- [x] Audit reasons on all Phase X writes
