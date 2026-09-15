# 0.2.0-F public raid round

0.2.0-F is the first production-facing public raid round. It keeps the E combat loop intact and changes the default seed and public lists so live rounds are about real active players.

Community/SSO planning lives in [COMMUNITY-SSO-FORUM.md](COMMUNITY-SSO-FORUM.md). The current game supports email/password, Resend-backed email recovery and Discord login/linking; the recommended free forum path is Flarum on `forum.streetsempire.dev` with shared Discord first and StreetsEmpire SSO later.

## Status

- Ruleset: `classic-og-v0.2-f` at version `0.2.0-F`.
- Combat model version: `0.2.0-F.2`.
- Default seed: `Game #006 - Public Raids`.
- Default seed behavior: no bot rivals are created for the public player field.
- Local test behavior: run `npm run db:seed:dev-bots` to add active test targets for cash raids, drug runs, ride theft, lures and drive-bys.

## What carries forward from E

F inherits the E raid tuning: recon costs 2 turns, intel lasts 60 minutes, successful raids roll a 5%-40% loot cut weighted toward lower values, repeated hits on the same target have diminishing returns, cash is still capped per fit thug, and successful raids can take a share of the defender's crack. Drive-bys stay available as the attack that weakens a target without stealing cash or crack.

F also keeps the E readability work: tooltips, harsher happiness loss for unarmed thugs, armed-only street coverage while scouting, public profile and ranking history, collapsible achievement milestones, and the full achievement gallery.

## Production-facing behavior

Production rankings, public profiles, player counts, recon targets and combat targets show active player accounts. Seed rivals remain useful for local development, but they are not part of the public player field by default.

If a production database already has seeded rival/dev bot accounts from earlier tests, remove them with:

```bash
npm run db:cleanup:seed-rivals
```

Then seed or reseed the current public round with:

```bash
NODE_ENV=production npm run db:seed
```

For local solo testing, run:

```bash
npm run db:seed:dev-bots
```

That gives a developer immediate targets without changing the public-round rule that production play is active players only.


## Expanded raid forms

F adds old-school raid forms beside the cash raid and drive-by:

- **Drug their hoes** shares the normal raid clock. Your crew fights its way in with your crack; if it lands, their hoes burn through crack and condoms, which can drag down the target's earning power.
- **Steal a ride** shares the normal raid clock. If your crew wins and at least one thug makes it home, one of the target's Low-Riders comes home with you.
- **Lure their crew** shares the normal raid clock. It only works on unhappy blocks: crack can pull their hoes and beer can pull fit thugs. If your crew wins and people make it home, those people join your crew and leave theirs.

All forms write attacker and defender reports, spend turns once through durable action receipts, can wound both crews, give the defender the normal raid breathing room, and do not count toward the cash-raid repeat-loot penalty.
