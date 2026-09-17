# StreetsEmpire 0.3.0-E: balance and release

E closes 0.3.0. It does not add player features. It adds the regression gate for an
alliance season, records what real alliance rounds do, and sets out how the balance
decisions held back from D get made once that data exists.

## Automated gate

From the repository root:

```powershell
npm run qa:release
```

With PostgreSQL running:

```powershell
npm run qa:release -- --with-db
```

`--with-db` now also runs the alliance suites (`ALLIANCE_INTEGRATION`) and the 0.3.0
season regression in `release-0.3.integration.test.ts`. Every suite uses its own
fixture round and pins the current-round lookup to it, so the local dev round keeps
running.

The 0.3.0 regression plays one alliance season through the HTTP API:

- Five players join through the real join route.
- An alliance is founded, invites go out and are accepted, the wire and contacts
  are used, and an ally's recon shows up for another member but not an outsider.
- An ally cannot be raided. A raid with an ally's recon and a solo hit on a member
  record both alliances and the intel source, and shared revenge opens.
- The admin alliance balance report counts those battles in the right matchups and
  is refused to non-admins.
- Membership exploits are refused:
  - accepting without an invite, or with a forged tag;
  - inviting as a non-leader, kicking a non-member, squatting a taken name;
  - unknown fields and oversized posts;
  - the same player founding two alliances at once;
  - a kicked member coming straight back.
- The round closes: alliances, the wire and raids freeze, the wire stays readable,
  and the Hall of Fame keeps the winners' alliance tags.

Concurrency limits already covered by the alliance suites: the size cap under
simultaneous accepts, one player accepting two invites at once, one recruitment
thread on a double click, and the wire cooldown under the author's row lock.

## Load smoke

Unchanged from 0.1.0-H. Start the production build, then:

```powershell
npm run qa:load
```

## Balance data from real rounds

Every battle from E onward records the attacker's alliance and whose recon they had
(own, an ally's, or none), alongside the defender's alliance recorded since C.

Read a round's numbers:

- **Admin panel:** Rounds → the round → **Alliance balance**.
- **Terminal:** `npm run qa:alliance-balance -- --round <slug> --output report.md`

Battles from before E did not record the attacker side, so they count as solo attackers
without recon. Judge a round mostly on battles fought after E deployed.

### Decisions this data settles

Run the report once an alliance round has a few hundred battles, then decide.

1. **Defense reinforcement** (held from D; shapes in [COMBAT-0.3.0-D.md](COMBAT-0.3.0-D.md)).
   - **Ship the chance-to-show-up shape** if solo attackers beat alliance members at about
     the solo-into-solo rate. That means an alliance gives no defensive edge yet, and members
     are being farmed: member median net worth sits at or below solo.
   - **Keep holding** if alliance members already win defenses more often than solo
     players, or alliances hold most of the top 10.
2. **Alliance size.** If one alliance holds more than half of all net worth, or most of the
   top 10 at a cap of 5, lower the cap to 4 in the next ruleset rather than adding penalties.
3. **Shared recon.** Compare attacker win rates with an ally's recon against own recon.
   If ally recon wins clearly more often than own recon, shorten intel expiry for shared
   reports rather than removing sharing.
4. **Special raid rewards** (carried from 0.2.0-H). Use the per-form win rates in the
   report (drive-by, drug run, ride theft, lure run) to retune rewards in the ruleset.
   Prefer widening reward ranges over raising averages.

Each change ships as a new pinned ruleset, so running rounds keep their rules.

## Mobile and browser checks

Covering the pages added in 0.3.0, at 360px, 390px, 768px and desktop:

- Alliance: found, invite, join, lead, kick, leave, wire, recruitment panel.
- Alliance rankings, an alliance page, and the Rankings page's alliance table.
- Contacts, and **Add to contacts** on a profile.
- Raids: the alliance tag and **From <ally>** intel on target cards.
- Admin round page: alliances, wire moderation, alliance balance.

For each: no sideways page scroll, tables scroll inside their panel, buttons stay tappable,
and the `[TAG]` before names wraps cleanly.

## Deployment

Back up PostgreSQL first. Migrations added during 0.3.0-C to E, in order:

1. `20260916210000_alliances`
2. `20260916230000_alliance_forum_threads`
3. `20260917010000_wire_and_contacts`
4. `20260917030000_battle_alliance_balance_data`

Then:

- **Forum recruitment:** set `FORUM_RECRUITMENT_TAG_ID` (10, **Recruiting**), with
  `FORUM_API_KEY` and `FORUM_API_USER_ID`.
- **Discord:** redeploy the bot for alliance roles.
- **New round:** start a round on `classic-og-v0.3-d` from the admin panel.
- **After deploy:** check a real login, founding an alliance, a wire post, and one raid.

## Exit condition

0.3.0 is complete when the automated gate passes with `--with-db`, the load smoke is within
budget, the browser matrix has no blocker, and the first public alliance round has a balance
report on file with the decisions above made or explicitly deferred.
