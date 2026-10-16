package dev.streetsempire.app.native.feature.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppLinksTest {
  private val localOrigin = "http://127.0.0.1:3001"
  private val betaOrigin = "https://beta.streetsempire.dev"

  @Test
  fun acceptsLocalVerifyLink() {
    assertEquals(
      AppLink.VerifyEmail("tok123"),
      AppLinks.parseAppLink("http://127.0.0.1:3001/verify-email?token=tok123", localOrigin),
    )
  }

  @Test
  fun acceptsBetaResetLink() {
    assertEquals(
      AppLink.ResetPassword("tok123"),
      AppLinks.parseAppLink("https://beta.streetsempire.dev/reset-password?token=tok123", betaOrigin),
    )
  }

  @Test
  fun rejectsUntrustedHosts() {
    assertNull(AppLinks.parseAppLink("https://evil.example/verify-email?token=tok123", betaOrigin))
    assertNull(AppLinks.parseAppLink("https://play.streetsempire.dev/verify-email?token=tok123", betaOrigin))
    assertNull(AppLinks.parseAppLink("https://beta.streetsempire.dev.evil.example/verify-email?token=tok123", betaOrigin))
  }

  @Test
  fun rejectsWrongSchemeAndPort() {
    assertNull(AppLinks.parseAppLink("https://127.0.0.1:3001/verify-email?token=tok123", localOrigin))
    assertNull(AppLinks.parseAppLink("http://127.0.0.1:9999/verify-email?token=tok123", localOrigin))
    assertNull(AppLinks.parseAppLink("http://beta.streetsempire.dev/reset-password?token=tok123", betaOrigin))
  }

  @Test
  fun rejectsUnknownPathsAndMissingTokens() {
    assertNull(AppLinks.parseAppLink("https://beta.streetsempire.dev/game?token=tok123", betaOrigin))
    assertNull(AppLinks.parseAppLink("https://beta.streetsempire.dev/verify-email", betaOrigin))
    assertNull(AppLinks.parseAppLink("https://beta.streetsempire.dev/verify-email?token=", betaOrigin))
    assertNull(AppLinks.parseAppLink("https://beta.streetsempire.dev/reset-password?other=1", betaOrigin))
    assertNull(AppLinks.parseAppLink(null, betaOrigin))
    assertNull(AppLinks.parseAppLink("not a url", betaOrigin))
  }

  @Test
  fun toleratesExtraQueryParameters() {
    assertEquals(
      AppLink.VerifyEmail("tok123"),
      AppLinks.parseAppLink("https://beta.streetsempire.dev/verify-email?utm_source=email&token=tok123", betaOrigin),
    )
  }
}
