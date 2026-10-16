# StreetsEmpire Android

Native Kotlin/Compose client for StreetsEmpire. It uses the existing JSON API as
its backend and retains the WebView game as a temporary fallback while native
screens reach full parity.

- Local, beta, and production build flavors
- Google Play monthly supporter subscription (`supporter_monthly`)
- Game and Discord OAuth stay in-app; other links open in the browser
- Native authentication and onboarding with a staged player-feature migration
- Native web scrolling without pull-to-refresh gesture interception; offline retry,
  file chooser, and WebView back history
- Bearer sessions for native screens; HTTPS outside local development

## Open and build

Requirements: Android Studio, Java 17, and an accepted Android SDK license.
Gradle can install the required Android SDK 36 platform automatically.

1. Open Android Studio → **Open** → select `android/`.
2. Let Gradle sync (AGP 8.13.2, Kotlin 2.0.21, Gradle 8.13).
3. Run on an API 26+ emulator or physical device.
4. Select the `localDebug`, `betaDebug`, or `productionRelease` build variant.

From `android/`, build each environment with:

```powershell
.\gradlew.bat :app:assembleLocalDebug
.\gradlew.bat :app:assembleBetaDebug
.\gradlew.bat :app:assembleProductionDebug
.\gradlew.bat :app:bundleProductionRelease
```

`local` uses `http://127.0.0.1:3001` through an ADB reverse tunnel to the API
server on the host. Start the server and create the tunnel before running from
Android Studio:

```powershell
npm run dev:server
adb reverse tcp:3001 tcp:3001
```

The reverse command must be repeated after restarting or reconnecting the
emulator/device.

The same setup works for a USB-connected physical device. To override the local
origin for a different development host:

```powershell
adb reverse tcp:3001 tcp:3001
.\gradlew.bat :app:assembleLocalDebug -PstreetsServerOrigin=http://127.0.0.1:3001
```

The flavors have distinct IDs (`.local` and `.beta` suffixes), so local, beta,
and production installs can coexist on one device. Cleartext traffic is enabled
only for the local flavor.

For Play distribution, use **Build → Generate Signed Bundle / APK** and keep the
release keystore outside the repository. The app targets SDK 36 and has
application ID `dev.streetsempire.app`.

## Native feature architecture

The native client is being migrated from the initial single-activity prototype
to feature-owned packages. New work belongs in this structure rather than adding
more gameplay code to `NativeAppActivity.kt` or `AuthRepository.kt`:

```text
app/src/main/java/dev/streetsempire/app/native/
  app/                  App state, root navigation, and adaptive shell
  core/
    model/              Shared wire and UI models
    network/            Authenticated transport and error mapping
    ui/                 Theme and reusable loading/error/form components
  feature/
    auth/               Registration, sign-in, 2FA, and recovery
    onboarding/         Email, rules, and season join gates
    dashboard/          Season and player overview
    actions/ economy/ crew/ travel/ turf/ hideout/
    combat/ casino/ progression/ social/ account/ supporter/
```

Each server-backed destination owns its route, repository, immutable UI state,
ViewModel, and composables. The Fastify API remains authoritative for rules,
mutation outcomes, balances, and supporter entitlement. Native code must not
predict or optimistically grant game rewards.

## Tests

Run these commands from `android/`:

```powershell
# JVM unit and MockWebServer repository tests
.\gradlew.bat :app:testLocalDebugUnitTest --no-daemon --no-build-cache

# Compose instrumentation tests on a running emulator/device
.\gradlew.bat :app:connectedLocalDebugAndroidTest --no-daemon --no-build-cache

# Compile every server environment
.\gradlew.bat :app:compileLocalDebugKotlin :app:compileBetaDebugKotlin :app:compileProductionDebugKotlin --no-daemon --no-build-cache

# Android lint
.\gradlew.bat :app:lintLocalDebug
```

From the repository root, verify that every player-facing web route is tracked
exactly once:

```powershell
node android/scripts/verify-parity-matrix.mjs
```

## Parity workflow and WebView fallback

`android/PARITY_MATRIX.md` is the release gate and catalog of every non-admin
route declared in `apps/web/src/App.tsx`. For each vertical slice:

1. Confirm its canonical native destination, API reads/writes, aliases, and edge
   states in the matrix.
2. Implement the repository, state holder/ViewModel, Compose screen, navigation,
   and contract/state/UI tests.
3. Verify loading, refresh, empty, blocking error, server validation, offline,
   accessibility, and back/deep-link behavior locally and on beta.
4. Update the matrix status only after the native destination provides the
   complete player flow; a placeholder or embedded web page does not count.
5. Remove that destination's fallback link only after its matrix checks pass.

`MainActivity` remains a temporary trusted gameplay WebView for incomplete
destinations and migration rollback. Debug and beta may retain it throughout
development. Production gameplay must not enter the WebView after the complete
matrix, device/accessibility checks, and Play Billing internal-track validation
pass. Admin/operations tools and intentionally external trusted handoffs remain
web-only and are outside native parity scope.

## Google Play supporter setup

1. Create the app in Play Console with package `dev.streetsempire.app`.
2. Create subscription product `supporter_monthly` and an active monthly base
   plan. The ID must match `GameConfig.SUPPORTER_PRODUCT_ID` and
   `GOOGLE_PLAY_SUPPORTER_PRODUCT_ID` on the server.
3. Link Play Console to a Google Cloud project. Create a service account, grant
   it the minimum Play Console subscription/order permissions, and base64-encode
   its JSON key into `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64` on the server.
4. Set one stable 32+ character `GOOGLE_PLAY_ACCOUNT_HASH_SECRET`. Never rotate
   it: it binds a Play purchase to the StreetsEmpire account that started it.
5. Create a Pub/Sub topic and push subscription for Real-time Developer
   Notifications. Set its HTTPS endpoint to
    `https://<live-host>/api/internal/google-play/rtdn`, enable authenticated push,
   and grant its push service account permission to invoke the endpoint. Set an
   explicit audience (normally the endpoint URL), then copy that exact value and
   the push service-account email into `GOOGLE_PLAY_RTDN_AUDIENCE` and
   `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`. The server verifies Google's OIDC
   signature, audience, verified email, package, product, and purchase state.
6. Upload a signed AAB to an internal test track. Add license testers and install
   from the Play test link; Billing does not behave like production for a
   sideloaded debug APK.

The Android client never grants rewards or acknowledges purchases itself. It
 sends the purchase token to the authenticated live server, which verifies the
product, package, account binding, and subscription state with Google before
recording payment or granting supporter rewards.

## Main files

```text
app/src/main/java/dev/streetsempire/app/
  MainActivity.kt          Temporary secure WebView and billing URL bridge
  GameConfig.kt            Flavor-selected origin, URL allow-list, and product ID
  PlayBillingManager.kt    Play Billing client; no local entitlements
  native/                  Native app/core/feature implementation

PARITY_MATRIX.md           Player-route parity and release evidence
scripts/verify-parity-matrix.mjs
                           Exact route-inventory verification
```

## Security notes

- Cleartext is disabled for beta/production and enabled only in local builds.
- JavaScript and DOM storage are enabled only in the temporary game WebView.
  Turnstile uses a narrowly scoped JavaScript bridge and never receives the
  bearer session token.
- Third-party cookies are disabled. The app never reads the live session cookie.
- Billing purchase tokens are verified by the authenticated server before any
  entitlement is granted; Android never exposes Stripe checkout.
