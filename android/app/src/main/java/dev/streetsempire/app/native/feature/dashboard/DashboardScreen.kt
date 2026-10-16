package dev.streetsempire.app.native.feature.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.ui.BlockingErrorState
import dev.streetsempire.app.native.core.ui.EmptyState
import dev.streetsempire.app.native.core.ui.LoadingState
import dev.streetsempire.app.native.core.ui.MessageBanner
import dev.streetsempire.app.native.core.ui.SeEyebrow
import dev.streetsempire.app.native.core.ui.SePanel
import dev.streetsempire.app.native.core.ui.SeRow
import dev.streetsempire.app.native.core.ui.SeStat
import dev.streetsempire.app.native.core.ui.formatDuration
import dev.streetsempire.app.native.core.ui.formatUsdCents
import dev.streetsempire.app.native.core.ui.formatWholeNumber

fun humanizeActivityType(type: String): String =
  type.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }

/**
 * Native Command Center. Season, identity, resources, turns, timers, alerts,
 * and recent activity all come from the authoritative `/game/me` snapshot;
 * nothing here is computed locally beyond presentation formatting.
 */
@Composable
fun DashboardScreen(
  gateway: DashboardGateway,
  onSessionExpired: () -> Unit,
  onSnapshot: (GameSnapshotDto) -> Unit,
  onOpenSection: (String) -> Unit,
  modifier: Modifier = Modifier,
  refreshSignal: Int = 0,
  vm: DashboardViewModel = viewModel(
    factory = DashboardViewModelFactory(gateway, onSessionExpired, onSnapshot),
  ),
) {
  val state by vm.state.collectAsStateWithLifecycle()
  LaunchedEffect(gateway, refreshSignal) { vm.load() }
  DashboardBody(state = state, onRetry = vm::retry, onOpenSection = onOpenSection, modifier = modifier)
}

@Composable
fun DashboardBody(
  state: DashboardUiState,
  onRetry: () -> Unit,
  onOpenSection: (String) -> Unit,
  modifier: Modifier = Modifier,
) {
  if (state.loading && state.snapshot == null) {
    LoadingState(modifier = modifier.testTag("dashboard-screen"))
    return
  }
  state.error?.let {
    BlockingErrorState(message = it, onRetry = onRetry, modifier = modifier.testTag("dashboard-error"))
    return
  }
  val snapshot = state.snapshot ?: return
  DashboardContent(snapshot = snapshot, onOpenSection = onOpenSection, modifier = modifier.testTag("dashboard-screen"))
}

@Composable
private fun DashboardContent(
  snapshot: GameSnapshotDto,
  onOpenSection: (String) -> Unit,
  modifier: Modifier = Modifier,
) {
  val round = snapshot.round
  val player = snapshot.player
  val seasonState = seasonStateFor(round)
  val alerts = snapshotAlerts(snapshot)

  LazyColumn(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
    item {
      Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SeEyebrow("Season operation · ${player.city.name}")
        Text(
          "Command Center",
          style = MaterialTheme.typography.headlineSmall,
          modifier = Modifier.semantics { heading() },
        )
        Text(
          "${player.displayName} #${player.publicPimpId}",
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          style = MaterialTheme.typography.bodyMedium,
        )
      }
    }

    item {
      SePanel(title = round.name, aside = round.status, modifier = Modifier.testTag("dashboard-season")) {
        Column {
          SeRow("Players", formatWholeNumber(round.playerCount.toLong()))
          when (seasonState) {
            SeasonState.ACTIVE -> SeRow(
              "Time left",
              if (round.msRemaining > 0) formatDuration(round.msRemaining) else "Closing out",
              strong = true,
            )
            SeasonState.PAUSED -> SeRow("Time left", "Paused", strong = true)
            SeasonState.PENDING -> SeRow("Starts", round.startsAt)
            SeasonState.COMPLETED -> SeRow("Ended", round.endsAt, strong = true)
          }
          SeRow("Turns", "${player.turns.turns}/${player.turns.turnCap} · +${player.turns.turnsGeneratedNextTick} next")
        }
      }
    }

    if (seasonState == SeasonState.PAUSED) {
      item {
        MessageBanner(
          message = "The season is paused${round.paused?.reason?.let { ": $it" } ?: "."} Actions wait until it lifts.",
          modifier = Modifier.testTag("dashboard-paused"),
        )
      }
    }
    if (seasonState == SeasonState.PENDING) {
      item {
        MessageBanner(
          message = "The season hasn't started yet. Your crew will be ready when the clock opens.",
          modifier = Modifier.testTag("dashboard-pending"),
        )
      }
    }
    if (seasonState == SeasonState.COMPLETED) {
      item {
        MessageBanner(
          message = "Season complete. Final net worth ${formatUsdCents(player.netWorthCents)}. Your legacy is saved.",
          modifier = Modifier.testTag("dashboard-completed"),
        )
      }
    }

    if (seasonState == SeasonState.ACTIVE || seasonState == SeasonState.PAUSED) {
      item {
        SePanel(title = "Empire at a glance", modifier = Modifier.testTag("dashboard-stats")) {
          Column {
            Row(Modifier.fillMaxWidth()) {
              SeStat("Cash", formatUsdCents(player.resources.cashCents), modifier = Modifier.weight(1f))
              SeStat("Net worth", formatUsdCents(player.netWorthCents), modifier = Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth()) {
              SeStat(
                "Fit crew",
                "${formatWholeNumber(player.resources.fitThugs.toLong())}/${formatWholeNumber(player.resources.thugs.toLong())}",
                modifier = Modifier.weight(1f),
              )
              SeStat(
                "Heat",
                player.heat?.let { "${it.heat} / ${it.max}" } ?: "—",
                sub = if (player.heat?.lockedUntil != null) "Locked up" else null,
                modifier = Modifier.weight(1f),
              )
            }
            Row(Modifier.fillMaxWidth()) {
              SeStat(
                "City rank",
                player.rank.local?.let { "#${formatWholeNumber(it.toLong())}" } ?: "Unranked",
                modifier = Modifier.weight(1f),
              )
              SeStat(
                "Morale",
                "${player.happiness.thug}% / ${player.happiness.whore}%",
                sub = "Thugs / street crew",
                modifier = Modifier.weight(1f),
              )
            }
          }
        }
      }

      if (alerts.isEmpty()) {
        item {
          MessageBanner(
            "The operation is steady. No urgent heat, crew, travel, or turn problems right now.",
            modifier = Modifier.testTag("dashboard-steady"),
          )
        }
      } else {
        item {
          Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag("dashboard-alerts")) {
            SeEyebrow("Needs attention")
            alerts.forEach { alert ->
              val alertModifier = Modifier
                .testTag("dashboard-alert-${alert.kind}")
                .then(if (alert.section != null) Modifier.clickable { onOpenSection(alert.section) } else Modifier)
              MessageBanner(message = "${alert.title} — ${alert.detail}", tone = alert.tone, modifier = alertModifier)
            }
          }
        }
      }

      item {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          SeEyebrow("Make a move")
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { onOpenSection("Actions") }, modifier = Modifier.weight(1f).testTag("dashboard-action-actions")) {
              Text("Actions")
            }
            Button(onClick = { onOpenSection("Combat") }, modifier = Modifier.weight(1f).testTag("dashboard-action-combat")) {
              Text("Raids")
            }
          }
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { onOpenSection("Casino") }, modifier = Modifier.weight(1f).testTag("dashboard-action-casino")) {
              Text("Casino")
            }
            Button(onClick = { onOpenSection("Crew & Turf") }, modifier = Modifier.weight(1f).testTag("dashboard-action-crew")) {
              Text("Crew & turf")
            }
          }
        }
      }
    }

    item {
      SePanel(title = "Latest activity", modifier = Modifier.testTag("dashboard-activity")) {
        if (snapshot.recentActivity.isEmpty()) {
          EmptyState(
            title = "No recent moves yet",
            message = "Scout a district to get on the board.",
            modifier = Modifier.testTag("dashboard-empty-activity"),
          )
        } else {
          Column {
            snapshot.recentActivity.forEach { item ->
              SeRow(humanizeActivityType(item.type), item.createdAt)
            }
          }
        }
      }
    }
  }
}
