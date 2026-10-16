package dev.streetsempire.app.native.feature.dashboard

import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.model.PlayerSummary
import dev.streetsempire.app.native.core.model.RoundSummary
import dev.streetsempire.app.native.core.ui.MessageTone

/** Season conditions the dashboard must distinguish, mirroring the web dashboard gates. */
enum class SeasonState { ACTIVE, PAUSED, PENDING, COMPLETED }

fun seasonStateFor(round: RoundSummary): SeasonState = when {
  round.status == "ENDED" || round.status == "ARCHIVED" -> SeasonState.COMPLETED
  round.paused != null -> SeasonState.PAUSED
  round.status == "ACTIVE" -> SeasonState.ACTIVE
  else -> SeasonState.PENDING
}

data class DashboardAlert(
  val kind: String,
  val title: String,
  val detail: String,
  val tone: MessageTone,
  /** Existing native section this alert points at, or null when it is informational only. */
  val section: String?,
)

/**
 * Attention items derived from authoritative state, mirroring the web
 * `dashboardAttentionState` rules in simplified form: locked up, dangerous
 * heat, convoy trouble, waiting runs, moves, wounded/unarmed crew, low morale,
 * and a full turn cap. An empty list means the operation is steady.
 */
fun alertsFor(player: PlayerSummary): List<DashboardAlert> = buildList {
  val heat = player.heat
  if (heat != null && heat.lockedUntil != null) {
    add(
      DashboardAlert(
        kind = "heat-locked",
        title = "You are locked up",
        detail = "Game actions are blocked until the lock lifts.",
        tone = MessageTone.Error,
        section = null,
      ),
    )
  } else if (heat != null && heat.max > 0 && heat.heat * 3 >= heat.max * 2) {
    add(
      DashboardAlert(
        kind = "heat-high",
        title = "Heat is cutting the take",
        detail = "Heat ${heat.heat} / ${heat.max} · cool it before the next run.",
        tone = MessageTone.Warning,
        section = null,
      ),
    )
  }

  val convoy = player.convoyAlert
  if (convoy != null) {
    add(
      DashboardAlert(
        kind = "convoy",
        title = if (convoy.kind == "tailed") "Your run is being tailed" else "An ally called for backup",
        detail = "Near ${convoy.cityName}.",
        tone = if (convoy.kind == "tailed") MessageTone.Error else MessageTone.Warning,
        section = "Crew & Turf",
      ),
    )
  }

  val run = player.run
  if (run != null && run.phase == "town") {
    add(
      DashboardAlert(
        kind = "run-waiting",
        title = "Your run is waiting in town",
        detail = "The crew is in ${run.cityName}; trading only happens while you are there.",
        tone = MessageTone.Warning,
        section = "Crew & Turf",
      ),
    )
  }

  val moving = player.moving
  if (moving != null) {
    add(
      DashboardAlert(
        kind = "moving",
        title = "Your operation is moving",
        detail = "Relocating to ${moving.toName}.",
        tone = MessageTone.Info,
        section = "Crew & Turf",
      ),
    )
  }

  if (player.resources.woundedThugs > 0) {
    add(
      DashboardAlert(
        kind = "wounded",
        title = "${player.resources.woundedThugs} thugs are wounded",
        detail = "Wounded thugs cannot work, defend, raid, or cover the street.",
        tone = MessageTone.Warning,
        section = "Combat",
      ),
    )
  }

  if (player.resources.unarmedThugs > 0) {
    add(
      DashboardAlert(
        kind = "unarmed",
        title = "${player.resources.unarmedThugs} fit thugs are unarmed",
        detail = "Unarmed crew lower morale and do not count as street cover.",
        tone = MessageTone.Warning,
        section = "Actions",
      ),
    )
  }

  if (player.happiness.whore < 66) {
    add(
      DashboardAlert(
        kind = "morale-whore",
        title = "Street crew morale is ${player.happiness.whore}%",
        detail = "Fix the biggest supply, protection, or payout drag.",
        tone = MessageTone.Warning,
        section = "Actions",
      ),
    )
  }

  if (player.happiness.thug < 66) {
    add(
      DashboardAlert(
        kind = "morale-thug",
        title = "Thug morale is ${player.happiness.thug}%",
        detail = "Beer and weapons are the first things to check.",
        tone = MessageTone.Warning,
        section = "Actions",
      ),
    )
  }

  if (player.turns.turns >= player.turns.turnCap) {
    add(
      DashboardAlert(
        kind = "turn-cap",
        title = "Turns are at the cap",
        detail = "New turn generation is paused until you spend some.",
        tone = MessageTone.Info,
        section = "Actions",
      ),
    )
  }
}

fun snapshotAlerts(snapshot: GameSnapshotDto): List<DashboardAlert> =
  if (seasonStateFor(snapshot.round) == SeasonState.ACTIVE) alertsFor(snapshot.player) else emptyList()
