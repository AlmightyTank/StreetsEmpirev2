# StreetsEmpire 1.0.0 release candidate (1.0.0-rc.6, released as 1.0.0)

The build that has to prove the finished game works before it is called 1.0.

## The candidate

- **Version:** `APP_VERSION` is `1.0.0-rc.6`, in `packages/shared/src/platform.ts`. The footer and `/api/meta` show it, with the commit.
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
| Registration | Season One, release, onboarding, platform, password-recovery, email-verification, account-safety, two-factor (`AUTH`) |
| Login | Season One, admin-suspensions, password-recovery, forum-link, account-safety (admin second factor, closed accounts), two-factor (authenticator sign-in, recovery codes, reset) |
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
| Admin sign-in protected | `REQUIRE_ADMIN_2FA` on, and every admin has Discord or an authenticator (fails if none has) | [ADMIN-RUNBOOK.md → Admin sign-in](ADMIN-RUNBOOK.md#admin-sign-in) |
| Sign-up bot check | `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` set (a warning while off) | [ADMIN-RUNBOOK.md → Bot check](ADMIN-RUNBOOK.md#bot-check-rc5) |
| Two-step sign-in key | `TWO_FACTOR_KEY` set (fails if accounts are enrolled without it) | [ADMIN-RUNBOOK.md → Two-step sign-in](ADMIN-RUNBOOK.md#two-step-sign-in-for-players-rc3) |
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
3. ~~**Verify the sending domain in Resend** (SPF, DKIM, DMARC).~~ Done: the owner reports Resend is set up for sending and receiving (27 September 2026). Still send yourself a sign-up link from beta once rc.3 is deployed.
4. **Run `npm run qa:ui -- --strict` against beta.**
5. **Run `npm run ops:launch-check` on production.**

## rc.3

rc.3 adds **two-step sign-in with an authenticator app**, which the owner asked for, for players and admins. Everything else is as in rc.2.

### What changed

- **Players.** Two-step sign-in lives in **Account settings → Two-step sign-in**.
  - Setup: scan a QR code (or type the key) into any authenticator app, confirm one code, and save ten one-use recovery codes. They can be copied or downloaded.
  - After that, every sign-in asks for the code: password, Discord and password-reset links alike.
  - Recovery codes also work, one use each. The login page sends a player with 3 or fewer left to make new ones.
- **Admins.** Admin tools accept an authenticator sign-in as their second factor, as well as Discord (`REQUIRE_ADMIN_2FA`; the rc.2 name `REQUIRE_ADMIN_DISCORD` is still read).
  - A password-only admin session cannot add a Discord link or an authenticator. Someone who has only the password therefore cannot give themselves admin access.
  - An admin can unlink Discord only once an authenticator replaces it.
- **Safety.**
  - Secrets are stored encrypted (AES-256-GCM, keyed by `TWO_FACTOR_KEY`).
  - Recovery codes are stored only as hashes.
  - A code is never accepted twice. Clocks may drift one step (30 seconds) either way.
  - Five wrong codes end a sign-in attempt.
  - Every change emails the player.
- **Lost phones.** Staff use **Accounts → Turn off two-step sign-in** (audited, and the player is emailed). The console has `npm run admin -- <name> --reset-2fa` for when no other admin is available.
- **Launch check.** It gains **Two-step sign-in key**, and **Admin sign-in protected** now counts Discord or an authenticator.
- **Privacy page.** It says what two-step sign-in stores.

Migration: `20260928010000_two_factor` (account two-step fields, recovery codes, sign-in challenges, and the session's two-step mark). No new data is required from anyone. The feature is off for every account until its owner turns it on.

### Results for rc.3

`npm run release:rc` on the rc.3 commit, 27 September 2026: **all gates passed.**

| Gate | Result |
| --- | --- |
| Typecheck | pass |
| Unit tests | 128 files, 1,091 tests pass, including the RFC 6238 reference codes |
| Production build | pass |
| Balance | all within their bands |
| Full PostgreSQL regression | 170 files, 1,360 tests pass, including the new two-factor suite: setup, sign-in, replay, recovery codes, guess limit, reset link, turning it off, admin tools and staff reset |
| Bot, forum link and push | 3 files, 22 tests pass |
| Season One | 9 of 9 steps pass |
| Backup and restore test | restored 75 tables and 849 rows, and every count matches |
| Load test (300 players) | every scenario passes with zero errors; login spike p95 1.07 s |
| Browser check | setup with the QR code, the recovery codes, and signing in with a code all work at phone width, with no page errors |

### Before rc.3 goes to production

1. **Set `TWO_FACTOR_KEY`** in production's `.env`, and a different one in beta's, before anyone turns two-step on (`openssl rand -base64 48`). Never change it afterwards.
2. On beta, **set up an authenticator on a real phone**. Sign out and back in with a code, then try a recovery code.
3. **Give every admin a second factor**: Discord or an authenticator ([ADMIN-RUNBOOK.md → Admin sign-in](ADMIN-RUNBOOK.md#admin-sign-in)).
4. The rc.2 items still stand: test Discord on beta, `qa:ui` on beta, and `ops:launch-check` on production.

## rc.4

rc.4 sets up sign-in, sessions and two-step sign-in the way most online games and big sites do, as the owner asked.

### What changed

- **"Keep me signed in"** on the login page and for Discord sign-in. It is on by default.
  - **Kept:** the session renews while used and ends after 30 days without a visit.
  - **Not kept (shared computers):** it ends when the browser closes, or after 12 hours idle.
  - **Either way:** every session ends 90 days after sign-in, so the password (and code) is asked for at least that often. Sessions from before rc.4 keep working under the same limits.
- **"Trust this browser for 30 days"** on the two-step code screen. It is ticked by default. On a trusted browser, sign-in still needs the password but skips the code.
  - Changing or resetting the password, turning two-step off, or a staff reset forgets every trusted browser.
  - Account settings lists trusted browsers and can forget them.
- **Admins re-confirm.** Admin tools need a second factor from the last 12 hours, and a trusted browser does not count.
  - An admin with an authenticator enters a code on the admin page itself, without signing out.
  - Otherwise, they sign in with Discord again.
- **Guessing is capped while signed in.** Five wrong codes (turning two-step off, new recovery codes, admin re-confirm) sign that session out.
- **The sessions list** shows how each session signed in, whether it is kept, and when it ends.
- **Settings** (all optional): `SESSION_TTL_DAYS`, `SESSION_MAX_DAYS`, `SESSION_SHORT_HOURS`, `TRUSTED_DEVICE_DAYS`, `ADMIN_2FA_MAX_AGE_HOURS`.
- **Privacy page.** It describes the session and trusted-browser cookies.

Migration: `20260928020000_sessions_trusted_devices` (session lifetime fields, second-factor time, wrong-code count, and trusted browsers). Existing Discord and code sessions keep their second factor from when they signed in.

### Results for rc.4

`npm run release:rc` on the rc.4 commit, 27 September 2026: **all gates passed.**

| Gate | Result |
| --- | --- |
| Typecheck, build, balance | pass |
| Unit tests | 128 files, 1,091 tests pass |
| Full PostgreSQL regression | 170 files, 1,363 tests pass, including the new session, trusted-browser and admin re-confirm tests |
| Bot, forum link and push | 3 files, 22 tests pass |
| Season One | 9 of 9 steps pass |
| Backup and restore test | restored 76 tables and 877 rows, and every count matches |
| Load test (300 players) | every scenario passes with zero errors; login spike p95 1.1 s |
| Browser check | "Keep me signed in", the code screen with "Trust this browser", signing in again on a trusted browser with no code, and the trusted-browser and sessions lists all work at phone width, with no page errors |

The rc.3 steps before production still apply: set `TWO_FACTOR_KEY`, try it with a real phone on beta, and give every admin a second factor.

## rc.5

rc.5 closes the last gaps before 1.0 that the owner chose.

### What changed

- **Age 13+.**
  - Sign-up has an "I am 13 or older" checkbox, recorded on the account.
  - The rules agreement now starts with the age rule. Its version changed, so every existing player (Discord sign-ups included) accepts it once more.
  - The terms have an Age section, and the privacy page a Children section.
- **Security emails.** Players are emailed when their password is changed or reset, and when their account signs in from a browser it has not used before.
  - Browsers are recognised by a random per-browser cookie.
  - The first browser an account is seen on is recorded without an email, so rc.5 does not email every existing player.
- **Download my data.** Account settings gives a JSON file of everything kept about the account: seasons, messages, sessions, reports and settings. It never includes the password hash, two-step secrets or staff notes.
- **Delete my account.** Available in Account settings, confirmed with the password (or a Discord sign-in) and by typing DELETE.
  - An account that never played is removed entirely.
  - One that played is anonymized as "Deleted Player", so season history stays whole.
  - Staff deletion now uses the same code, which also clears the newer rc.2–rc.4 data: two-step secrets, trusted browsers and the sign-up address.
- **Cloudflare Turnstile** on sign-up and password recovery. It is off until `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set, and `ops:launch-check` warns while it is off. Discord sign-in is not affected.
- **Privacy page.** It describes the new cookies, the security emails, Turnstile and the data rights.

Migration: `20260928030000_age_devices` (the account's age confirmation, and the browsers each account has signed in from).

### Results for rc.5

`npm run release:rc` on the rc.5 commit, 27 September 2026:

| Gate | Result |
| --- | --- |
| Typecheck, build, balance | pass |
| Unit tests | 128 files, 1,091 tests pass |
| Full PostgreSQL regression | 171 files, 1,368 tests pass, including the new account-data suite: bot check, age, security emails, export and self-delete. The admin delete suite passes on the shared erase code |
| Bot, forum link and push | 3 files, 22 tests pass |
| Season One | 9 of 9 steps pass (with the new rules version) |
| Backup and restore test | restored 77 tables and 912 rows, and every count matches |
| Load test (300 players) | First run: every scenario passed except the notification burst, at p95 761 ms against its 750 ms budget. Nothing in rc.5 touches that path, and rc.3 and rc.4 measured 690 and 649 ms. On its own re-run, every scenario passed with zero errors (notification burst p95 670 ms). The login spike p95 rose from about 1.1 s to 1.3–1.4 s because each sign-in now checks for a new browser; that is well inside its 3 s budget |
| Browser check | the age checkbox blocks sign-up until ticked; existing players see the rules again with the age rule first; Download my data returns the file; the Your data panel renders at phone width; no page errors |

### Before rc.5 goes to production

1. **Turnstile:** add a widget in Cloudflare for the game's hostnames, and set both keys on production and beta ([ADMIN-RUNBOOK.md → Bot check](ADMIN-RUNBOOK.md#bot-check-rc5)). Try a sign-up on beta.
2. **Emails on beta:** check that the new-browser and password-changed emails arrive.
3. The rc.3 and rc.4 steps still stand: set `TWO_FACTOR_KEY`, test two-step with a real phone, and give every admin a second factor.
4. **Then stop adding features.** Soak rc.5 on beta for a few days, run `qa:ui -- --strict` against beta and `ops:launch-check` on production, and go.

### Found on the beta deploy (fixed)

- **The built API crashed on start:** `Dynamic require of "fs" is not supported`.
  - **Cause:** rc.3 added the `qrcode` library, and the server build bundled it into its single ESM file. `qrcode` is CommonJS and loads Node modules at run time, which a bundled ESM file cannot do.
  - **Fix:** `qrcode` is now left out of the bundle (`--external:qrcode`), like the other runtime dependencies.
- **Why the gate missed it:** every test and the load test run the source through tsx; only the servers run the bundle. The gate now has **Built API starts**, which runs after the build.
  - It starts `apps/server/dist/index.js` on a scratch database, signs up, signs in and sets up two-step (which loads the QR library).
  - Checked both ways: without the fix it fails with the same error as beta; with it, it passes.
- The beta database was never at risk: the deploy took its backup and applied the migrations, and only the API process failed to start.

## rc.6

rc.6 gathers the fixes found while putting rc.5 on beta. It adds no features.

### What changed

- **The built API crashed on start:** a bundling bug with the QR-code library. It is fixed, and the gate now has **Built API starts**, which runs the built server itself.
- **Account settings:**
  - even 14 px spacing between every panel;
  - the sessions list shows five, then "Show all";
  - "Set a password by email" works with Turnstile on (a signed-in player asking about their own address skips the check) and explains who it is for.
- **Emails:**
  - one branded dark layout, with the favicon's emblem as the logo, a big button with a fallback link, a details table and "[Beta]" on beta;
  - `npm run email:preview` renders them without sending;
  - the log names the missing setting when email is not configured.
- **Console:** `npm run admin -- <name> --approve-beta`. `--off` keeps invite-only beta access, and `--reset-2fa` also forgets trusted browsers.
- **Sessions:** "last seen" is written at most once a minute per session instead of on every request. That removes a database write from nearly every request during play, and the idle expiry still slides.

### Results for rc.6

`npm run release:rc` on the rc.6 commit, 28 September 2026: **all gates passed.**

| Gate | Result |
| --- | --- |
| Typecheck, build, balance | pass |
| Unit tests | 130 files, 1,099 tests pass |
| Full PostgreSQL regression | 173 files, 1,376 tests pass |
| Bot, forum link and push | 3 files, 22 tests pass |
| Season One | 9 of 9 steps pass |
| Built API starts | the bundled server starts; sign-up, sign-in and two-step setup work through it |
| Backup and restore test | restored 77 tables and 988 rows, and every count matches |
| Load test (300 players) | every scenario passes with zero errors. Sustained play p95 156 ms (budget 500 ms); login spike p95 1.4 s (3 s); bursts drain in at most 10.6 s (12 s); season end 14.5 s (60 s) |

**Notification burst, watched.** This is 300 players opening the bell in the same instant, with a 750 ms p95 budget. Its results so far:

| Run | p95 |
| --- | --- |
| rc.3 | 690 ms |
| rc.4 | 649 ms |
| rc.5, first run | 761 ms |
| rc.5, re-run | 670 ms |
| rc.6, before the last-seen change | 766 ms |
| rc.6 | 738 ms |

- Within a run every request in the wave takes about the same time, so the number mostly tracks this shared machine's speed. Every scenario ran 5–10% slower on 28 September.
- Nothing since rc.4 adds work to that request.
- This is a stress case, well above what players do; the everyday polling budget has three times its headroom.
- If it misses on the production hardware's own test, look first at the bell query and the per-request session lookup.

## 1.0.0

`APP_VERSION` is `1.0.0`. Since rc.6, beta also has boss trips (Stages A–E; a season only has
them on a `classic-og-trips-*` ruleset), quest story content, Hideout v2 on the 0.8 rulesets,
the Rules page desktop fix, and the log-in page fix (the "are you human" check always shows
when the server wants it; nginx sends `Cache-Control: no-cache` on the page).

### Results for 1.0.0

`npm run release:rc` on beta, 29 September 2026.

| Gate | Result |
| --- | --- |
| Typecheck, build, balance (with the new trips gate) | pass |
| Unit tests | 132 files, 1,123 tests pass |
| Full PostgreSQL regression | pass, after one fix (below) |
| Bot, forum link and push | pass |
| Season One | pass |
| Built API starts | pass |
| Backup and restore test | restored 81 tables; every count matches |
| Load test (300 players) | see below |

- **Fixed: a test that expired.** The turf-cap alliance test built a season that ended at
  2026-09-29T00:00Z, and accepting an invite reads the real clock, so from that day it was
  refused as "round not playable". The test now keeps its own season running.
- **Fixed: trips work on every request.** Each read and action ran three queries to settle a
  boss trip and credit boss hits, even on seasons without trips. One `EXISTS` query now
  answers whether anything is due.
- **Load test.** This machine was slower than rc.6's (login spike p95 about 2.0 s against
  1.2 s). The code from before trips and 1.0.0 were run alternately, twice each, on the same
  machine:

  | p95 | before trips | 1.0.0 |
  | --- | --- | --- |
  | Sustained play: dashboard + bell | 272, 359 ms | 377, 239 ms |
  | Sustained play: actions | 428, 565 ms | 640, 383 ms |
  | Burst: scouts + produces (max, budget 12 s) | 12.1, 13.6 s | 14.9, 13.8 s |
  | Notification burst (budget 750 ms) | 719, 693 ms | 800, 855 ms |

  - The scouts and produces burst misses its budget before trips too, so it tracks the
    machine.
  - The notification burst request runs no trips code (the in-app inbox is unchanged). It
    was already the watched, borderline scenario at rc.6.
  - **Run `npm run qa:load-test` on the production hardware after the deploy.** Its numbers
    are the ones that count.
