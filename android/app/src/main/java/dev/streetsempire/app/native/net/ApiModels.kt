package dev.streetsempire.app.native.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AccountDto(
  val id: String = "",
  val username: String = "",
  val email: String = "",
  val verificationRequired: Boolean = false,
  val rulesAcceptanceRequired: Boolean = false,
  val birthDateRequired: Boolean = false,
  val twoFactorEnabled: Boolean = false,
  val isAdmin: Boolean = false,
)

@Serializable
data class AuthResponse(
  val account: AccountDto? = null,
  val sessionToken: String? = null,
  val twoFactorRequired: Boolean = false,
  val approvalRequired: Boolean = false,
  val message: String? = null,
)

@Serializable
data class RoundSummary(
  val id: String = "",
  val name: String = "",
  val status: String = "",
  val msRemaining: Long = 0L,
  val playerCount: Int = 0,
)

@Serializable
data class TurnsDto(
  val turns: Int = 0,
  val turnCap: Int = 0,
  val nextTurnAt: String = "",
  val turnsGeneratedNextTick: Int = 0,
)

@Serializable
data class PlayerSummary(
  val id: String = "",
  val displayName: String = "",
  val netWorthCents: Long = 0L,
  val turns: TurnsDto = TurnsDto(),
)

@Serializable
data class ActivityItem(
  val id: String = "",
  val type: String = "",
  val createdAt: String = "",
)

@Serializable
data class GameSnapshotDto(
  val round: RoundSummary = RoundSummary(),
  val player: PlayerSummary = PlayerSummary(),
  val recentActivity: List<ActivityItem> = emptyList(),
)

@Serializable
data class ApiErrorBody(
  val error: ApiErrorDetail? = null,
)

@Serializable
data class ApiErrorDetail(
  val code: String = "UNKNOWN",
  val message: String = "Something went wrong. Try that again.",
)

@Serializable
data class PlatformMetaDto(
  val turnstileSiteKey: String? = null,
)
