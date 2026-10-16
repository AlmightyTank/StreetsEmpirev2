package dev.streetsempire.app.native.feature.auth

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.core.ui.StreetsEmpireTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AuthScreensTest {
  @get:Rule
  val compose = createComposeRule()

  @Test
  fun validSignInReturnsAccount() {
    val gateway = FakeAuthGateway(loginResult = AuthResult.SignedIn(account()))
    var signedIn = false
    compose.setContent {
      StreetsEmpireTheme {
        LoginScreen(gateway, onSignedIn = { signedIn = true }, onTwoFactor = {})
      }
    }

    compose.onNodeWithTag("auth-identifier").performTextInput("MidnightBoss")
    compose.onNodeWithTag("auth-password").performTextInput("secret-password")
    compose.onNodeWithTag("auth-submit").performClick()

    compose.waitUntil { signedIn }
    assertEquals(1, gateway.loginCalls)
  }

  @Test
  fun signUpRequiresMatchingConfirmationPasswordBeforeCallingServer() {
    val gateway = FakeAuthGateway(registerResult = AuthResult.SignedIn(account()))
    compose.setContent {
      StreetsEmpireTheme {
        LoginScreen(gateway, onSignedIn = {}, onTwoFactor = {})
      }
    }

    compose.onNodeWithTag("auth-tab-signup").performClick()
    compose.onNodeWithTag("auth-username").performTextInput("StreetBoss")
    compose.onNodeWithTag("auth-email").performTextInput("boss@example.com")
    compose.onNodeWithTag("auth-password").performScrollTo().performTextInput("password-one")
    compose.onNodeWithTag("auth-confirm-password").performScrollTo().performTextInput("password-two")
    compose.onNodeWithTag("auth-submit").performScrollTo().performClick()

    compose.onNodeWithText("Passwords do not match.").assertIsDisplayed()
    assertEquals(0, gateway.registerCalls)
  }

  @Test
  fun failedRequestConsumesSingleUseCaptchaBeforeAnotherSubmission() {
    val gateway = FakeAuthGateway(
      siteKey = "site-key",
      loginError = ApiError(401, "INVALID_CREDENTIALS", "Wrong credentials."),
    )
    compose.setContent {
      StreetsEmpireTheme {
        LoginScreen(
          auth = gateway,
          onSignedIn = {},
          onTwoFactor = {},
          turnstileContent = { _, challenge, onToken ->
            LaunchedEffect(challenge) {
              if (challenge == 0) onToken("single-use-token")
            }
          },
        )
      }
    }

    compose.onNodeWithTag("auth-identifier").performTextInput("MidnightBoss")
    compose.onNodeWithTag("auth-password").performTextInput("wrong-password")
    compose.onNodeWithTag("auth-submit").performScrollTo().performClick()
    compose.waitUntil { gateway.loginCalls == 1 }
    compose.onNodeWithText("Wrong credentials.").assertIsDisplayed()

    compose.onNodeWithTag("auth-submit").performScrollTo().performClick()
    compose.onNodeWithText("Finish the human check first.").assertIsDisplayed()
    assertEquals(1, gateway.loginCalls)
    assertEquals("single-use-token", gateway.lastCaptchaToken)
  }

  @Test
  fun twoFactorChallengeCompletesSignIn() {
    val gateway = FakeAuthGateway(
      loginResult = AuthResult.TwoFactorRequired(),
      verifyResult = AuthResult.SignedIn(account()),
    )
    var showTwoFactor by mutableStateOf(false)
    var signedIn = false
    compose.setContent {
      StreetsEmpireTheme {
        if (showTwoFactor) {
          TwoFactorScreen(gateway) { signedIn = true }
        } else {
          LoginScreen(gateway, onSignedIn = {}, onTwoFactor = { showTwoFactor = true })
        }
      }
    }

    compose.onNodeWithTag("auth-identifier").performTextInput("MidnightBoss")
    compose.onNodeWithTag("auth-password").performTextInput("secret-password")
    compose.onNodeWithTag("auth-submit").performClick()
    compose.onNodeWithTag("two-factor-code").assertIsDisplayed().performTextInput("123456")
    compose.onNodeWithTag("two-factor-submit").performClick()

    compose.waitUntil { signedIn }
    assertEquals("123456", gateway.lastTwoFactorCode)
  }

  private class FakeAuthGateway(
    private val siteKey: String? = null,
    private val loginResult: AuthResult = AuthResult.ApprovalRequired("Waiting for approval."),
    private val registerResult: AuthResult = AuthResult.ApprovalRequired("Waiting for approval."),
    private val verifyResult: AuthResult = AuthResult.ApprovalRequired("Waiting for approval."),
    private val loginError: ApiError? = null,
  ) : AuthGateway {
    var loginCalls = 0
    var registerCalls = 0
    var lastCaptchaToken: String? = null
    var lastTwoFactorCode: String? = null

    override suspend fun turnstileSiteKey(): String? = siteKey

    override suspend fun login(identifier: String, password: String, captchaToken: String?): AuthResult {
      loginCalls += 1
      lastCaptchaToken = captchaToken
      loginError?.let { throw it }
      return loginResult
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
      return registerResult
    }

    override suspend fun verifyTwoFactor(code: String): AuthResult {
      lastTwoFactorCode = code
      return verifyResult
    }
  }

  companion object {
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
