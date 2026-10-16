package dev.streetsempire.app.native.app

import androidx.activity.ComponentActivity
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ComposeUiTest
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.StateRestorationTester
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.runAndroidComposeUiTest
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.model.CurrentRoundDto
import dev.streetsempire.app.native.core.model.RoundSummary
import dev.streetsempire.app.native.core.model.RuleDto
import dev.streetsempire.app.native.core.model.RulesAgreementDto
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.core.ui.StreetsEmpireTheme
import dev.streetsempire.app.native.feature.auth.AuthGateway
import dev.streetsempire.app.native.feature.auth.AuthResult
import dev.streetsempire.app.native.feature.auth.LoginScreen
import dev.streetsempire.app.native.feature.auth.OnboardingGateway
import dev.streetsempire.app.native.feature.auth.TwoFactorScreen
import dev.streetsempire.app.native.feature.onboarding.OnboardingScreen
import dev.streetsempire.app.native.feature.onboarding.RulesCard
import kotlinx.serialization.json.JsonNull
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Task 3.5. Process death must preserve safe UI state (typed identifiers,
 * selected tab, 16+ checkbox) while never restoring secrets: passwords,
 * the single-use captcha token, and 2FA codes always start empty.
 *
 * Uses [StateRestorationTester.emulateSaveAndRestore], which tears down the
 * composition and rebuilds it from the saved registry — plain `remember`
 * values are dropped while `rememberSaveable` values come back.
 */
@OptIn(ExperimentalTestApi::class)
@RunWith(AndroidJUnit4::class)
class ProcessRestorationTest {

  @Test
  fun signInPreservesIdentifierButRequiresFreshPassword() {
    runAndroidComposeUiTest<ComponentActivity> {
    val gateway = FakeAuthGateway()
    val tester = StateRestorationTester(this)
    tester.setContent {
      StreetsEmpireTheme {
        LoginScreen(gateway, onSignedIn = {}, onTwoFactor = {})
      }
    }

    onNodeWithTag("auth-identifier").performTextInput("MidnightBoss")
    onNodeWithTag("auth-password").performTextInput("secret-password")

    tester.emulateSaveAndRestore()

    onNodeWithTag("auth-identifier").assertTextContains("MidnightBoss")
    assertFieldEmpty("auth-password")
    onNodeWithTag("auth-submit").performClick()
    onNodeWithText("Enter your password.").assertIsDisplayed()
    assertEquals(0, gateway.loginCalls)
    }
  }

  @Test
  fun signUpPreservesModeAndSafeFieldsButClearsPasswords() {
    runAndroidComposeUiTest<ComponentActivity> {
    val gateway = FakeAuthGateway()
    val tester = StateRestorationTester(this)
    tester.setContent {
      StreetsEmpireTheme {
        LoginScreen(gateway, onSignedIn = {}, onTwoFactor = {})
      }
    }

    onNodeWithTag("auth-tab-signup").performClick()
    onNodeWithTag("auth-username").performTextInput("StreetBoss")
    onNodeWithTag("auth-email").performTextInput("boss@example.com")
    onNodeWithTag("auth-password").performScrollTo().performTextInput("password-one")
    onNodeWithTag("auth-confirm-password").performScrollTo().performTextInput("password-two")

    tester.emulateSaveAndRestore()

    onNodeWithTag("auth-username").assertIsDisplayed().assertTextContains("StreetBoss")
    onNodeWithTag("auth-email").assertTextContains("boss@example.com")
    assertFieldEmpty("auth-password")
    assertFieldEmpty("auth-confirm-password")
    assertEquals(0, gateway.registerCalls)
    }
  }

  @Test
  fun captchaTokenIsNotRestoredAfterRecreation() {
    runAndroidComposeUiTest<ComponentActivity> {
    val gateway = FakeAuthGateway(
      siteKey = "site-key",
      loginError = ApiError(401, "INVALID_CREDENTIALS", "Wrong credentials."),
    )
    var allowSolve = true
    val tester = StateRestorationTester(this)
    tester.setContent {
      StreetsEmpireTheme {
        LoginScreen(
          auth = gateway,
          onSignedIn = {},
          onTwoFactor = {},
          turnstileContent = { _, challenge, onToken ->
            LaunchedEffect(challenge) {
              if (allowSolve && challenge == 0) onToken("single-use-token")
            }
          },
        )
      }
    }

    onNodeWithTag("auth-identifier").performTextInput("MidnightBoss")
    onNodeWithTag("auth-password").performTextInput("wrong-password")
    onNodeWithTag("auth-submit").performScrollTo().performClick()
    waitUntil(timeoutMillis = 5_000) { gateway.loginCalls == 1 }
    allowSolve = false

    tester.emulateSaveAndRestore()

    // The password is gone too, so retype it: the next submit must fail on
    // the missing human check, proving the captcha token was not restored.
    onNodeWithTag("auth-password").performTextInput("wrong-password")
    onNodeWithTag("auth-submit").performScrollTo().performClick()
    onNodeWithText("Finish the human check first.").assertIsDisplayed()
    assertEquals(1, gateway.loginCalls)
    }
  }

  @Test
  fun twoFactorCodeIsClearedOnRecreation() {
    runAndroidComposeUiTest<ComponentActivity> {
    val gateway = FakeAuthGateway(verifyResult = AuthResult.SignedIn(account()))
    val tester = StateRestorationTester(this)
    tester.setContent {
      StreetsEmpireTheme {
        TwoFactorScreen(gateway) {}
      }
    }

    onNodeWithTag("two-factor-code").performTextInput("123456")

    tester.emulateSaveAndRestore()

    assertFieldEmpty("two-factor-code")
    onNodeWithTag("two-factor-submit").performClick()
    waitForIdle()
    // An empty code goes out, never the pre-recreation secret.
    assertEquals("", gateway.lastTwoFactorCode)
    }
  }

  @Test
  fun rulesAgreementCheckboxSurvivesRecreation() {
    runAndroidComposeUiTest<ComponentActivity> {
    val agreement = RulesAgreementDto(
      version = "2026-10-15a",
      minimumAge = 16,
      rules = listOf(RuleDto("No cheating", "Play fair.")),
    )
    val tester = StateRestorationTester(this)
    tester.setContent {
      StreetsEmpireTheme {
        val agreedState = rememberSaveable { mutableStateOf(false) }
        RulesCard(agreement = agreement, agreed = agreedState.value, busy = false, onAgreedChange = { agreedState.value = it }, onAccept = {})
      }
    }

    onNodeWithTag("rules-agree-checkbox").performClick()
    onNodeWithTag("rules-agree-checkbox").assertIsOn()

    tester.emulateSaveAndRestore()

    onNodeWithTag("rules-agree-checkbox").assertIsOn()
    onNodeWithTag("rules-accept").assertIsEnabled()
    }
  }

  @Test
  fun onboardingKeepsCoherentStateAcrossRecreation() {
    runAndroidComposeUiTest<ComponentActivity> {
    val gateway = FakeOnboardingGateway()
    val tester = StateRestorationTester(this)
    tester.setContent {
      StreetsEmpireTheme {
        OnboardingScreen(auth = gateway, onComplete = {}, onSignedOut = {})
      }
    }

    waitUntil(timeoutMillis = 10_000) {
      try {
        onNodeWithTag("rules-agree-checkbox").assertIsDisplayed()
        true
      } catch (_: AssertionError) {
        false
      }
    }
    onNodeWithTag("rules-agree-checkbox").performScrollTo().performClick()

    tester.emulateSaveAndRestore()

    onNodeWithTag("rules-card").assertIsDisplayed()
    onNodeWithTag("rules-agree-checkbox").assertIsOn()
    }
  }

  private class FakeAuthGateway(
    private val siteKey: String? = null,
    private val loginError: ApiError? = null,
    private val verifyResult: AuthResult = AuthResult.ApprovalRequired("Waiting for approval."),
  ) : AuthGateway {
    var loginCalls = 0
    var registerCalls = 0
    var lastTwoFactorCode: String? = null

    override suspend fun turnstileSiteKey(): String? = siteKey

    override suspend fun login(identifier: String, password: String, captchaToken: String?): AuthResult {
      loginCalls += 1
      loginError?.let { throw it }
      return AuthResult.ApprovalRequired("Waiting for approval.")
    }

    override suspend fun register(
      username: String,
      email: String,
      password: String,
      ageConfirmed: Boolean,
      birthDate: String,
      captchaToken: String?,
    ): AuthResult {
      registerCalls += 1
      return AuthResult.ApprovalRequired("Waiting for approval.")
    }

    override suspend fun verifyTwoFactor(code: String): AuthResult {
      lastTwoFactorCode = code
      return verifyResult
    }
  }

  private class FakeOnboardingGateway : OnboardingGateway {
    private var account = AccountDto(
      id = "acct-1",
      username = "MidnightBoss",
      email = "boss@example.com",
      emailVerifiedAt = "2026-10-01T00:00:00Z",
      discordLinked = false,
      discordUsername = null,
      isAdmin = false,
      createdAt = "2026-09-01T00:00:00Z",
      lastLoginAt = null,
      verificationRequired = false,
      rulesAcceptanceRequired = true,
      birthDateRequired = false,
      adminSignInRequired = false,
      twoFactorEnabled = false,
    )

    override suspend fun me(): AccountDto = account

    override suspend fun rulesAgreement(): RulesAgreementDto = RulesAgreementDto(
      version = "2026-10-15a",
      minimumAge = 16,
      rules = listOf(RuleDto("No cheating", "Play fair.")),
    )

    override suspend fun requestEmailVerification(): String = "Verification link sent."

    override suspend fun verifyEmailToken(token: String): String = "Your account email is verified."

    override suspend fun acceptRules(version: String): AccountDto {
      account = account.copy(rulesAcceptanceRequired = false)
      return account
    }

    override suspend fun currentRound(): CurrentRoundDto = CurrentRoundDto(
      round = RoundSummary(
        id = "round-1",
        name = "Empire Season",
        slug = "empire-season",
        status = "ACTIVE",
        rulesetId = "classic",
        rulesetVersion = "3.0",
        startsAt = "2026-10-01T00:00:00Z",
        endsAt = "2026-12-31T00:00:00Z",
        registrationOpensAt = null,
        msRemaining = 1_000_000L,
        playerCount = 42,
        paused = null,
      ),
      me = null,
      canJoin = true,
      roundOver = JsonNull,
    )

    override suspend fun joinCurrentRound(): CurrentRoundDto = currentRound()

    override suspend fun logout() = Unit
  }

  companion object {
    /** Empty fields carry `EditableText("")`, so read the raw value instead. */
    private fun ComposeUiTest.assertFieldEmpty(tag: String) {
      val text = onNodeWithTag(tag).fetchSemanticsNode().config
        .getOrNull(SemanticsProperties.EditableText)?.text.orEmpty()
      assertEquals("", text)
    }

    private fun account() = AccountDto(
      id = "acct-1",
      username = "MidnightBoss",
      email = "boss@example.com",
      emailVerifiedAt = "2026-10-15T00:00:00.000Z",
      discordLinked = false,
      discordUsername = null,
      isAdmin = false,
      createdAt = "2026-10-01T00:00:00.000Z",
      lastLoginAt = "2026-10-15T00:00:00.000Z",
      verificationRequired = false,
      rulesAcceptanceRequired = false,
      birthDateRequired = false,
      adminSignInRequired = false,
      twoFactorEnabled = true,
    )
  }
}
