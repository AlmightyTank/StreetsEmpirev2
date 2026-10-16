package dev.streetsempire.app.native.feature.auth

import dev.streetsempire.app.native.core.network.ApiClient
import dev.streetsempire.app.native.core.network.CredentialStore
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthRepositoryTest {
  @Test
  fun failedLogoutStillClearsProtectedCredentials() = runBlocking {
    MockWebServer().use { server ->
      server.enqueue(
        MockResponse()
          .setResponseCode(500)
          .setHeader("Content-Type", "application/json")
          .setBody("{\"error\":{\"code\":\"SERVER_ERROR\",\"message\":\"Try again.\"}}"),
      )
      server.start()
      val credentials = FakeCredentialStore("secret-session")
      val repository = AuthRepository(
        api = ApiClient(
          tokenProvider = credentials,
          serverOrigin = server.url("/").toString(),
        ),
        tokens = credentials,
      )

      var failed = false
      try {
        repository.logout()
      } catch (_: Exception) {
        failed = true
      }

      assertTrue(failed)
      assertTrue(credentials.cleared)
      assertNull(credentials.sessionToken())
      val request = server.takeRequest()
      assertEquals("POST", request.method)
      assertEquals("/api/auth/logout", request.path)
      assertEquals("Bearer secret-session", request.getHeader("Authorization"))
    }
  }

  @Test
  fun forgotPasswordSendsPrivacyPreservingRequest() = runBlocking {
    MockWebServer().use { server ->
      server.enqueue(
        MockResponse()
          .setResponseCode(200)
          .setHeader("Content-Type", "application/json")
          .setBody("{\"ok\":true,\"message\":\"If that email is on an account, recovery instructions are on the way.\"}"),
      )
      server.start()
      val credentials = FakeCredentialStore(null)
      val repository = AuthRepository(
        api = ApiClient(
          tokenProvider = credentials,
          serverOrigin = server.url("/").toString(),
        ),
        tokens = credentials,
      )

      val message = repository.forgotPassword("boss@example.com", "captcha-token")

      assertEquals("If that email is on an account, recovery instructions are on the way.", message)
      val request = server.takeRequest()
      assertEquals("POST", request.method)
      assertEquals("/api/auth/password/forgot", request.path)
      val body = request.body.readUtf8()
      assertTrue(body.contains("\"email\":\"boss@example.com\""))
      assertTrue(body.contains("\"captchaToken\":\"captcha-token\""))
    }
  }

  @Test
  fun resetPasswordStoresNativeSessionAndSignsIn() = runBlocking {
    MockWebServer().use { server ->
      server.enqueue(
        MockResponse()
          .setResponseCode(200)
          .setHeader("Content-Type", "application/json")
          .setBody("{\"account\":${accountJson()},\"sessionToken\":\"mobile-session-token\"}"),
      )
      server.start()
      val credentials = FakeCredentialStore(null)
      val repository = AuthRepository(
        api = ApiClient(
          tokenProvider = credentials,
          serverOrigin = server.url("/").toString(),
        ),
        tokens = credentials,
      )

      val result = repository.resetPassword("recovery-token", "new-password-1")

      assertTrue(result is AuthResult.SignedIn)
      assertEquals("mobile-session-token", credentials.sessionToken())
      val request = server.takeRequest()
      assertEquals("POST", request.method)
      assertEquals("/api/auth/password/reset", request.path)
      val body = request.body.readUtf8()
      assertTrue(body.contains("\"token\":\"recovery-token\""))
      assertTrue(body.contains("\"password\":\"new-password-1\""))
    }
  }

  @Test
  fun resetPasswordWithTwoFactorStoresNoSession() = runBlocking {
    MockWebServer().use { server ->
      server.enqueue(
        MockResponse()
          .setResponseCode(200)
          .setHeader("Content-Type", "application/json")
          .setBody("{\"twoFactorRequired\":true}"),
      )
      server.start()
      val credentials = FakeCredentialStore(null)
      val repository = AuthRepository(
        api = ApiClient(
          tokenProvider = credentials,
          serverOrigin = server.url("/").toString(),
        ),
        tokens = credentials,
      )

      val result = repository.resetPassword("recovery-token", "new-password-1")

      assertTrue(result is AuthResult.TwoFactorRequired)
      assertNull(credentials.sessionToken())
    }
  }

  private fun accountJson(): String = """
    {"id":"acct-1","username":"MidnightBoss","email":"boss@example.com",
    "emailVerifiedAt":"2026-10-15T10:00:00.000Z","discordLinked":false,"discordUsername":null,
    "isAdmin":false,"createdAt":"2026-10-01T10:00:00.000Z","lastLoginAt":"2026-10-15T10:00:00.000Z",
    "verificationRequired":false,"rulesAcceptanceRequired":false,"birthDateRequired":false,
    "adminSignInRequired":false,"twoFactorEnabled":true}
  """.trimIndent().replace("\n", "")

  private class FakeCredentialStore(initialToken: String?) : CredentialStore {    private var token = initialToken
    var cleared = false

    override fun sessionToken(): String? = token

    override fun save(token: String) {
      this.token = token
    }

    override fun clear() {
      token = null
      cleared = true
    }
  }
}
