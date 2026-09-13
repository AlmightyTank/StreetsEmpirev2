# Community, forum and SSO direction

Street Empire should use the game account as the player identity and let community tools hang off that identity instead of making players maintain separate names.

## Current account state

- Email and password login exists.
- Discord login exists and can create or link a Street Empire account from Discord's verified email.
- Email recovery and email change flows exist through account settings and Resend-backed mail.

That gives the game enough authentication foundation for public play now. The next SSO step is to make the game the source of truth for player identity, then connect community software to it.

## Recommended forum path

Use **Discourse** first.

Why it fits Street Empire:

- It is a complete forum with moderation, announcements, categories, private messages and long-lived searchable threads.
- It supports Discord login if the forum needs a quick shared identity path.
- It supports DiscourseConnect and OAuth-style integrations, so Street Empire can later become the central login and push username/avatar/group state into the forum.
- It is easier to run beside the game on `forum.streetsempire.dev` than building a custom forum during combat/ranking development.

Suggested rollout:

1. Start with `forum.streetsempire.dev` as a separate Discourse install.
2. Enable Discord login on both the game and forum so players have one practical login choice early.
3. Add a Street Empire account setting that shows community link status.
4. Later, make Street Empire the primary identity provider for the forum so display name, badges and round achievements can sync outward.

## Game integration ideas

- Public profile: "Forum profile" link when connected.
- Achievements: earn forum badges for round wins, national #1, city boss and rare combat awards.
- News: mirror official game news into a read-only forum announcement category.
- Recruitment: crew/alliance forums once alliances exist.
- Moderation: keep account bans and forum bans visible to admins from one place.

## Other options

- **NodeBB** fits a JavaScript stack and can be themed tightly, but forum/plugin maintenance would likely compete with game work.
- **Flarum** is lightweight and clean, but its ecosystem relies more heavily on extensions for the SSO and moderation shape Street Empire will need.

The practical call for now: ship the game with Discord SSO and Resend email recovery, add Discourse as the community layer, then connect game identity and achievements to it in a later milestone.

## References

- DiscourseConnect official SSO docs: https://meta.discourse.org/t/setup-discourseconnect-official-single-sign-on-for-discourse-sso/13045
- Discourse SSO documentation index: https://meta.discourse.org/c/documentation/10?tags=sso
