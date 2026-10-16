package dev.streetsempire.app.native.feature.auth

import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.model.AuthResponse
import dev.streetsempire.app.native.core.model.CurrentRoundDto
import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.model.MessageResponse
import dev.streetsempire.app.native.core.model.PlatformMetaDto
import dev.streetsempire.app.native.core.model.RulesAgreementDto
import dev.streetsempire.app.native.feature.dashboard.DashboardGateway
import dev.streetsempire.app.native.core.network.ApiClient
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.core.network.CredentialStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

@Serializable
private data class LoginBody(val identifier: String, val password: String, val remember: Boolean = true, val captchaToken: String? = null)

@Serializable
private data class RegisterBody(
  val username: String,
  val email: String,
  val password: String,
  val ageConfirmed: Boolean,
  val birthDate: String,
  val captchaToken: String? = null,
)

@Serializable
private data class BirthdayBody(val birthDate: String)

@Serializable
private data class TwoFactorVerifyBody(val code: String)

@Serializable
private data class ForgotPasswordBody(val email: String, val captchaToken: String? = null)

@Serializable
private data class VerifyEmailTokenBody(val token: String)

@Serializable
private data class ResetPasswordBody(val token: String, val password: String)

@Serializable
private data class AcceptRulesBody(val version: String)

sealed interface AuthResult {
  data class SignedIn(val account: AccountDto) : AuthResult
  data class TwoFactorRequired(val message: String = "Enter your authenticator code.") : AuthResult
  data class ApprovalRequired(val message: String) : AuthResult
}

interface AuthGateway {
  suspend fun turnstileSiteKey(): String?
  suspend fun login(identifier: String, password: String, captchaToken: String? = null): AuthResult
  suspend fun register(username: String, email: String, password: String, ageConfirmed: Boolean, birthDate: String, captchaToken: String? = null): AuthResult
  suspend fun verifyTwoFactor(code: String): AuthResult
}

/** Account recovery reads the same privacy-preserving contracts as the web client. */
interface RecoveryGateway {
  suspend fun turnstileSiteKey(): String?
  suspend fun forgotPassword(email: String, captchaToken: String? = null): String
  suspend fun resetPassword(token: String, password: String): AuthResult
}

/** Onboarding reads verification, rules, and season-join state through this narrow contract. */
interface OnboardingGateway {
  suspend fun me(): AccountDto
  suspend fun rulesAgreement(): RulesAgreementDto
  suspend fun requestEmailVerification(): String
  /** Consumes an emailed verification link; the endpoint is public, like web. */
  suspend fun verifyEmailToken(token: String): String
  suspend fun acceptRules(version: String): AccountDto
  suspend fun currentRound(): CurrentRoundDto
  suspend fun joinCurrentRound(): CurrentRoundDto
  suspend fun logout()
}

class AuthRepository(private val api: ApiClient, private val tokens: CredentialStore) : AuthGateway, OnboardingGateway, RecoveryGateway, DashboardGateway {
  override suspend fun turnstileSiteKey(): String? = withContext(Dispatchers.IO) {
    try {
      api.getJson<PlatformMetaDto>("/meta").turnstileSiteKey?.takeIf { it.isNotBlank() }
    } catch (_: Exception) {
      null
    }
  }

  override suspend fun login(identifier: String, password: String, captchaToken: String?): AuthResult = withContext(Dispatchers.IO) {
    val raw = api.post("/auth/login", api.json.encodeToString(LoginBody(identifier.trim(), password, true, captchaToken?.takeIf { it.isNotBlank() })))
    val response = api.json.decodeFromString<AuthResponse>(raw)
    if (response.twoFactorRequired) return@withContext AuthResult.TwoFactorRequired()
    if (response.approvalRequired) {
      return@withContext AuthResult.ApprovalRequired(response.message ?: "Your account is waiting for approval.")
    }
    val token = response.sessionToken
      ?: throw ApiError(0, "NO_TOKEN", "The server did not return a mobile session. Update the game server first.")
    tokens.save(token)
    AuthResult.SignedIn(response.account ?: throw ApiError(0, "NO_ACCOUNT", "Sign-in succeeded without an account. Try again."))
  }

  override suspend fun register(username: String, email: String, password: String, ageConfirmed: Boolean, birthDate: String, captchaToken: String?): AuthResult = withContext(Dispatchers.IO) {
    val raw = api.post("/auth/register", api.json.encodeToString(RegisterBody(username.trim(), email.trim(), password, ageConfirmed, birthDate, captchaToken?.takeIf { it.isNotBlank() })))
    val response = api.json.decodeFromString<AuthResponse>(raw)
    if (response.approvalRequired) {
      return@withContext AuthResult.ApprovalRequired(response.message ?: "Your account is waiting for approval.")
    }
    val token = response.sessionToken
      ?: throw ApiError(0, "NO_TOKEN", "The server did not return a mobile session. Update the game server first.")
    tokens.save(token)
    AuthResult.SignedIn(response.account ?: throw ApiError(0, "NO_ACCOUNT", "Registration succeeded without an account. Try again."))
  }

  override suspend fun verifyTwoFactor(code: String): AuthResult = withContext(Dispatchers.IO) {
    val raw = api.post("/auth/2fa/verify", api.json.encodeToString(TwoFactorVerifyBody(code.trim())))
    val response = api.json.decodeFromString<AuthResponse>(raw)
    val token = response.sessionToken
      ?: throw ApiError(0, "NO_TOKEN", "The server did not return a mobile session. Update the game server first.")
    tokens.save(token)
    AuthResult.SignedIn(response.account ?: throw ApiError(0, "NO_ACCOUNT", "Sign-in succeeded without an account. Try again."))
  }

  override suspend fun me(): AccountDto = withContext(Dispatchers.IO) {
    api.getJson<AuthMeResponse>("/auth/me").account
  }

  override suspend fun rulesAgreement(): RulesAgreementDto = withContext(Dispatchers.IO) {
    api.getJson<PlatformMetaDto>("/meta").rulesAgreement
  }

  override suspend fun requestEmailVerification(): String = withContext(Dispatchers.IO) {
    val raw = api.post("/auth/email/verify/request", "{}")
    api.json.decodeFromString<MessageResponse>(raw).message
  }

  override suspend fun verifyEmailToken(token: String): String = withContext(Dispatchers.IO) {
    val raw = api.post("/auth/email/verify", api.json.encodeToString(VerifyEmailTokenBody(token.trim())))
    api.json.decodeFromString<MessageResponse>(raw).message
  }

  override suspend fun acceptRules(version: String): AccountDto = withContext(Dispatchers.IO) {
    val raw = api.post("/auth/rules/accept", api.json.encodeToString(AcceptRulesBody(version)))
    api.json.decodeFromString<AuthMeResponse>(raw).account
  }

  override suspend fun currentRound(): CurrentRoundDto = withContext(Dispatchers.IO) {
    api.getJson("/rounds/current")
  }

  override suspend fun joinCurrentRound(): CurrentRoundDto = withContext(Dispatchers.IO) {
    val raw = api.post("/rounds/current/join", "{}")
    api.json.decodeFromString(raw)
  }

  override suspend fun forgotPassword(email: String, captchaToken: String?): String = withContext(Dispatchers.IO) {
    val raw = api.post("/auth/password/forgot", api.json.encodeToString(ForgotPasswordBody(email.trim(), captchaToken?.takeIf { it.isNotBlank() })))
    api.json.decodeFromString<MessageResponse>(raw).message
  }

  override suspend fun resetPassword(token: String, password: String): AuthResult = withContext(Dispatchers.IO) {
    val raw = api.post("/auth/password/reset", api.json.encodeToString(ResetPasswordBody(token.trim(), password)))
    val response = api.json.decodeFromString<AuthResponse>(raw)
    if (response.twoFactorRequired) return@withContext AuthResult.TwoFactorRequired()
    val sessionToken = response.sessionToken
      ?: throw ApiError(0, "NO_TOKEN", "The server did not return a mobile session. Update the game server first.")
    tokens.save(sessionToken)
    AuthResult.SignedIn(response.account ?: throw ApiError(0, "NO_ACCOUNT", "Password reset succeeded without an account. Try again."))
  }

  suspend fun saveBirthday(birthDate: String): AccountDto = withContext(Dispatchers.IO) {
    val raw = api.post("/auth/birthday", api.json.encodeToString(BirthdayBody(birthDate)))
    api.json.decodeFromString<AuthMeResponse>(raw).account
  }


  suspend fun dashboard(): GameSnapshotDto = withContext(Dispatchers.IO) {
    api.getJson("/game/me")
  }

  override suspend fun snapshot(): GameSnapshotDto = dashboard()

  override suspend fun logout(): Unit = withContext(Dispatchers.IO) {
    try {
      api.post("/auth/logout", "{}")
    } finally {
      tokens.clear()
    }
  }

  fun isSignedIn(): Boolean = tokens.sessionToken() != null
}

@kotlinx.serialization.Serializable
private data class AuthMeResponse(val account: AccountDto)
