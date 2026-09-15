# Community, forum and SSO direction

StreetsEmpire should use the game account as the player identity and let community tools hang off that identity instead of making players maintain separate names.

## Current account state

- Email and password login exists.
- Discord login exists and can create or link a StreetsEmpire account from Discord's verified email.
- Email recovery and email change flows exist through account settings and Resend-backed mail.

That gives the game enough authentication foundation for public play now. The next SSO step is to make the game the source of truth for player identity, then connect community software to it.

## Recommended free forum path

Use **Flarum** first.

Why it fits StreetsEmpire:

- It is free, open source and MIT licensed, so the forum software itself does not add a monthly bill.
- It is lighter than Discourse and should be easier to run beside the game on the current VPS.
- It has groups, permissions, tags, moderation and extensions, which are enough for announcements, bug reports, rival talk and recruiting.
- Its extension model gives us a path to Discord login now and deeper StreetsEmpire account linking later.

Suggested rollout:

1. Start with `forum.streetsempire.dev` as a separate Flarum install.
2. Enable Discord login on both the game and forum so players have one practical login choice early.
3. Add a StreetsEmpire account setting that shows forum link status.
4. Later, add a StreetsEmpire SSO bridge so display name, badges and round achievements can sync outward.

## Game integration ideas

The paste-ready [forum theme and setup instructions](forum/README.md) bring the
game's charcoal and lime styling into Flarum through its Appearance settings.

Verified profile linking (step 3, before shared login) ships as a Flarum
extension plus game endpoints; see the
[install guide](../integrations/flarum/street-empire-link/README.md).

- Public profile: "Forum profile" link when connected.
- Achievements: earn forum badges for round wins, national #1, city boss and rare combat awards.
- News: mirror official game news into a read-only forum announcement category.
- Recruitment: crew/alliance forums once alliances exist.
- Moderation: keep account bans and forum bans visible to admins from one place.

## Other options

- **Discourse** is still the best full community platform if the forum gets big. It is open source and self-hostable, but it is heavier to run and its official hosted SSO/features can move into paid territory.
- **NodeBB** fits a JavaScript stack and can be themed tightly. It is open source and free to self-host, but it wants NodeBB-specific plugin upkeep while the game itself still needs combat, alliances and travel.

The practical call for now: ship the game with Discord SSO and Resend email recovery, add Flarum as the free self-hosted community layer, then connect game identity and achievements to it in a later milestone.

## References

- Flarum official site: https://flarum.org/
- NodeBB self-hosting/pricing page: https://nodebb.org/pricing
- DiscourseConnect official SSO docs: https://meta.discourse.org/t/setup-discourseconnect-official-single-sign-on-for-discourse-sso/13045
- Discourse SSO documentation index: https://meta.discourse.org/c/documentation/10?tags=sso
