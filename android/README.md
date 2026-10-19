# StreetsEmpire Android

Native Kotlin WebView wrapper for the StreetsEmpire web game. The Android
project has separate production and beta variants; it uses the existing web
client and server rather than shipping a second copy of the game.

- Live server only
- Google Play monthly supporter subscription (`supporter_monthly`)
- Game and Discord OAuth stay in-app; Discord's explicit mobile-app handoff
  links open Discord Mobile and return to the in-app OAuth flow
- Two-finger pull-to-refresh, reload, offline retry, file chooser, and WebView back history
- HTTPS only and first-party cookie sessions

## Open and build

Requirements: Android Studio, Java 17, Android SDK 36.

1. Open Android Studio → **Open** → select `android/`.
2. Let Gradle sync (AGP 8.7.3, Kotlin 2.0.21, Gradle 8.9).
3. Select `betaDebug` for device testing, or `productionRelease` for Play.
4. Run on an API 26+ emulator or physical device.

Build variants:

| Variant | URL | Package | Purpose |
| --- | --- | --- | --- |
| `betaDebug` | `https://beta.streetsempire.dev` | `dev.streetsempire.app.beta` | Local/internal beta testing |
| `productionRelease` | `https://play.streetsempire.dev` | `dev.streetsempire.app` | Google Play testing/release |

Debug APK: `app/build/outputs/apk/beta/debug/app-beta-debug.apk`

For Play distribution, keep the release keystore outside the repository. Gradle
uses these local-only variables when building the release bundle:

```powershell
$env:ANDROID_RELEASE_STORE_FILE = 'C:\secure\streets-empire-upload.jks'
$env:ANDROID_RELEASE_STORE_PASSWORD = 'your-keystore-password'
$env:ANDROID_RELEASE_KEY_ALIAS = 'streets-empire-upload'
$env:ANDROID_RELEASE_KEY_PASSWORD = 'your-key-password'
.gradlew.bat :app:bundleProductionRelease
```

The uploadable bundle is `app/build/outputs/bundle/productionRelease/app-production-release.aab`.
Release builds are configured to include full native crash/ANR symbols when the
native dependency provides symbol metadata. For APK builds, the generated ZIP
will be at `app/build/outputs/native-debug-symbols/productionRelease/` and can be
uploaded in Play Console alongside the matching artifact. The current
`androidx.graphics.path` prebuilt library does not provide separate symbol
metadata, so this project may still show Play Console's native-symbol warning;
that warning is informational and does not block testing or release. To clear
it, build the symbols ZIP and upload it on the bundle's page in Play Console
(App bundle explorer → select the version → Downloads → Native debug symbols):

```powershell
.\gradlew.bat :app:zipProductionReleaseNativeSymbols
```

The ZIP is written to
`app/build/outputs/native-debug-symbols-upload/productionRelease/native-debug-symbols.zip`
(use `zipBetaReleaseNativeSymbols` for the beta flavor).
If any signing variable is missing, Gradle intentionally produces an unsigned
artifact instead. Verify the signing report before uploading. The app targets
SDK 36 and has application ID `dev.streetsempire.app`.

Create a new upload keystore once, outside the repository, with Java 17+:

```powershell
keytool -genkeypair -v -keystore C:\secure\streets-empire-upload.jks `
  -alias streets-empire-upload -keyalg RSA -keysize 4096 -validity 10000
```

Back up the keystore and both passwords securely. Losing the upload key can
block future Play updates.

## Google Play supporter setup

1. Create the app in Play Console with package `dev.streetsempire.app`.
2. Create subscription product `supporter_monthly` and an active monthly base
   plan. The ID must match `GameConfig.SUPPORTER_PRODUCT_ID` and
   `GOOGLE_PLAY_SUPPORTER_PRODUCT_ID` on the server. For The Drop Crown packs, configure one-time in-app products and set `GOOGLE_PLAY_CROWN_PACK_PRODUCT_IDS` to the comma-separated `packId=productId` mapping shown in `.env.example`. The same product IDs must be present in the Play Console application. Play Crown packs stay off until `DROP_CROWN_PACKS_ENABLED=true` (the same switch as Stripe) and RTDN is configured: the server consumes each pack after crediting it, and takes refunded Crowns back from voided-purchase notifications.
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
  MainActivity.kt          Secure WebView and native billing URL bridge
  GameConfig.kt            Live origin, URL allow-list, and product ID
  PlayBillingManager.kt    Play Billing client; no local entitlements
```

## Security notes

- Cleartext and mixed content are disabled.
- JavaScript and DOM storage are enabled because the web game needs them; there
  is no `addJavascriptInterface` bridge.
- Third-party cookies are disabled. The app never reads the live session cookie.
- Billing custom URLs are intercepted only by the native shell; purchase tokens
  are returned to the trusted live page and verified by the server.
