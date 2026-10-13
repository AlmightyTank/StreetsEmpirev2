# Discord game activity for StreetsEmpire — implementation plan

## Goal

A player who opts in can show **Playing StreetsEmpire** on *their own*
Discord profile, with safe detail such as "Scouting Chicago" or "Playing Slots"
and a button linking to the public game.

This is separate from the in-game **Players → Online** statuses and separate
from the Discord **bot's** global "Playing ..." status.

## Platform limitation (verify before implementation)

A linked Discord OAuth account and the existing server-side Discord bot cannot
set a member's personal Rich Presence. Do not use user tokens/self-bots or
claim the bot can spoof player activity.

Discord's official Rich Presence integration choices are:
1. **Native Social SDK:** use the SDK in a native desktop game/companion
   process that connects to the player's Discord client. The website alone
   cannot call desktop RPC; the official SDK does not support web-client RPC.
2. **Discord Embedded App SDK:** host a genuine Discord Activity inside
   Discord, where `setActivity()` is available. This would require a separate
   embedded experience with its own authentication and deployment checks.

Official references:
- https://discord.com/developers/docs/rich-presence/overview
- https://discord.com/developers/docs/social-sdk/index.html
- https://discord.com/developers/docs/rich-presence/using-with-the-embedded-app-sdk

## Proposed UX

Example opt-in activity:

```text
Playing StreetsEmpire
Scouting the streets of Chicago
Level 27 · Round 3
[Play StreetsEmpire]
```

Safe activity map:
- Dashboard → Building an empire
- Scout → Scouting the streets
- Produce → Running production
- Turf → Fighting for turf
- Crew / Hideout → Managing the crew
- Casino → Playing Slots, Blackjack, Roulette, Street Dice, or Poker
- Quests → Completing contracts
- Rankings → Checking the leaderboard
- Elsewhere → Playing StreetsEmpire

Do **not** publish private messages, hidden scouting/recon intel, exact
inventory/cash, opponent targets, unrevealed quests, bet sizes, or precise
location/intelligence. Only expose coarse categories derived from the player's
*own* browser route. On inactivity, hide the Rich Presence. Include an opt-out
and separate controls for displaying activity detail and elapsed session time.

## Delivery slices

### Discord-A — Shared safe activity model
- Define a finite allow-list of categories and public, non-sensitive labels.
- Write tests for route-to-activity mapping and privacy defaults.
- Store player opt-in under account settings (default **off**).
- Keep existing Discord login, bot, and roles unchanged.

### Discord-B — Native bridge for ordinary browser gameplay
- Investigate a small optional signed desktop companion on Windows first;
  use Discord's supported native SDK.
- Pair the local companion with a one-time code or short-lived device credential,
  scoped to presence only and revocable in account settings.
- Send sanitized activity over a secure authenticated channel; no Discord tokens
  in the web app, no arbitrary localhost requests from untrusted sites.
- Update once per meaningful activity change; clear on logout, stop, or idle.
- If users prefer not to install a helper, the regular website still works;
  it simply does not change their personal Discord game status.

### Discord-C — Discord-hosted Activity (separate product path)
- Prototype the Embedded App SDK in a Discord iframe.
- Validate game login, Discord proxying, cookie/storage constraints,
  permissions, user experience, and game security before shipping.
- If viable, let members open that Activity and publish Rich Presence through
  `setActivity()`, with a public join URL and approved assets.

### Discord-D — QA and rollout
- Test privacy settings, linked/unlinked accounts, multiple tabs, idle and
  disconnected sessions, mobile/desktop support, and Discord sharing settings.
- Confirm Discord presence clears correctly and does not leak hidden gameplay.
- Enable beta opt-in before a live launch.

## Current status

This document is a **plan**, not a claim that individual Discord Rich Presence
already works for the normal website. The separate online-presence heartbeat fix
is implemented in this branch.
