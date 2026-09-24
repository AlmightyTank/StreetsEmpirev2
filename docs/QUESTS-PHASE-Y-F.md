# Quest Phase Y-F — Holiday & Special Event Quests

Phase Y-F turns the Y-E site themes into actual seasonal rewards.

## 2026 holiday events

### The Witching Run — Halloween 2026

Window: **October 15, 2026 through November 2, 2026 (UTC)**.

Required:
- 13 scouting actions;
- 3 successful attacking raid wins.

Bonus:
- bring 1 intercity run home during the event.

Reward:
- permanent **Halloween Moon** site theme (`halloween-moon-2026`).

### Midnight Delivery — Christmas 2026

Window: **December 15, 2026 through January 5, 2027 (UTC)**.

Required:
- bring 3 intercity runs home;
- sell $100,000 through store counters;
- recruit 10 thugs.

Bonus:
- complete 1 scouting action during the event.

Reward:
- permanent **Winter Lights** site theme (`winter-christmas-2026`).

## Seasonal window behavior

Holiday jobs use a server-authoritative UTC window.

- Before the event, the job remains locked.
- When the event opens, the normal quest board can make it available.
- When the event closes, an unaccepted available job is locked again.
- An already accepted job is not forcibly abandoned at the event boundary; its normal quest expiration applies.
- Acceptance calls the availability refresh inside the transaction, preventing a stale client from accepting a job after the event closes.
- The cosmetic reward is permanent account ownership and can be equipped independently from the site accent.

## Admin QA mode

On non-production servers, admins automatically receive the seasonal quests as **AVAILABLE** even when the real-world event window is closed. This lets beta/admin accounts test acceptance, progress, completion, and the cosmetic rewards immediately.

Set `SEASONAL_EVENT_ADMIN_TEST_MODE=false` in the server environment to turn the behavior off. The default is enabled outside production and disabled in production. Only accounts with the admin role receive the bypass; normal players always use the real UTC event windows.

## Design goal

These are deliberately **event-shaped objectives**, not stronger versions of normal Contact jobs and not temporary gameplay buffs. The holiday itself is the reason to play them, while the permanent site theme is the trophy.

## Ruleset

- ID: `classic-og-v0.7-aa`
- Version: `0.7.0-AA`
- Name: `Classic OG - Holiday Event Quests`

Older pinned rulesets remain unchanged.