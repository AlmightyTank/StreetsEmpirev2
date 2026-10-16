# Android Player-UI Parity Matrix

This is the release gate for replacing the player-facing WebView with native
Compose screens. Its source of truth is the non-admin route declarations in
`apps/web/src/App.tsx`. Admin and operations routes intentionally remain web-only.

## Status legend

- **Native** — the current Android app implements the route's player flow.
- **Partial native** — useful native behavior exists, but the complete web contract does not.
- **Placeholder + WebView** — Android exposes a staged destination and the WebView remains the usable path.
- **WebView only** — no dedicated native destination exists yet.
- **Alias pending** — the web route redirects to another canonical destination; native routing must preserve that behavior.
- **Public pending** — unauthenticated/public native presentation is not implemented.

`R` lists authoritative reads. `W` lists mutations. Endpoint names are relative
to `/api`; the named module is in `apps/web/src/api/`.

## Route inventory

| Source declaration | Canonical native destination | API module and endpoints | R | W | Required edge states | Current Android status |
|---|---|---|:---:|:---:|---|---|
| `/` | App entry resolver | `auth.ts`: `/auth/me`; `rounds.ts`: `/rounds/current`; profile settings | Y | — | booting, maintenance, guest, onboarding, joined, expired session | Partial native |
| `/register` | Auth / Sign up | `auth.ts`: `/auth/register`; `platform.ts`: `/meta` | Y | Y | Turnstile unavailable/single-use, invalid fields, approval required, network error | Native |
| `/login` | Auth / Sign in | `auth.ts`: `/auth/login`, `/auth/2fa/verify`; `platform.ts`: `/meta` | Y | Y | invalid credentials, Turnstile, 2FA/recovery code, approval, offline | Native |
| `/forgot-password` | Auth / Forgot password | `auth.ts`: `/auth/password/forgot` | — | Y | privacy-preserving success, invalid email shape, rate limit, offline | WebView only |
| `/reset-password` | Auth / Reset password | `auth.ts`: `/auth/password/reset` | — | Y | valid/expired/invalid token, password mismatch, 2FA, app-link rejection | WebView only |
| `/verify-email` | Onboarding / Email verification | `auth.ts`: `/auth/email/verify`, `/auth/email/verify/request`, `/auth/me` | Y | Y | valid/expired/used token, resend cooldown, app-link rejection, already verified | Partial native |
| `/account` | Account hub | `auth.ts`: account/profile/email/username/password/sessions/2FA endpoints; `forum.ts` | Y | Y | re-authentication, destructive confirmation, cooldowns, session revoked, offline | Placeholder + WebView |
| `/account/forum-link` | Account / Forum link | `forum.ts`: forum identity/link endpoints | Y | Y | already linked, account conflict, OAuth failure/cancel, external handoff | WebView only |
| `/join` | Onboarding / Join season | `rounds.ts`: `/rounds/current`, `/rounds/current/join` | Y | Y | unverified, rules pending, no active round, non-joinable, already joined | Native |
| `/game` | Authenticated game graph | bootstrap via `auth.ts`, `game.ts`, `rounds.ts`, `notifications.ts` | Y | — | loading, maintenance, invalid session, onboarding gate, round over | Partial native |
| `index@/game` | Dashboard | `game.ts`: `/game/me`, `/game/experience`, `/game/presence/heartbeat`; notifications | Y | Y | active/paused/pending/completed round, no player, alerts, stale/offline | Partial native |
| `combat` | Combat | `combat.ts`, `ring.ts`: combat status/targets/history/actions | Y | Y | unavailable ruleset, cooldown, invalid target, stale target, uncertain action | Placeholder + WebView |
| `scout` | Street / Scout | `actions.ts`: `/game/districts`, `/game/scout`, `/game/encounters/:id/resolve` | Y | Y | insufficient turns/crew, blocked district, encounter, stale/uncertain result | Placeholder + WebView |
| `quests` | Street / Quests | `quests.ts`: quest list, accept, track, abandon, auto-accept, claim | Y | Y | unavailable/expired, capacity, progress, claim conflict, server validation | Placeholder + WebView |
| `events` | Street / Events | `game.ts`/event routes: event feed and supported responses | Y | Y | empty, expired, unavailable response, pagination, contextual navigation | Placeholder + WebView |
| `xp-progress` | Progression / Experience | `game.ts`: `/game/experience` | Y | — | no events, pagination/history, max/current level, account without season | Placeholder + WebView |
| `surveys` | News / Surveys anchor | `surveys.ts`: active survey, response/status endpoints | Y | Y | no active survey, already answered, closed, validation, alias restoration | Alias pending |
| `hideout` | Progression / Hideout | `hideout.ts`: hideout, upgrade, specialization, weapon priority | Y | Y | max level, locked branch, affordability, timer, ruleset unavailable | Placeholder + WebView |
| `products` | Stores / Pip's | `stores.ts`: stores and `pip` detail/trades | Y | Y | alias restoration, store unavailable, optional-products ruleset | Alias pending |
| `produce` | Street / Production | `actions.ts`: `/game/produce-crack` | Y | Y | invalid turns/product, insufficient resources, optional products, uncertain result | Placeholder + WebView |
| `street-pass` | Progression / Street Pass | `streetPass.ts`: progress and claim endpoints | Y | Y | disabled pass, locked/claimed tier, season transition, duplicate claim | Placeholder + WebView |
| `collection` | Progression / Collection | collection/community read endpoints | Y | — | empty, locked/unknown items, account without active season | Placeholder + WebView |
| `supporter` | Account / Supporter | `supporter.ts`: status, `/supporter/google-play/verify`, polls/listing/release credit | Y | Y | product unavailable, pending/cancelled purchase, restore, RTDN delay, no Stripe | Placeholder + WebView |
| `stores` | Economy / Stores | `stores.ts`: store index/catalog | Y | — | empty/unavailable catalog, ruleset variation, loading/offline | Placeholder + WebView |
| `stores/:slug` | Economy / Store detail | `stores.ts`: detail, trade, checkout, special order | Y | Y | bad slug, quantity/cart validation, affordability, uncertain checkout | Placeholder + WebView |
| `supply` | Economy / Supply | `supply.ts`: supply state, orders, work/history | Y | Y | limits, timing, cost, empty history, system unavailable, uncertain result | Placeholder + WebView |
| `holdings` | Economy / Holdings | `holdings.ts`: holdings overview and supported business actions | Y | Y | no holdings, inactive business, timers/income, stale mutation | Placeholder + WebView |
| `loans` | Economy / Loans | `loans.ts`: offers, current loan, accept, payment | Y | Y | no offers, affordability, overdue/current balance, server rejection | Placeholder + WebView |
| `dealers` | Crew / Dealers | `dealers.ts`: roster, assign, release, runner reserve, production | Y | Y | empty roster, assignment limits, totals mismatch, unavailable ruleset | Placeholder + WebView |
| `crew` | Crew / Roster | `crew.ts`: roster, staffing, training, assignment, jobs, movement | Y | Y | filters/empty, limits, costs, timers, cross-screen refresh | Placeholder + WebView |
| `casino` | Casino lobby | `casino.ts`: lobby, games, balances/limits, tournament summary | Y | — | disabled casino/game, limits, no games, responsible-play messaging | Placeholder + WebView |
| `casino/:game` | Casino game | `casino.ts`: selected game state and wager endpoints | Y | Y | invalid game, wager validation, insufficient funds, uncertain wager, result history | Placeholder + WebView |
| `travel` | World / Travel | travel routes in `game.ts`: destinations, travel/run/move actions | Y | Y | already moving/on run, destination locked, cost/turns, arrival timer | Placeholder + WebView |
| `turf` | World / Turf | turf routes in `crew.ts`/`game.ts`: map, holdings, post/move/actions | Y | Y | no turf, conflict/stale owner, staffing limits, ruleset unavailable | Placeholder + WebView |
| `blocks` | World / Turf | same as `turf` | Y | Y | alias restoration plus all Turf states | Alias pending |
| `cities` | World / Travel | same as `travel` | Y | Y | alias restoration plus all Travel states | Alias pending |
| `rankings` | Discovery / Rankings | public/community ranking endpoints | Y | — | empty, ties, pagination, city/national filters, season transition | Placeholder + WebView |
| `round-archive` | History / Round archive | `rounds.ts`: `/rounds/aftermath/archive` | Y | — | feature disabled redirect, preparing/unavailable report, search/filter/pagination | Public pending |
| `rounds/:roundId/aftermath` | History / Round aftermath | `rounds.ts`: aftermath overview/categories/cities/alliances/me/records/leaderboards | Y | — | invalid round, preparing/unavailable, anonymous vs personal data, pagination | Public pending |
| `alliance` | Social / Alliance hub | `alliances.ts`: membership, applications/invites, management, rankings | Y | Y | no alliance, pending invite/application, permissions, full/disbanded alliance | Placeholder + WebView |
| `alliances` | Social / Alliance rankings | `alliances.ts`: rankings/list | Y | — | alias anchor restoration, empty/pagination, season transition | Alias pending |
| `contacts` | Social / Players contacts | `community.ts`/`playing-together.ts`: contacts and relationship actions | Y | Y | alias anchor restoration, empty list, blocked/private/deleted player | Alias pending |
| `console` | Social / Console | `console.ts`: feed/activity and supported post/action endpoints | Y | Y | empty, pagination, moderation removal, rate limit, reconnect/refresh | Placeholder + WebView |
| `players` | Discovery / Players | `community.ts`: player search/list/profile/contact data | Y | Y | empty search, pagination, privacy/block state, stale/deleted player | Placeholder + WebView |
| `alliances/:tag` | Social / Alliance detail | `alliances.ts`: public detail/roster and eligible relationship actions | Y | Y | invalid tag, dissolved/private alliance, pagination, permission changes | Placeholder + WebView |
| `hall-of-fame` | History / Hall of Fame | `site.ts`/public ranking-history endpoints | Y | — | empty categories, unavailable history, loading/offline | Public pending |
| `profile` | Account / Public profile editor | `community.ts`, `auth.ts`: own profile and profile settings | Y | Y | incomplete profile, validation, privacy settings, no active player | Placeholder + WebView |
| `forum/:forumUserId` | Social / Forum profile | `forum.ts`/`community.ts`: linked forum identity and profile | Y | — | invalid/unlinked user, external forum handoff, privacy/moderation | Placeholder + WebView |
| `players/:publicPimpId` | Discovery / Player profile | `community.ts`: player profile, contact/report actions | Y | Y | invalid/deleted/private player, self profile, block/report state | Placeholder + WebView |
| `activity` | Social / Console activity view | `console.ts`: activity feed | Y | — | alias query restoration, empty/pagination, removed entries | Alias pending |
| `news` | Information / News | `rounds.ts`: `/rounds/current/news`; `surveys.ts` | Y | Y | no news, survey anchor, closed survey, public/account presentation | Public pending |
| `status` | Information / Game status | `rounds.ts`: `/rounds/current/status`; platform health metadata | Y | — | maintenance, paused/pending/completed round, partial outage, stale data | Placeholder + WebView |
| `rules` | Information / Rules | `platform.ts`: `/meta` rules agreement plus ruleset/public content | Y | — | unavailable metadata, version change, long text/accessibility | Partial native |
| `report-bug` | Support / Report bug | `auth.ts`: `/support/bug-reports` | — | Y | validation, attachment/context limits, rate limit, success reference, offline | Placeholder + WebView |
| `reputation` | Street / Quests contact standing | `quests.ts`: quest/contact-standing reads and actions | Y | Y | alias anchor restoration, no contacts, locked standing/reward | Alias pending |
| `*` | Not found / safe recovery | none | — | — | unknown/deprecated/deep link, signed-out vs signed-in recovery | WebView only |

## Current native baseline

| Area | Current behavior | Evidence | Classification |
|---|---|---|---|
| App entry | `NativeAppActivity` is the launcher and chooses auth, onboarding, or game from the stored bearer session. | `AndroidManifest.xml`, `NativeAppActivity.kt` | Implemented native foundation |
| Registration | Native sign-up collects pimp name, email, password confirmation, explicit 16+ declaration, and Turnstile token. | `NativeAppActivity.kt`, `AuthRepository.kt` | Implemented native flow |
| Sign-in | Native password sign-in supports Turnstile and transitions into a native two-factor code challenge when required. | `NativeAppActivity.kt`, `TurnstileChallenge.kt`, `AuthRepository.kt` | Implemented native flow |
| Session storage | The raw bearer token is held in Android encrypted preferences and attached to API requests; logout clears it even if the request fails. | `TokenStore.kt`, `ApiClient.kt`, `AuthRepository.kt` | Implemented native flow |
| Account recovery | Forgot/reset password and verified app-link routing do not yet have native screens. | No native destination or manifest app-link filters | WebView only |
| Onboarding | Native Verify → Rules → Join flow can resend verification, fetch/render the current server agreement, require acceptance, and join the current season with New York City presented as the fixed start. | `OnboardingScreen.kt`, `AuthRepository.kt`, `ApiModels.kt` | Implemented native flow; token deep-link verification pending |
| Dashboard | Native screen reads `/game/me` and presents identity, season, net worth, and turns; full resources, timers, alerts, activity, and round-state treatment are missing. | `NativeAppActivity.kt` | Partial native |
| Gameplay navigation | Nine broad section cards display endpoint guidance rather than feature UI. | `FULL_PARITY_SECTIONS` in `NativeAppActivity.kt` | Placeholder |
| WebView | `MainActivity` still hosts the configured server game and Play Billing URL bridge. It is retained as the broad gameplay fallback, not evidence of native parity. | `MainActivity.kt`, `GameConfig.kt` | Temporary fallback |
| Environments | Product flavors isolate Local (`127.0.0.1:3001`, cleartext, `.local`), Beta (`beta.streetsempire.dev`, `.beta`), and Production (`play.streetsempire.dev`, release package). Local supports a Gradle origin override and ADB reverse. | `android/app/build.gradle.kts`, `GameConfig.kt`, `android/README.md` | Implemented build behavior |
| Google Play Billing | `PlayBillingManager` can connect, query `supporter_monthly`, purchase, restore, and emit bridge events. The server verifies entitlement. No lifecycle-aware Compose gateway or complete native Supporter UI exists yet. | `PlayBillingManager.kt`, `MainActivity.kt` | Engine implemented; native UI placeholder |
| Debug preview | Debug auth UI can enter a sample dashboard without a server; this is development-only and never counts as route parity. | `BuildConfig.DEBUG` path in `NativeAppActivity.kt` | Debug aid |

The current launcher therefore has native registration, password sign-in,
Turnstile, two-factor verification, bearer-token storage, logout, the Verify →
Rules → Join onboarding sequence, environment-specific origins, and a small
dashboard summary. Gameplay section cards remain placeholders. `MainActivity`
remains the broad site fallback until each route row passes its parity tests.

No route marked **Placeholder + WebView**, **WebView only**, **Alias pending**,
or **Public pending** may lose its fallback before its mapped read, mutation,
edge-state, navigation, and accessibility checks pass.

## Verification

Run from the repository root:

```powershell
node android/scripts/verify-parity-matrix.mjs
```

The verifier compares this table against `apps/web/src/App.tsx`, excludes
`admin/**`, and fails on a missing, duplicate, or extra player route declaration.
