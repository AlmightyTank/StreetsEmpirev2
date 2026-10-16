package dev.streetsempire.app.native.core.model

import kotlinx.serialization.Serializable

/**
 * Street action contracts mirrored from `@streets/shared` (`types/api.ts`):
 * `DistrictDto`, `DistrictsDto`, `GameActionResult<T>`, `ScoutResult`,
 * `RandomEncounterDto`, and `RandomEncounterChoiceResult`.
 */

@Serializable
data class DistrictSummary(
  val key: String,
  val slug: String,
  val name: String,
  val blurb: String? = null,
  val protectionWhoresPerThug: Int? = null,
  val coveredWhores: Int? = null,
  val exposedFraction: Double? = null,
  val armedThugs: Int? = null,
  val unarmedThugs: Int? = null,
  val requiresArmedThugs: Boolean = false,
  val districtAccess: String? = null,
)

@Serializable
data class DistrictsResponse(
  val districts: List<DistrictSummary> = emptyList(),
)

@Serializable
data class PlayerSnapshotSummary(
  val cashCents: Long = 0L,
  val netWorthCents: Long = 0L,
  val turns: Int = 0,
  val whoreHappiness: Int = 0,
  val thugHappiness: Int = 0,
)

@Serializable
data class ResourceChangeSummary(
  val resource: String = "",
  val before: Long = 0L,
  val after: Long = 0L,
  val change: Long = 0L,
)

@Serializable
data class EncounterChoiceSummary(
  val key: String,
  val label: String,
  val text: String? = null,
)

@Serializable
data class RandomEncounterSummary(
  val id: String? = null,
  val key: String = "",
  val title: String = "",
  val text: String = "",
  val tone: String? = null,
  val choices: List<EncounterChoiceSummary> = emptyList(),
  val status: String? = null,
)

/** Generic envelope for every game action result; T is the action payload. */
@Serializable
data class GameActionResult<T>(
  val success: Boolean = false,
  val action: String = "",
  val before: PlayerSnapshotSummary = PlayerSnapshotSummary(),
  val after: PlayerSnapshotSummary = PlayerSnapshotSummary(),
  val changes: List<ResourceChangeSummary> = emptyList(),
  val result: T,
  val encounter: RandomEncounterSummary? = null,
)

@Serializable
data class ScoutResultSummary(
  val district: String = "",
  val turf: String? = null,
  val supply: String? = null,
  val heat: Int? = null,
  val whoresRecruited: Int = 0,
  val thugsRecruited: Int = 0,
  val grossCents: Long = 0L,
  val crewTakeCents: Long = 0L,
  val cashCents: Long = 0L,
)

@Serializable
data class EncounterChoiceResultSummary(
  val encounterId: String = "",
  val key: String = "",
  val title: String = "",
  val choice: String = "",
  val choiceLabel: String = "",
  val text: String = "",
  val cashCents: Long = 0L,
)

@Serializable
data class ScoutBody(
  val district: String,
  val turns: Int,
  val crewMemberIds: List<String>? = null,
  val actionId: String,
)

@Serializable
data class EncounterResolveBody(
  val choice: String,
  val actionId: String,
)
