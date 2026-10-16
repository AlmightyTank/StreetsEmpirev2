package dev.streetsempire.app.native.feature.actions

import dev.streetsempire.app.native.core.model.DistrictSummary
import dev.streetsempire.app.native.core.model.DistrictsResponse
import dev.streetsempire.app.native.core.model.EncounterChoiceResultSummary
import dev.streetsempire.app.native.core.model.EncounterResolveBody
import dev.streetsempire.app.native.core.model.GameActionResult
import dev.streetsempire.app.native.core.model.ScoutBody
import dev.streetsempire.app.native.core.model.ScoutResultSummary
import dev.streetsempire.app.native.core.network.ApiClient

/**
 * Street action transport. Scout and encounter endpoints are idempotent on
 * `(roundPlayerId, actionId)`, so uncertain outcomes are retried with the
 * exact same action ID and the server returns the original result.
 */
interface ActionGateway {
  suspend fun districts(): List<DistrictSummary>
  suspend fun scout(district: String, turns: Int, actionId: String): GameActionResult<ScoutResultSummary>
  suspend fun resolveEncounter(
    encounterId: String,
    choice: String,
    actionId: String,
  ): GameActionResult<EncounterChoiceResultSummary>
}

class ActionRepository(private val api: ApiClient) : ActionGateway {
  override suspend fun districts(): List<DistrictSummary> =
    api.getJson<DistrictsResponse>("/game/districts").districts

  override suspend fun scout(
    district: String,
    turns: Int,
    actionId: String,
  ): GameActionResult<ScoutResultSummary> =
    api.postJson<ScoutBody, GameActionResult<ScoutResultSummary>>(
      "/game/scout",
      ScoutBody(district = district, turns = turns, actionId = actionId),
    )

  override suspend fun resolveEncounter(
    encounterId: String,
    choice: String,
    actionId: String,
  ): GameActionResult<EncounterChoiceResultSummary> =
    api.postJson<EncounterResolveBody, GameActionResult<EncounterChoiceResultSummary>>(
      "/game/encounters/$encounterId/resolve",
      EncounterResolveBody(choice = choice, actionId = actionId),
    )
}
