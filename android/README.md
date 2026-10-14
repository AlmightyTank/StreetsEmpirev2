# StreetsEmpire Android — Live + Beta in one app

Native Kotlin WebView wrapper around the **existing** StreetsEmpire website.
Same idea as `desktop/`: it is not a second game server. Players sign in with
their usual StreetsEmpire credentials and use the same live/beta game data.

- **Live:** `https://play.streetsempire.dev/game`
- **Beta:** `https://beta.streetsempire.dev/game` (invite-only, needs admin approval)
- One app, top toolbar toggles **Live / Beta**
- Remembers last `/game/*` page per environment (like the desktop shell)
- Game + `discord.com` OAuth stay in-app; all other links open in the browser
- Pull-to-refresh, reload button, offline retry screen, back-button = WebView back
- Sessions are cookie-based per host, so Live and Beta logins coexist

## Open and build

Requires Android Studio (Hedgehog or newer) — no Node build needed.

1. Open Android Studio → **Open** → select this `android/` folder.
2. Let Gradle sync (uses `settings.gradle.kts`, AGP 8.5.2, Kotlin 2.0.21).
3. Run on an emulator (API 26+) or a physical device.
4. Build APK/AAB:
   - **Build → Build App Bundle(s) / APK(s) → Build APK(s)**
   - Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
   - Release: **Build → Generate Signed Bundle / APK** (needs your own keystore)

Java 17 is required (you have 17.0.12 — good). `minSdk 26`, `targetSdk 34`.

## Files

```text
android/
  settings.gradle.kts
  build.gradle.kts
  gradle.properties
  app/build.gradle.kts
  app/src/main/AndroidManifest.xml
  app/src/main/java/dev/streetsempire/app/
    MainActivity.kt   WebView, Live/Beta switch, offline + file-chooser handling
    GameConfig.kt     Origins + URL allow-list (mirrors desktop/src/activity.cjs)
  app/src/main/res/layout/activity_main.xml
  app/src/main/res/values/{strings,colors,themes}.xml
```

## Security notes

- HTTPS only (`usesCleartextTraffic=false`, `MIXED_CONTENT_NEVER_ALLOW`).
- JavaScript + DOM storage on (the game needs it); no `addJavascriptInterface`.
- Third-party cookies off; first-party `se_session` / `se_beta_session` cookies on.
- No token scraping: the app never reads cookies or injects into the game DOM.
- If you later add push (FCM/Web Push) or a Play Store listing, keep the same
  origin allow-list and add a privacy policy URL + app icon.

## Changing hosts

Edit `GameConfig.kt` (`LIVE_ORIGIN`, `BETA_ORIGIN`). For local testing against
`http://10.0.2.2:5173`, also add a cleartext exception — do not ship that.
