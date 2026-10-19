# Supporter forum cosmetics

Slice E uses the existing verified `ForumLink` as the account boundary and a
pull-through contract rather than assuming a Flarum administrator/write API.

## Contract

`GET /api/forum/users/:forumUserId` verifies the forum origin and linked user,
then returns the existing profile URL and badges. When the linked player has
opted in, `forumCosmetics` is also returned:

- `supporter.active` is current paid-supporter status and may turn false.
- `supporter.permanent` means the account has retained permanent supporter rewards.
- `nameplateKey` and `frameKey` are decorative forum keys, never gameplay data.
- `avatarFrameKey` mirrors the selected, owned game profile frame only.

The response contains no payment dates, invoices, email addresses, contact IDs,
or billing provider details. A Flarum extension can poll this endpoint and
apply/remove decoration idempotently by forum user ID. Downtime is safe: the
last decoration can remain until the next successful pull, and unlinking makes
the endpoint return no linked cosmetics.

Players control the opt-in at Account settings → Connected accounts. It is off
by default and does not affect game profiles or supporter entitlements.

Admins can inspect `GET /api/admin/forum/cosmetics` for linked, opted-in, and
currently-active counts. The diagnostic explicitly reports `pull-through` mode
and that the game does not write to Flarum.
