package dev.streetsempire.app.native.feature.dashboard

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.streetsempire.app.native.core.model.ActivityItem
import dev.streetsempire.app.native.core.model.CitySummary
import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.model.HappinessSummary
import dev.streetsempire.app.native.core.model.HeatSummary
import dev.streetsempire.app.native.core.model.PlayerSummary
import dev.streetsempire.app.native.core.model.RankSummary
import dev.streetsempire.app.native.core.model.ResourcesSummary
import dev.streetsempire.app.native.core.model.RoundPauseDto
import dev.streetsempire.app.native.core.model.RoundSummary
import dev.streetsempire.app.native.core.model.TurnsDto
import dev.streetsempire.app.native.core.ui.StreetsEmpireTheme
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

private fun testRound(status: String, paused: RoundPauseDto? = null) = RoundSummary(
  id = "round_1", name = "Empire Season", slug = "empire-season", status = status,
  rulesetId = "classic-og-v3.0-a", rulesetVersion = "3.0.0",
  startsAt = "2026-10-15T10:00:00.000Z", endsAt = "2026-10-22T10:00:00.000Z",
  registrationOpensAt = null, msRemaining = 604_800_000, playerCount = 428, paused = paused,
)

private fun testPlayer(wounded: Int = 0) = PlayerSummary(
  id = "player_1", publicPimpId = 101, displayName = "MidnightBoss",
  city = CitySummary(slug = "new-york", name = "New York City"),
  payoutPercent = 50, netWorthCents = 12_845_700,
  resources = ResourcesSummary(
    cashCents = 400_000, whores = 2, thugs = 4, fitThugs = 4,
    woundedThugs = wounded, postedThugs = 0, unarmedThugs = 0,
    product = 10, condoms = 25, beer = 12, medicine = 3,
  ),
  turns = TurnsDto(turns = 42, turnCap = 100, nextTurnAt = "2026-10-15T10:05:00.000Z", turnsGeneratedNextTick = 5),
  happiness = HappinessSummary(whore = 80, thug = 70),
  heat = HeatSummary(heat = 12, max = 100, lockedUntil = null),
  run = null, moving = null, convoyAlert = null,
  rank = RankSummary(local = 3, national = 41),
)

private fun testActivity() = ActivityItem(
  id = "activity_1", type = "SCOUT",
  payload = JsonPrimitive("seen"), createdAt = "2026-10-15T10:00:00.000Z",
)

@RunWith(AndroidJUnit4::class)
class DashboardScreenTest {
  @get:Rule
  val compose = createComposeRule()

  private fun show(state: DashboardUiState, onRetry: () -> Unit = {}, opened: MutableList<String> = mutableListOf()) {
    compose.setContent {
      StreetsEmpireTheme {
        DashboardBody(state = state, onRetry = onRetry, onOpenSection = { opened.add(it) })
      }
    }
  }

  private fun activeState(wounded: Int = 0, activity: List<ActivityItem> = listOf(testActivity())) =
    DashboardUiState(loading = false, snapshot = GameSnapshotDto(testRound("ACTIVE"), testPlayer(wounded), activity))

  @Test
  fun activeSeasonShowsStatsActivityAndSteadyState() {
    show(activeState())
    compose.onNodeWithTag("dashboard-screen").assertIsDisplayed()
    compose.onNodeWithTag("dashboard-season").assertIsDisplayed()
    compose.onNodeWithTag("dashboard-stats").assertIsDisplayed()
    compose.onNodeWithTag("dashboard-steady").assertIsDisplayed()
    compose.onNodeWithText("Scout").assertIsDisplayed()
    compose.onNodeWithText("MidnightBoss #101").assertIsDisplayed()
  }

  @Test
  fun woundedCrewAlertOpensCombat() {
    val opened = mutableListOf<String>()
    show(activeState(wounded = 2), opened = opened)
    compose.onNodeWithTag("dashboard-alert-wounded").assertIsDisplayed()
    compose.onNodeWithTag("dashboard-alert-wounded").performClick()
    assertEquals(listOf("Combat"), opened)
  }

  @Test
  fun pausedSeasonShowsBanner() {
    show(
      DashboardUiState(
        loading = false,
        snapshot = GameSnapshotDto(
          testRound("ACTIVE", RoundPauseDto(since = "2026-10-15T11:00:00.000Z", reason = "Deploying a fix")),
          testPlayer(),
          listOf(testActivity()),
        ),
      ),
    )
    compose.onNodeWithTag("dashboard-paused").assertIsDisplayed()
    compose.onNodeWithText("Deploying a fix", substring = true).assertIsDisplayed()
  }

  @Test
  fun pendingSeasonExplainsNotStarted() {
    show(DashboardUiState(loading = false, snapshot = GameSnapshotDto(testRound("SCHEDULED"), testPlayer(), emptyList())))
    compose.onNodeWithTag("dashboard-pending").assertIsDisplayed()
    compose.onAllNodesWithTag("dashboard-stats").assertCountEquals(0)
  }

  @Test
  fun completedSeasonShowsFinalResult() {
    show(DashboardUiState(loading = false, snapshot = GameSnapshotDto(testRound("ENDED"), testPlayer(), emptyList())))
    compose.onNodeWithTag("dashboard-completed").assertIsDisplayed()
    compose.onAllNodesWithTag("dashboard-stats").assertCountEquals(0)
  }

  @Test
  fun emptyActivityShowsEmptyState() {
    show(activeState(activity = emptyList()))
    compose.onNodeWithTag("dashboard-empty-activity").assertIsDisplayed()
  }

  @Test
  fun errorOffersRetry() {
    var retries = 0
    show(DashboardUiState(loading = false, error = "The server hiccuped."), onRetry = { retries++ })
    compose.onNodeWithTag("dashboard-error").assertIsDisplayed()
    compose.onNodeWithTag("retry-action").performClick()
    assertEquals(1, retries)
  }
}
