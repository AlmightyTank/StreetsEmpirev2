package dev.streetsempire.app.native.feature.auth

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
class RecoveryScreensTest {
  @get:Rule
  val compose = createComposeRule()

  @Test
  fun forgotPasswordRequestShowsPrivacyPreservingMessage() {
    val gateway = FakeRecoveryGateway(
      forgotMessage = "If that email is on an account, recovery instructions are on the way.",
    )
    compose.setContent {
      StreetsEmpireTheme {
        ForgotPasswordScreen(auth = gateway, onBackToSignIn = {})
      }
    }

    compose.onNodeWithTag("recovery-email").performScrollTo().performTextInput("boss@example.com")
    compose.onNodeWithTag("recovery-submit").performScrollTo().performClick()

    compose.waitUntil { gateway.forgotCalls == 1 }
    compose.onNodeWithText("If that email is on an account, recovery instructions are on the way.").assertIsDisplayed()
    assertEquals("boss@example.com", gateway.lastForgotEmail)
  }

  @Test
  fun validResetSignsInWithTokenAndPassword() {
    val gateway = FakeRecoveryGateway(resetResult = AuthResult.SignedIn(account()))
    var signedIn = false
    compose.setContent {
      StreetsEmpireTheme {
        ResetPasswordScreen(
          auth = gateway,
          token = "recovery-token",
          onSignedIn = { signedIn = true },
          onTwoFactor = {},
          onRequestNewLink = {},
        )
      }
    }

    compose.onNodeWithTag("recovery-password").performScrollTo().performTextInput("new-password-1")
    compose.onNodeWithTag("recovery-confirm-password").performScrollTo().performTextInput("new-password-1")
    compose.onNodeWithTag("recovery-submit").performScrollTo().performClick()

    compose.waitUntil { signedIn }
    assertEquals(1, gateway.resetCalls)
    assertEquals("recovery-token", gateway.lastResetToken)
    assertEquals("new-password-1", gateway.lastResetPassword)
  }

  @Test
  fun invalidTokenShowsServerMessageWithoutSigningIn() {
    val gateway = FakeRecoveryGateway(
      resetError = ApiError(400, "PASSWORD_RESET_INVALID", "That recovery link is expired or has already been used."),
    )
    var signedIn = false
    compose.setContent {
      StreetsEmpireTheme {
        ResetPasswordScreen(
          auth = gateway,
          token = "bogus-token",
          onSignedIn = { signedIn = true },
          onTwoFactor = {},
          onRequestNewLink = {},
        )
      }
    }

    compose.onNodeWithTag("recovery-password").performScrollTo().performTextInput("new-password-1")
    compose.onNodeWithTag("recovery-confirm-password").performScrollTo().performTextInput("new-password-1")
    compose.onNodeWithTag("recovery-submit").performScrollTo().performClick()

    compose.waitUntil { gateway.resetCalls == 1 }
    compose.onNodeWithText("That recovery link is expired or has already been used.").assertIsDisplayed()
    assertFalse(signedIn)
    assertEquals("bogus-token", gateway.lastResetToken)
  }

  @Test
  fun expiredTokenShowsSameMessageWithoutSigningIn() {
    val gateway = FakeRecoveryGateway(
      resetError = ApiError(400, "PASSWORD_RESET_INVALID", "That recovery link is expired or has already been used."),
    )
    var signedIn = false
    compose.setContent {
      StreetsEmpireTheme {
        ResetPasswordScreen(
          auth = gateway,
          token = "expired-token",
          onSignedIn = { signedIn = true },
          onTwoFactor = {},
          onRequestNewLink = {},
        )
      }
    }

    compose.onNodeWithTag("recovery-password").performScrollTo().performTextInput("new-password-1")
    compose.onNodeWithTag("recovery-confirm-password").performScrollTo().performTextInput("new-password-1")
    compose.onNodeWithTag("recovery-submit").performScrollTo().performClick()

    compose.waitUntil { gateway.resetCalls == 1 }
    compose.onNodeWithText("That recovery link is expired or has already been used.").assertIsDisplayed()
    assertFalse(signedIn)
    assertEquals("expired-token", gateway.lastResetToken)
  }

  @Test
  fun mismatchedPasswordsAreBlockedBeforeTheServer() {
    val gateway = FakeRecoveryGateway(resetResult = AuthResult.SignedIn(account()))
    compose.setContent {
      StreetsEmpireTheme {
        ResetPasswordScreen(
          auth = gateway,
          token = "recovery-token",
          onSignedIn = {},
          onTwoFactor = {},
          onRequestNewLink = {},
        )
      }
    }

    compose.onNodeWithTag("recovery-password").performScrollTo().performTextInput("new-password-1")
    compose.onNodeWithTag("recovery-confirm-password").performScrollTo().performTextInput("new-password-2")
    compose.onNodeWithTag("recovery-submit").performScrollTo().performClick()

    compose.onNodeWithText("Passwords do not match.").assertIsDisplayed()
    assertEquals(0, gateway.resetCalls)
  }

  @Test
  fun resetAfterPasswordChangeRoutesTwoFactorWhenRequired() {
    val gateway = FakeRecoveryGateway(resetResult = AuthResult.TwoFactorRequired())
    var twoFactor = false
    var signedIn = false
    compose.setContent {
      StreetsEmpireTheme {
        ResetPasswordScreen(
          auth = gateway,
          token = "recovery-token",
          onSignedIn = { signedIn = true },
          onTwoFactor = { twoFactor = true },
          onRequestNewLink = {},
        )
      }
    }

    compose.onNodeWithTag("recovery-password").performScrollTo().performTextInput("new-password-1")
    compose.onNodeWithTag("recovery-confirm-password").performScrollTo().performTextInput("new-password-1")
    compose.onNodeWithTag("recovery-submit").performScrollTo().performClick()

    compose.waitUntil { twoFactor }
    assertFalse(signedIn)
  }

  private class FakeRecoveryGateway(
    private val forgotMessage: String = "If that email is on an account, recovery instructions are on the way.",
    private val resetResult: AuthResult = AuthResult.ApprovalRequired("Waiting for approval."),
    private val resetError: ApiError? = null,
  ) : RecoveryGateway {
    var forgotCalls = 0
    var resetCalls = 0
    var lastForgotEmail: String? = null
    var lastResetToken: String? = null
    var lastResetPassword: String? = null

    override suspend fun turnstileSiteKey(): String? = null

    override suspend fun forgotPassword(email: String, captchaToken: String?): String {
      forgotCalls += 1
      lastForgotEmail = email
      return forgotMessage
    }

    override suspend fun resetPassword(token: String, password: String): AuthResult {
      resetCalls += 1
      lastResetToken = token
      lastResetPassword = password
      resetError?.let { throw it }
      return resetResult
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
