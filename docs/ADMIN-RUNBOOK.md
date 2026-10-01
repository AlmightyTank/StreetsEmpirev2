# Admin runbook (0.3.0-B)

Everything an admin does lives at `/game/admin` and is written to the audit log
with who, what, when, why, and the before and after snapshots. Nothing here
needs the seed script, a database client, or a deploy.

---

## Getting in

Admin is a flag on an account. The first one has to be set from the console,
and so does the one you set after locking yourself out:

```bash
npm run admin -- <username or email>
```

`--off` removes the flag, `--list` shows who has it, `--reason "why"` is saved
to the audit log with the change. Lookups take a pimp name or an email. Sign out
and back in for the admin menu to appear.

After that, admins make other admins from **Accounts → the account →
Make admin**. An admin cannot change their own role, and the last active admin
cannot be removed from the panel — the console command is the way back.

### Admin sign-in

Admin tools only open for a sign-in with a **second factor**:

- **Sign in with Discord.** Discord's own sign-in covers this, so turn on two-factor in Discord.
- **An authenticator code (rc.3).** The admin sets up an authenticator app in **Account settings → Two-step sign-in**, then signs in with a password and the app's code.

Signing in with only a password still works for playing, but the admin pages show "Admin tools need a second factor". This means a leaked admin password alone cannot reach the panel.

- **Adding a second factor to an admin.** A password-only admin session cannot add one. Otherwise someone with only the password could attach their own Discord or authenticator.
  - Easiest: log out and choose **Sign in with Discord**, using a Discord account whose verified email matches the game account. It links itself. From that Discord sign-in, the admin can also set up an authenticator.
  - Otherwise:
    1. run `npm run admin -- <name> --off`;
    2. the player links Discord or sets up an authenticator in Account settings;
    3. run `npm run admin -- <name>` again.
    `--off` also approves the account for an invite-only beta, so it can still sign in there. To let any account into the beta from the console, use `npm run admin -- <name> --approve-beta`.
- **Unlinking Discord.** An admin can unlink Discord only when an authenticator is set up, and only from a sign-in that used its code.
- **Lost phone (admin).** Another admin uses **Accounts → the account → Turn off two-step sign-in**. If there is no other admin, run `npm run admin -- <name> --reset-2fa --reason "why"` on the server. The admin then signs in with Discord or sets the authenticator up again.
- **Checking.**
  - `npm run admin -- --list` shows each admin's Discord and authenticator.
  - `npm run ops:launch-check` fails if no admin has a second factor, and warns for each admin without one.
- **Setting.** `REQUIRE_ADMIN_2FA` controls this. It is on by default in production and beta, and off in development and test. The rc.2 name, `REQUIRE_ADMIN_DISCORD`, is still read when `REQUIRE_ADMIN_2FA` is unset.

### Sign-in and sessions (rc.4)

These follow what most online games and big sites do.

| | Kept signed in (default) | Not kept (shared computer) |
| --- | --- | --- |
| Cookie | Stays for up to 90 days | Ends when the browser closes |
| Idle timeout | 30 days without a visit (`SESSION_TTL_DAYS`) | 12 hours (`SESSION_SHORT_HOURS`) |
| Renews while used | Yes | Yes |
| Hard end, however active | 90 days after sign-in (`SESSION_MAX_DAYS`) | 90 days after sign-in |

- **Two-step code.** Players with two-step on are asked for the code at every new sign-in. On the code screen, **Trust this browser for 30 days** (`TRUSTED_DEVICE_DAYS`, ticked by default) skips the code on that browser; the password is still needed.
  - Forgetting trusted browsers: changing or resetting the password, turning two-step off, or a staff reset forgets them all. Players can also forget any of them in Account settings.
  - A trusted browser never counts for admin tools.
- **Admins.** Admin tools need a second factor proved in the last 12 hours (`ADMIN_2FA_MAX_AGE_HOURS`): a Discord sign-in or an authenticator code.
  - After that, the admin page asks for the code in place, without signing out. With no authenticator, the admin signs in with Discord again.
- **Guessing.** Codes entered while signed in (turning two-step off, new recovery codes, admin re-confirm) are limited too: five wrong codes sign that session out.
- **Sensitive changes** still ask for proof on the spot:
  - changing the password and closing the account: the password;
  - turning two-step off and making new recovery codes: a code;
  - unlinking Discord: the password.
- **Sessions list.** Account settings lists every session: how it signed in, whether it is kept, and when it ends. Players can sign any of them out.

### Two-step sign-in for players (rc.3)

Any player can turn on two-step sign-in in **Account settings → Two-step sign-in**:

1. The player scans a QR code with an authenticator app (Google Authenticator, Authy, 1Password, Microsoft Authenticator...).
2. They confirm one code.
3. They save ten one-use recovery codes.

From then on, every sign-in asks for a code: password, Discord and password-reset links alike.

- **Emails.** The player is emailed whenever two-step is turned on or off, reset, or given new recovery codes.
- **Guessing.** Five wrong codes end a sign-in attempt. A code can never be used twice.
- **Lost phone and codes.** Once you are sure it is them (for example, the Discord account they play with, or the email on the account), use **Accounts → the account → Turn off two-step sign-in** with a reason. The reset is audited and the player is emailed. They can then sign in with their password and set it up again.
- **`TWO_FACTOR_KEY` (set it before launch).** Authenticator secrets are stored encrypted with `TWO_FACTOR_KEY`.
  - Generate it once with `openssl rand -base64 48`, and put it in production's `.env` before anyone enrols. Beta needs its own key.
  - **Never change it.** A new key makes every enrolled authenticator stop working, and each player would need a reset.
  - Without it, the key is derived from `SESSION_SECRET`, so rotating that would break authenticators.
  - `ops:launch-check` fails if accounts are enrolled and no key is set.

---

## Running a season

A season moves through five states. Each step is a button on **Rounds**, and
each one is audited.

| Step | What it does | When |
| --- | --- | --- |
| **Schedule round** | Creates the round `SCHEDULED` with a name, ruleset, start, end and optional registration date. | Whenever the next season is decided. |
| **Open registration** | `REGISTRATION`: players can join and build, the clock has not started. | A day or two before the start. |
| **Start** | `ACTIVE`: the season is live. | At the start time. |
| **End early** | Closes the round now: final net worth and ranks are frozen and awards apply. Needs a reason. | Only when a season has to stop ahead of its end date. |
| **Archive** | `ARCHIVED`: it leaves the current-round lookups and stays in the hall of fame. | Once the next season is live. |

Notes that matter:

- **Rounds close themselves.** The first request after `endsAt` closes the round
  inside one transaction. **Close expired rounds now** on the panel does the same
  thing without waiting for a visitor.
- **Starting behind a live round is refused.** If a newer round is already live,
  the panel says so instead of starting a second one. If the round you are
  starting would replace the live one, it asks you to confirm the handoff — that
  checkbox is the whole safety net, so read the warning.
- **Editing details.** Name, start, end and registration date can be changed from
  the round page while the round is unfinished. A finished round is frozen.
- **Round health** on the round page shows joins, active players, battles and
  the richest players, which is usually enough to tell a quiet round from a
  broken one.

---

## Moderation

All of this is on **Accounts**, then the account.

- **Sign out everywhere** ends every session. They can log straight back in.
  Use it for a shared or stolen session.
- **Suspend** is the cool-off: pick a length, give a reason. They are signed out
  now, refused at login until it passes, and shown the reason and the end date.
  It lifts itself, so nobody has to remember. **Lift suspension** ends it early.
  Admins cannot be suspended — remove the role first.
- **Deactivate** is the permanent one: signs them out, blocks login, and hides
  them from rankings and raid lists until an admin reactivates them.
- **Rename** changes their pimp name everywhere, archived rounds included.
- **Reset profile** clears a crew name, title, featured badges and accent that
  broke the rules, without touching anything they earned. The previous crew
  name is kept in the audit detail.

Every one of these needs a reason of at least five characters. Suspension
reasons are shown to the player; the rest are for the audit log.

### Messaging moderation (0.9.0-H)

- **Mute messaging** stops private messages, Alliance Wire posts and forum
  recruitment threads, for 1 hour up to 30 days or permanently. The player keeps
  playing and sees a notice beside Compose. Timed mutes lift themselves;
  **Lift messaging mute** ends one early. Admins cannot be muted.
- **Add note** keeps a private note on the account for other admins. Players
  never see notes. Each one is audited.
- The account page shows the open and total reports against that player's
  messages.

### Reports queue

**Reports** lists player reports and automated spam flags, oldest open first.
The queue never shows message text. **Open** reveals the reported message and at
most five messages before it and two after it, from that one conversation, and
records a `report.view` audit entry every time. There is deliberately no way to
browse a conversation nobody reported.

Resolve with **Action taken** or **Dismiss** plus a note. That closes every open
report and flag on the same message and keeps the decision in **Resolved**.
Punishment is a separate step on the sender's account (mute, suspend,
deactivate), so resolving never quietly punishes anyone.

### Bug reports (rc.2)

Players send bugs from **Report a bug**, which is in the game menu and the footer. Each report lists the kind of problem, a summary, what happened, and the page they came from. The pimp name, browser and game version go with it automatically. A player can send five an hour.

**Bug reports** in the admin menu lists open reports, oldest first. Resolve each one as **Fixed**, **Not a bug / won't fix** or **Duplicate**, with a note. The decision is kept under **Resolved** and in the audit log (`bug-report.resolve`). A report from a player who says someone else is cheating belongs on their account or in **Reports**, not here.

Automated flags come from messages with outside links, and from the same text
sent to three or more players within an hour. They are hints, not verdicts: most
links are harmless, so dismiss freely.

Players also have their own tools: block (both ways, never revealed), mute (the
muted player's mail arrives quietly in Archived) and delete conversation (their
side only; reports keep the evidence).

---

## Getting players in

Two steps stand between a new account and the game. Admins are never stopped by either.

1. **Verify the email, or use Discord.**
   - New players verify the email they signed up with. Signing in with Discord (or linking it) counts too, since Discord only hands over verified emails.
   - **Grandfathered accounts.** Every account that existed when this rule shipped was grandfathered by the migration (`verificationGrandfatheredAt`), so existing players never see this step.
   - **While unverified**, players can still sign in and use account settings. The game shows a "Verify your email to play" screen, which lets them:
     - resend the link (at most once a minute);
     - fix a mistyped address (it changes at once, and old links stop working);
     - continue with Discord.
2. **Accept the rules.**
   - On their first visit, every player (existing ones included) gets a rules dialog. It cannot be closed; they either accept or sign out.
   - The text lives in `packages/shared/src/rules-agreement.ts`. Change it and bump `RULES_VERSION`, and everyone is asked to accept again.
   - Acceptance is stored on the account (`rulesAcceptedAt`, `rulesAcceptedVersion`).

**"I never got the email."**

1. Check `RESEND_API_KEY` and `EMAIL_FROM` are set, and look for `email verification message failed` in the API log.
2. Ask them to check spam, fix the address, or use Discord.
3. If you are satisfied the address is theirs, **Accounts → the account → Mark email verified** lets them in.

**Email that arrives (do this before launch).** Verification and recovery links come from Resend. Many inboxes send unauthenticated mail straight to spam, so verify your sending domain in Resend before launch:

1. In the Resend dashboard, go to **Domains → Add domain**. Use the domain in `EMAIL_FROM` (for example `streetsempire.dev`).
2. Add the DNS records Resend lists at your DNS host: the **SPF** TXT record, the **DKIM** records and the MX record for the bounce subdomain.
3. Add a **DMARC** record if you have none. `v=DMARC1; p=none; rua=mailto:<you>` is a safe start.
4. Wait for Resend to show the domain as **Verified**.
5. Send yourself a sign-up link, and check that Gmail's "Show original" says SPF, DKIM and DMARC **PASS**.

`EMAIL_FROM` must use that verified domain, and `RESEND_API_KEY` must be a key for the same Resend account.

**Age (rc.5).** Players must be 13 or older.
- Sign-up has an "I am 13 or older" checkbox, recorded as `ageConfirmedAt`.
- The rules agreement's first item says the same. Changing the agreement asked every existing player (Discord sign-ups included) to accept it again.
- If you learn a player is under 13, delete the account (**Accounts → the account → Delete account**) and note why. The terms and privacy page say so.

**Security emails (rc.5).** Players are emailed when their password is changed or reset, and when their account signs in from a browser it has not used before.
- **Recognising browsers:** each browser gets a random `se_device` id cookie.
- **When there is no email:** the first browser an account is seen on (at sign-up, or the first sign-in after rc.5) is recorded without one.
- **No new setup:** these go out through Resend like the other emails.

**Data requests (rc.5).**
- **Download my data** in Account settings is a JSON file with the account, sessions, seasons, messages, contacts, reports and bug reports. It never includes the password hash, two-step secrets or staff notes.
- **Delete my account** in Account settings:
  - it erases the email, sign-in details, profile and settings;
  - an account that played a season is anonymized to "Deleted Player", so the history stays whole;
  - one that never played is removed entirely;
  - it is logged as `account.self-delete`.
- Staff deletion (**Accounts → Delete account**) does the same.
- If someone asks for their staff notes, those are in the account page.

### Bot check (rc.5)

Cloudflare Turnstile guards the password sign-in form (from rc.6), sign-up and password recovery. It is off until both keys are set. "Log in with Discord" goes through Discord's own checks instead, and the two-step code screen follows a sign-in that already passed.

1. In the Cloudflare dashboard, open **Turnstile → Add widget**. Add the game's hostname (for example `play.streetsempire.dev`), plus beta's hostname in a separate widget or the same one. Choose **Managed** mode.
2. Put the keys in `.env`: `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Restart the API.
3. Open the sign-up page and check that the widget shows and that registering works.

If Cloudflare cannot be reached, password sign-in, sign-up and recovery are refused with a "try again in a minute" message rather than let through unchecked. Discord sign-in is not affected. `ops:launch-check` warns while it is off.

**Sign-up flood cap.** One network (IP address) may create `SIGNUP_DAILY_LIMIT_PER_IP` accounts a day. The default is 5 on production and beta, and 0 (off) elsewhere.
- Past the cap, sign-up is refused with "Too many accounts have been made from this network today", and a **Sign-up flood** exploit flag appears under **Combat & exploits**. The flag names the network by an opaque key, never the address.
- Signing in with Discord is not capped.
- Raise the cap if a school or event shares one address.

**Closing accounts.** Players close their own account at the bottom of Account settings. They confirm it with their password (a Discord sign-in needs none) and by typing CLOSE.
- Closing signs them out everywhere, and sign-in then says "You closed this account".
- It is recorded in the audit log as `account.self-close`.
- To reopen, use **Accounts → the account → Reactivate**. This also clears the closure.
- Admin accounts cannot be closed this way.

**Settings.** `REQUIRE_VERIFIED_EMAIL` and `REQUIRE_RULES_ACCEPTANCE` switch each step. Both are on by default in production and beta, and off in development and test. `npm run ops:launch-check` counts accounts still waiting to verify.

## Moderation process (1.0)

The ladder, from lightest to heaviest. Use the lightest step that stops the problem. Every step records a reason in the audit log.

| Situation | Step | Where |
| --- | --- | --- |
| A first, minor breach (rude message, borderline name) | Warn them by direct message; **Reset profile** or **Rename** if a name or profile breaks the rules | Accounts → the account |
| Harassment or spam in messages or on a wire | **Mute** their messaging for a set time; remove the wire post | Accounts → the account → Mute messaging; Alliances → Wire |
| Repeated breaches, or an exploit used on purpose | **Suspend** for a set time (they see the reason and the end date); **void** the fights or **correct** what the exploit produced | Accounts → the account → Suspend; the player page → Void / corrections |
| Cheating that continues, several accounts one person uses together, serious abuse | **Ban** (permanent until lifted; they see the reason at sign-in) | Accounts → the account → Ban |
| The player asks for their account to be closed (Privacy page) | **Deactivate** with the reason "closed at the player's request" | Accounts → the account → Deactivate |

- **Reports queue.**
  - Look at **Reports** at least once a day during a season.
  - Open a report before you act on it, so other admins can see it is being handled.
  - Resolve it with what you did. The reporter's evidence stays with the report.
- **Exploit flags.**
  - Check **Combat & exploits → Exploit flags** daily. The server raises a flag when it refuses a write, a player-state invariant fails, someone attacks a linked account, an action id is replayed, or rate limits are hit 30 times in a day.
  - Close each flag as **dismissed** (noise) or **actioned** (you did something), with a note.
  - A critical flag (a state guard or an invariant) is a bug report as well: tell the developer.
- **When the game itself is wrong.**
  - If a bug is actively handing out value, **pause the season** (Rounds → Pause). Nobody loses time.
  - Fix the bug or correct the affected players, then resume. Resuming moves the end back by the pause.
  - If players must be kept out entirely, use maintenance mode instead ([RECOVERY.md](RECOVERY.md#maintenance-mode)).
- **Consistency.**
  - Two admins should agree before a ban, unless the case is plain cheating with evidence in the flags or signals.
  - Post a short public news item when an action affects a season's standings (voids, corrections, disqualifications).



1. **Find the player.** Accounts → **Find a player** takes a pimp name or a
   public id (`#1042`) and opens the inspector. You do not need the account.
2. **Read the inspector.** It shows stored state — cash, crew, supplies,
   weapons, timers, hideout, reputation — plus the last 50 activity entries and
   every battle. It never settles the player, so opening it cannot regenerate
   turns or change what they see.
3. **Void the battle** if a fight should not have counted. It reverses what the
   report recorded, limited to what the side that gained it still has (a
   shortfall is reported rather than pushing anyone negative), takes back that
   battle's wounds that are still healing, refunds the attacker's turns up to the
   cap, rewrites ranks, and stops the battle counting for revenge, trophies,
   repeat-target limits, stats and the raid feed. Both players see it in their
   feed. You cannot void a battle you were in, and finished rounds are refused.
   **This cannot be undone.**
4. **Grant compensation** for something a void cannot fix — a bug that ate a
   purchase, say. Turns never go past the round's cap, cash and items have fixed
   ceilings, and weapons are refused until the player has unlocked them. The
   player sees the reason in their activity feed.

Voids and grants only work while a round is live. Once standings are frozen,
both are refused on purpose.

---

## Multi-account signals

**Signals** groups accounts that shared a network in the last 30 days, from
session, verification and reset records. It shows an opaque per-server key, a
coarse device label ("Chrome on Windows") and why the group formed: same
network, same browser, or created within 30 minutes of each other.

It never shows an IP address or a raw browser string, and a match is not proof —
households, schools and phone carriers share networks. Treat it as a reason to
look at the players' behaviour, never as a verdict on its own.

---

## News, banners and integrations

- **News & banner**: write, pin, edit and delete news; optionally mirror a post
  to the forum announcements category (needs `FORUM_API_KEY` and
  `FORUM_NEWS_TAG_ID`), with a retry button when the forum call failed. A site
  banner takes a message, a tone and an end date, and shows on every page until
  it ends or you end it.
- **Integrations**: Discord queue status and a role resync request (needs
  `DISCORD_BOT_API_TOKEN` on both the server and the bot), email verification
  tools, forum link tools, and dev bots for local testing. Dev bots are refused
  in production and against a non-local database, with no override in the panel.
- **Rulesets**: a read-only view of any pinned ruleset, with a compare mode that
  shows only what changed between two of them.

---

## Audit log

**Audit log** filters by actor, action, target and date range. Every entry keeps
the reason and the full before and after snapshots, so "who changed this and
why" is always answerable. Console actions appear as `console:<os user>`.

**Download CSV** saves exactly the rows the filters are showing, newest first,
up to 10,000 of them, with the before and after snapshots as JSON columns. It
opens in a spreadsheet: cells that start with `=`, `+`, `-` or `@` are quoted so
nothing is treated as a formula.

**Retention** is `ADMIN_AUDIT_RETENTION_DAYS` on the server, a year by default,
and `0` keeps everything forever. Nothing is deleted on a timer: the panel shows
how many entries are past the window and an admin presses **Purge**, which needs
a reason and writes its own record of how many rows went and where the cutoff
was. Purge records are never purged, so a gap in the history always has an entry
explaining it. Export before purging if the rows still matter.

---

## Local commands

| Command | What it does |
| --- | --- |
| `npm run admin -- <username or email>` | Grant admin (`--off`, `--list`, `--reason`). |
| `npm run db:seed` | Idempotent seed. **It creates its own current round**, so do not run it against a database with a live season you care about. |
| `npm run db:seed:dev-bots` | Add local dev bots to the current round (`SEED_DEV_BOTS=1`). |
| `npm run db:dev-bots:status` | Show dev bot accounts and whether they are in the current round. |
| `npm run db:cleanup:seed-rivals` | Remove every dev bot account. |

The seed and the panel create dev bots from the same definition
(`apps/server/src/services/dev-bots.service.ts`), so the two cannot drift.
