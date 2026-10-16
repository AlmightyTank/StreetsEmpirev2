package dev.streetsempire.app.native.core.model

import kotlinx.serialization.Serializable

/** Native projection of the required fields in shared AccountDto. */
@Serializable
data class AccountDto(
  val id: String,
  val username: String,
  val email: String,
  val emailVerifiedAt: String?,
  val discordLinked: Boolean,
  val discordUsername: String?,
  val isAdmin: Boolean,
  val createdAt: String,
  val lastLoginAt: String?,
  val verificationRequired: Boolean,
  val rulesAcceptanceRequired: Boolean,
  val birthDateRequired: Boolean,
  val adminSignInRequired: Boolean,
  val twoFactorEnabled: Boolean,
)

/** Login endpoints intentionally return different branches of this envelope. */
@Serializable
data class AuthResponse(
  val account: AccountDto? = null,
  val sessionToken: String? = null,
  val twoFactorRequired: Boolean = false,
  val approvalRequired: Boolean = false,
  val message: String? = null,
)
