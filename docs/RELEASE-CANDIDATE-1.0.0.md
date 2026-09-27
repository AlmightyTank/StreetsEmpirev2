# StreetsEmpire 1.0.0 release candidate (1.0.0-rc.2)

The build that has to prove the finished game works before it is called 1.0.

## The candidate

- **Version:** `APP_VERSION` is `1.0.0-rc.2`, in `packages/shared/src/platform.ts`. The footer and `/api/meta` show it, with the commit.
- **Branch:** `beta`. Deploy it to beta first (`bash scripts/ops/deploy-beta.sh`), then to production once the launch checklist is clear.
- **One command runs every gate:** `npm run release:rc`, which is `qa:release --with-db --with-load`. Add `--with-ui` to include the browser audit when a web client is running.

## Freeze

From rc.1 on, nothing changes except to fix a **release blocker**:

- something that loses or corrupts player state;
- an exploit;
- a crash or error on a normal path;
- a failed gate below;
- a launch-checklist item.

Everything else waits for 1.0.1 or 1.1 ([ROADMAP-FUTURE.md](ROADMAP-FUTURE.md)). Each fix gets a regression test and goes out as rc.2, rc.3 and so on, after the whole gate passes again.

## Gates

| Gate | Command | What it proves |
| --- | --- | --- |
| Types | `npm run typecheck` | Every workspace and the ops scripts |
| Unit tests | `npm test` | Rules engine, rulesets, services, web helpers |
| Build | `npm run build` | API, game, public site and Discord bot build |
| Balance | `qa:products`, `qa:travel`, `qa:turf`, `qa:hideout`, `qa:store-economy`, `qa:season` | Each system's balance bands, and whole seasons with every strategy at once |
| Full regression | `npm test` with every `*_INTEGRATION` flag, plus the bot, forum and push suites with generated secrets | The areas below, against PostgreSQL |
| Season One | `npm run qa:season-one` | The lifecycle and the 1.0 player journey, on a scratch database (below) |
| Backups | `ops:backup`, then `ops:restore-test` | A backup restores and every table's count matches |
| Load | `npm run qa:load-test` | 300 players, on a scratch server ([LOAD-1.0.0-H.md](LOAD-1.0.0-H.md)) |
| Mobile and accessibility | `npm run qa:ui -- --strict` | Every page at phone widths and WCAG 2.2 AA (1.0.0-G) |
| Launch | `npm run ops:launch-check` (on the server) | The launch checklist (below) |

### Regression matrix

Every area the roadmap names, and the suites that exercise it through the API against PostgreSQL. "Season One" is the new end-to-end suite.

| Area | Suites |
| --- | --- |
| Registration | Season One, release, onboarding, platform, password-recovery, email-verification, account-safety (`AUTH`) |
| Login | Season One, admin-suspensions, password-recovery, forum-link, account-safety (admin Discord sign-in, closed accounts) |
| Turns | transaction, release, exploit, onboarding |
| Scout | Season One, release, release-0.3/0.4, work-supply, street-finds, heat |
| Produce | Season One, release-0.4, product-economy, work-supply |
| Stores | Season One, store, product-inventory, product-economy, exploit |
| Reputation | reputation, playing-together, product-economy |
| Combat | Season One, combat, drive-by, exploit, admin-operations |
| Recon | Season One, combat, playing-together, alliance |
| Recovery | combat, heat, admin-corrections (plus combat-recovery unit tests) |
| Alliances | Season One, alliance, alliance-hooks, playing-together, release-0.3 |
| Products | product-inventory, product-economy, release-0.4, travel-risk |
| Travel | Season One, travel, travel-release, travel-risk, relocation, fresh-travel-cities |
| Convoys | convoys, travel |
| Turf | Season One, turf, turf-release, exploit |
| Hideout | Season One, product-economy (armory, infirmary), relocation (garage), convoys |
| Dynamic economy | product-economy, travel-risk, release-0.4 |
| Messaging | Season One, moderation, playing-together |
| Notifications | notifications (`NOTIFICATION`), game-alerts, discord-bot, Season One |
| Season ending | Season One, release, profiles-stats, admin, admin-operations |

**The rc gate found these:**

1. **Eleven suites that no release gate ran.** They covered admin accounts, audit retention, corrections, integrations, suspensions and round operations, plus password recovery, the Discord bot API, forum linking and phone alerts. They now run, the last three with throwaway secrets generated for the run. All pass.
2. **Six tests that had been failing across several milestones.** Every one was a stale test, not a game bug:
   - Two quest-toast links gained a deliberate `focus=` parameter.
   - A drive-by test called a trader-favour route that was retired when favours moved into quests. It now checks drive-bys count toward quests.
   - An infirmary fixture set wounded thugs without the injuries that back them.
   - A relocation fee was computed from net worth read before the request settled the player.
   - A cook was compared against total stock when the scout before it can turn up a little Meth.

   All six are corrected. The full regression now has no known failures.

### Season One (lifecycle and player journey)

`apps/server/src/services/__tests__/season-one.integration.test.ts`. It runs on a scratch database, through the game's own HTTP API, with no database edits. The only exception is making the first admin, which is exactly what `npm run admin` does.

1. **Create.** An operator schedules Season One on the newest ruleset, opens registration and starts it. It hands off from the running season as a real launch would.
2. **Join.** Three players register, take the intro and join.
3. **Play.** This is the 1.0 release definition:
   - Build a crew and trade: scout, produce, stock up, set payout. A retried action id does not happen twice.
   - Fight: recon, then a raid the defender sees from their side.
   - Travel: a run leaves for another city. A week of play is fast-forwarded with the audited admin grant; everything after that is ordinary play.
   - Control turf: the crew works a block until it has presence, then takes it from the locals.
   - Build a Hideout: a Safe Room upgrade.
   - Alliances: one is created, a player is invited and accepts, and the wire gets a post.
   - Messages: a direct message arrives in the other player's inbox, and the bell answers.
4. **End.** The operator ends the season.
5. **Freeze.** Actions are refused and net worth is final.
6. **Hall of Fame.** It names Season One's winners.
7. **Archive.** The operator archives the season. It stays in the public archive and in the player's career.
8. **Create the next season.** Season Two is scheduled and started, and the same player joins it fresh.

Every round change is in the admin audit log.

### Load

See [LOAD-1.0.0-H.md](LOAD-1.0.0-H.md). With 300 players on one API process, every scenario passes with zero errors: login spike, sustained play, both bursts, the notification burst and the mass season end. The load test found and fixed two problems:

- **Bursts:** 500s when the connection pool ran dry.
- **Big seasons:** a season of about 640 or more players could not close in time.

## Launch checklist

Run `npm run ops:launch-check -- --game https://play.streetsempire.dev --site https://streetsempire.dev --beta-env <beta checkout>/.env` on the production server. It fails on anything unsafe and warns on anything unfinished.

| Item | How it is checked | Where to fix it |
| --- | --- | --- |
| Production backups verified | Last backup under 26 h old and OK; off-server copy OK | `scripts/ops/install-backup-timer.sh`, `BACKUP_OFFSITE` ([RECOVERY.md](RECOVERY.md)) |
| Restore verified | Restore test OK within 8 days | `npm run ops:restore-test` (weekly timer) |
| Admin accounts configured | At least one active admin; a warning below two | `npm run admin -- <username>` |
| Admin sign-in protected | `REQUIRE_ADMIN_DISCORD` on, and every admin has Discord linked (fails if none has) | [ADMIN-RUNBOOK.md → Admin sign-in](ADMIN-RUNBOOK.md#admin-sign-in) |
| Sign-up flood cap | `SIGNUP_DAILY_LIMIT_PER_IP` above 0 | `.env` |
| Moderation process documented | [ADMIN-RUNBOOK.md → Moderation process (1.0)](ADMIN-RUNBOOK.md) | — |
| Privacy/terms pages prepared | `/privacy` and `/terms` answer on the site. The operator reads them (**manual**) | `apps/site/src/pages/LegalPages.tsx` |
| Rules available | `/game/rules` answers | — |
| Status/maintenance mechanism | `/api/public/status` answers; `maintenance.sh` present | [RECOVERY.md → Maintenance mode](RECOVERY.md#maintenance-mode) |
| Beta environment separated | Beta `.env` has its own database, its own cookie and no shared secrets | `docs/BETA-DEPLOY.md` |
| Production secrets rotated | No placeholder or `.env.example` values; `SECRETS_ROTATED_AT` recorded | Rotate, then set `SECRETS_ROTATED_AT=YYYY-MM-DD` |
| Sign-up verification | New players must verify their email or use Discord (existing accounts are grandfathered), and every player accepts the rules once; email delivery (`RESEND_API_KEY`, `EMAIL_FROM`) is configured. It also counts existing accounts that will be asked to verify. The sending domain's SPF and DKIM are verified in Resend (**manual**) | `.env` ([ADMIN-RUNBOOK.md](ADMIN-RUNBOOK.md#getting-players-in)) |
| Release notes published | A published news post with "1.0" in its title | Text in [RELEASE-1.0.0.md](RELEASE-1.0.0.md) |

## Go / no-go

Go when every gate passes on the rc commit, beta has run the rc for at least a few days without a blocker, and `ops:launch-check` shows no FAIL on production. Then:

1. Set `APP_VERSION` to `1.0.0`.
2. Deploy.
3. Schedule and start Season One from Admin → Rounds.
4. Publish the release notes.

## Results for rc.1

`npm run release:rc` on the rc commit, 27 September 2026, on a 4-CPU container with PostgreSQL 16: **all gates passed.**

| Gate | Result |
| --- | --- |
| Typecheck | pass: all workspaces and the ops scripts |
| Unit tests | 127 files, 1,086 tests pass (43 files are the PostgreSQL suites, run below) |
| Production build | pass: API, game, site and bot |
| Balance | products, travel, turf, hideout, store economy, whole-season bands: all within their bands |
| Full PostgreSQL regression | 166 files, 1,343 tests pass; no known failures |
| Bot, forum link and push | 3 files, 22 tests pass |
| Season One | 9 of 9 steps pass on a scratch database |
| Backup and restore test | backup verified; restored 72 tables and 729 rows, and every count matches |
| Load test (300 players) | every scenario passes with zero errors ([LOAD-1.0.0-H.md](LOAD-1.0.0-H.md)) |
| Mobile and accessibility | clean on the 1.0.0-G audit: 0 sideways scrolling, 0 targets under 24 px, 0 axe findings. Run `npm run qa:ui -- --strict` on beta before launch |

### What the gate caught (fixed in rc.1)

- **Release blocker: the beta-tester cosmetic was on in production.**
  - `BETA_TESTER_DISCORD_LINKED` was parsed with `z.coerce.boolean()`, which reads the string `"false"` as true.
  - Any server whose `.env` had the example value `BETA_TESTER_DISCORD_LINKED=false` gave every Discord-linked player the Beta Tester badge and Discord role.
  - Now only `true` means true. The Discord `?link=` flag had the same parsing and is fixed too. A regression test loads the config with `"false"`.
- **Load: 500s under bursts, and big seasons that could never close.** See [LOAD-1.0.0-H.md](LOAD-1.0.0-H.md).
- **Eleven suites no gate ran.** Added to the gate, as above.
- **Tests that failed for reasons outside the game:**
  - Six stale tests, as above.
  - Three that depended on random street finds or on the local `.env`:
    - two stock checks now count the finds each result reports;
    - a fake database gained the lookup the beta-tester path makes.


## rc.2

rc.2 was opened by the owner for launch-readiness work on accounts, beyond the blocker-only freeze. Everything below has tests, and the whole gate ran again on it.

### What changed

- **Sign-up verification.** New players verify their email or sign in with Discord before they play. Accounts that existed before were grandfathered by the migration. The game shows a "Verify your email" screen with resend, change-address and Discord options.
- **Rules agreement.** Every player accepts the rules once, in a dialog that cannot be dismissed. A new `RULES_VERSION` asks everyone again.
- **Admin sign-in.** Admin tools answer only a session that signed in with Discord (`REQUIRE_ADMIN_DISCORD`, on by default in production and beta), so Discord's two-factor sign-in guards them.
  - Sessions record how they signed in.
  - An admin cannot link or unlink Discord from a password sign-in.
  - `npm run admin -- --list` and `ops:launch-check` show admins without Discord.
- **Report a bug.** Players report bugs from the game menu or the footer. Each report carries the page, browser and version, and a player can send 5 an hour. Staff resolve them in **Admin → Bug reports**, and each resolution is audited.
- **Close my account.** Players close their own account at the bottom of Account settings. They confirm with their password (a Discord sign-in needs none) and by typing CLOSE. Staff can reopen it with Reactivate. The privacy page now says so.
- **Sign-up flood cap.** At most `SIGNUP_DAILY_LIMIT_PER_IP` new accounts per network a day (5 on production and beta). Past that, sign-up is refused and a **Sign-up flood** exploit flag is raised, keyed without the address.
- **Seed.** The development seed uses the current ruleset (0.8-H) instead of 0.7-AA.
- **Launch checklist.** It gains **Admin sign-in protected** and **Sign-up flood cap**, and the email item now notes SPF/DKIM. The steps for Resend domain verification are in [ADMIN-RUNBOOK.md → Getting players in](ADMIN-RUNBOOK.md#getting-players-in).

One migration comes with it: `20260928000000_rc2_account_safety` (session sign-in method, account closure and sign-up address, bug reports). The earlier `20260927230000_grandfather_and_rules` migration grandfathers every existing account.

### Results for rc.2

`npm run release:rc` on the rc.2 commit, 27 September 2026, on the same 4-CPU container: **all gates passed.**

| Gate | Result |
| --- | --- |
| Typecheck | pass: all workspaces and the ops scripts |
| Unit tests | 127 files, 1,086 tests pass |
| Production build | pass: API, game, site and bot |
| Balance | all within their bands |
| Full PostgreSQL regression | 168 files, 1,351 tests pass; no known failures. This includes the new email-verification and account-safety suites |
| Bot, forum link and push | 3 files, 22 tests pass |
| Season One | 9 of 9 steps pass, with email verification and the rules agreement required, as on production |
| Backup and restore test | restored 73 tables and 820 rows, and every count matches; no pending migrations on the restored copy |
| Load test (300 players) | every scenario passes with zero errors. Login spike p95 1.1 s; bursts drain in at most 10.4 s; season end 13.3 s |
| Browser check | the verify screen, the rules dialog, Report a bug, Close account, the admin Discord gate and Admin → Bug reports all render and work at phone and desktop widths, with no page errors |

### Before rc.2 goes to production

These need the real beta or production servers, so they have not been done here:

1. **Deploy rc.2 to beta and test Discord for real.** Check that signing in with Discord works, that linking works for a player, and that an admin reaches the admin tools after a Discord sign-in. (It was tested here with the sessions the callback creates, since this environment cannot reach Discord.)
2. **Link Discord on each admin account.** Do this before `REQUIRE_ADMIN_DISCORD` takes effect on production; see [ADMIN-RUNBOOK.md → Admin sign-in](ADMIN-RUNBOOK.md#admin-sign-in). Admins can still play with a password in the meantime.
3. **Verify the sending domain in Resend** (SPF, DKIM, DMARC). Then send yourself a sign-up link.
4. **Run `npm run qa:ui -- --strict` against beta.**
5. **Run `npm run ops:launch-check` on production.**
