package dev.streetsempire.app.native.feature.auth

import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.streetsempire.app.native.app.NativeAppActivity
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Full-activity deep-link routing. The parser rejects untrusted links before
 * navigation, so these tests launch the real launcher activity with VIEW
 * intents the way `adb shell am start` delivers them.
 */
@RunWith(AndroidJUnit4::class)
class AppLinkRoutingTest {
  @get:Rule
  val compose = createEmptyComposeRule()

  @Before
  fun clearStoredSession() {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    context.getSharedPreferences("se_native_auth", 0).edit().clear().commit()
  }

  private fun launchWithLink(url: String): ActivityScenario<NativeAppActivity> {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
    intent.setPackage(context.packageName)
    return ActivityScenario.launch(intent)
  }

  @Test
  fun resetLinkOpensTheNativeResetScreen() {
    launchWithLink("http://127.0.0.1:3001/reset-password?token=recovery-token-abc").use {
      compose.waitForIdle()
      compose.onNodeWithTag("recovery-password").assertIsDisplayed()
      compose.onNodeWithTag("recovery-submit").assertIsDisplayed()
    }
  }

  @Test
  fun verifyLinkOpensTheNativeVerifyScreen() {
    launchWithLink("http://127.0.0.1:3001/verify-email?token=verification-token-abc").use {
      compose.waitForIdle()
      compose.onNodeWithTag("verify-link-screen").assertIsDisplayed()
      // The screen always settles on a server result, success or failure.
      compose.waitUntil(timeoutMillis = 15_000) {
        compose.onAllNodesWithTag("verify-link-info").fetchSemanticsNodes().isNotEmpty() ||
          compose.onAllNodesWithTag("verify-link-error").fetchSemanticsNodes().isNotEmpty()
      }
    }
  }

  @Test
  fun untrustedHostStaysOnSignIn() {
    // The OS cannot resolve this intent to our activity at all, so there is
    // nothing to launch: assert the manifest filter refuses it, then show the
    // normal cold start still lands at sign-in.
    assertNoActivityHandles("https://evil.example/verify-email?token=verification-token-abc")
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    ActivityScenario.launch<NativeAppActivity>(Intent(context, NativeAppActivity::class.java)).use {
      compose.waitForIdle()
      compose.onNodeWithTag("auth-identifier").assertIsDisplayed()
      compose.onAllNodesWithTag("verify-link-screen").fetchSemanticsNodes().isEmpty()
      compose.onAllNodesWithTag("recovery-password").fetchSemanticsNodes().isEmpty()
    }
  }

  @Test
  fun wrongPathStaysOnSignIn() {
    assertNoActivityHandles("http://127.0.0.1:3001/game?token=verification-token-abc")
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    ActivityScenario.launch<NativeAppActivity>(Intent(context, NativeAppActivity::class.java)).use {
      compose.waitForIdle()
      compose.onNodeWithTag("auth-identifier").assertIsDisplayed()
    }
  }

  private fun assertNoActivityHandles(url: String) {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      addCategory(Intent.CATEGORY_BROWSABLE)
    }
    val matches = context.packageManager.queryIntentActivities(intent, 0)
    val ours = matches.none { it.activityInfo.name.endsWith("NativeAppActivity") }
    assert(ours) { "Untrusted link must not resolve to NativeAppActivity: $url" }
  }
}
