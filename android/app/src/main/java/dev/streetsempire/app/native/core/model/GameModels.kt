package dev.streetsempire.app.native.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Required RoundDto fields used by native screens. Unknown fields remain forward-compatible. */
@Serializable
data class RoundSummary(
  val id: String,
  val name: String,
  val slug: String,
  val status: String,
  val rulesetId: String,
  val rulesetVersion: String,
  val startsAt: String,
  val endsAt: String,
  val registrationOpensAt: String?,
  val msRemaining: Long,
  val playerCount: Int,
  val paused: RoundPauseDto?,
)

@Serializable
data class RoundPauseDto(val since: String, val reason: String?)

@Serializable
data class CitySummary(val slug: String, val name: String)

@Serializable
data class TurnsDto(
  val turns: Int,
  val turnCap: Int,
  val nextTurnAt: String,
  val turnsGeneratedNextTick: Int,
)

/** Deliberately small native projection; every projected field is required by RoundPlayerDto. */
@Serializable
data class PlayerSummary(
  val id: String,
  val publicPimpId: Int,
  val displayName: String,
  val city: CitySummary,
  val payoutPercent: Int,
  val netWorthCents: Long,
  val turns: TurnsDto,
)

@Serializable
data class ActivityItem(
  val id: String,
  val type: String,
  val payload: JsonElement,
  val createdAt: String,
)

@Serializable
data class GameSnapshotDto(
  val round: RoundSummary,
  val player: PlayerSummary,
  val recentActivity: List<ActivityItem>,
)

@Serializable
data class CurrentRoundDto(
  val round: RoundSummary?,
  val me: PlayerSummary?,
  val canJoin: Boolean,
  // Round-over is not rendered yet, but its required presence detects contract drift.
  val roundOver: JsonElement?,
)
