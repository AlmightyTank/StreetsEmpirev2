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
  val resources: ResourcesSummary,
  val turns: TurnsDto,
  val happiness: HappinessSummary,
  /** Null on rounds without Heat. */
  val heat: HeatSummary?,
  /** Null when no run is on the road. */
  val run: RunSummary?,
  /** Null when not relocating. */
  val moving: MovingSummary?,
  /** Null when no convoy situation is pending. */
  val convoyAlert: ConvoyAlertSummary?,
  val rank: RankSummary,
)

/** Required ResourcesDto fields the dashboard renders. Unknown fields stay forward-compatible. */
@Serializable
data class ResourcesSummary(
  val cashCents: Long,
  val whores: Int,
  val thugs: Int,
  val fitThugs: Int,
  val woundedThugs: Int,
  val postedThugs: Int,
  val unarmedThugs: Int,
  val product: Int,
  val condoms: Int,
  val beer: Int,
  val medicine: Int,
)

@Serializable
data class HappinessSummary(val whore: Int, val thug: Int)

/** Required HeatDto fields the dashboard renders. */
@Serializable
data class HeatSummary(val heat: Int, val max: Int, val lockedUntil: String?)

@Serializable
data class RunSummary(val phase: String, val cityName: String)

@Serializable
data class MovingSummary(val toName: String, val arrivesAt: String)

@Serializable
data class ConvoyAlertSummary(val kind: String, val cityName: String)

@Serializable
data class RankSummary(val local: Int?, val national: Int?)

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
