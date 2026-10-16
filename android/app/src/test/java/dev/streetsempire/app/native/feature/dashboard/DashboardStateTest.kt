package dev.streetsempire.app.native.feature.dashboard

import dev.streetsempire.app.native.core.model.ActivityItem
import dev.streetsempire.app.native.core.model.CitySummary
import dev.streetsempire.app.native.core.model.ConvoyAlertSummary
import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.model.HappinessSummary
import dev.streetsempire.app.native.core.model.HeatSummary
import dev.streetsempire.app.native.core.model.MovingSummary
import dev.streetsempire.app.native.core.model.PlayerSummary
import dev.streetsempire.app.native.core.model.RankSummary
import dev.streetsempire.app.native.core.model.ResourcesSummary
import dev.streetsempire.app.native.core.model.RoundPauseDto
import dev.streetsempire.app.native.core.model.RoundSummary
import dev.streetsempire.app.native.core.model.RunSummary
import dev.streetsempire.app.native.core.model.TurnsDto
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private fun round(status: String, paused: RoundPauseDto? = null) = RoundSummary(
  id = "round_1",
  name = "Empire Season",
  slug = "empire-season",
  status = status,
  rulesetId = "classic-og-v3.0-a",
  rulesetVersion = "3.0.0",
  startsAt = "2026-10-15T10:00:00.000Z",
  endsAt = "2026-10-22T10:00:00.000Z",
  registrationOpensAt = null,
  msRemaining = 604_800_000,
  playerCount = 428,
  paused = paused,
)

private fun player(
  turns: Int = 42,
  turnCap: Int = 100,
  wounded: Int = 0,
  unarmed: Int = 0,
  whore: Int = 80,
  thug: Int = 70,
  heat: HeatSummary? = HeatSummary(heat = 12, max = 100, lockedUntil = null),
  run: RunSummary? = null,
  moving: MovingSummary? = null,
  convoy: ConvoyAlertSummary? = null,
) = PlayerSummary(
  id = "player_1",
  publicPimpId = 101,
  displayName = "MidnightBoss",
  city = CitySummary(slug = "new-york", name = "New York City"),
  payoutPercent = 50,
  netWorthCents = 12_845_700,
  resources = ResourcesSummary(
    cashCents = 400_000, whores = 2, thugs = 4, fitThugs = 4,
    woundedThugs = wounded, postedThugs = 0, unarmedThugs = unarmed,
    product = 10, condoms = 25, beer = 12, medicine = 3,
  ),
  turns = TurnsDto(turns = turns, turnCap = turnCap, nextTurnAt = "2026-10-15T10:05:00.000Z", turnsGeneratedNextTick = 5),
  happiness = HappinessSummary(whore = whore, thug = thug),
  heat = heat,
  run = run,
  moving = moving,
  convoyAlert = convoy,
  rank = RankSummary(local = 3, national = 41),
)

class DashboardStateTest {
  @Test
  fun `active round without pause is active`() {
    assertEquals(SeasonState.ACTIVE, seasonStateFor(round("ACTIVE")))
  }

  @Test
  fun `paused round is paused`() {
    assertEquals(
      SeasonState.PAUSED,
      seasonStateFor(round("ACTIVE", RoundPauseDto(since = "2026-10-15T11:00:00.000Z", reason = "Deploying a fix"))),
    )
  }

  @Test
  fun `scheduled and registration rounds are pending`() {
    assertEquals(SeasonState.PENDING, seasonStateFor(round("SCHEDULED")))
    assertEquals(SeasonState.PENDING, seasonStateFor(round("REGISTRATION")))
  }

  @Test
  fun `ended and archived rounds are completed`() {
    assertEquals(SeasonState.COMPLETED, seasonStateFor(round("ENDED")))
    assertEquals(SeasonState.COMPLETED, seasonStateFor(round("ARCHIVED")))
  }

  @Test
  fun `steady operation raises no alerts`() {
    assertTrue(alertsFor(player()).isEmpty())
  }

  @Test
  fun `full turn cap raises an informational alert`() {
    val kinds = alertsFor(player(turns = 100)).map { it.kind }
    assertTrue(kinds.contains("turn-cap"))
  }

  @Test
  fun `wounded crew raises a combat alert`() {
    val alert = alertsFor(player(wounded = 2)).single { it.kind == "wounded" }
    assertEquals("Combat", alert.section)
  }

  @Test
  fun `locked heat blocks and alerts as an error`() {
    val alert = alertsFor(player(heat = HeatSummary(heat = 100, max = 100, lockedUntil = "2026-10-16T10:00:00.000Z")))
      .single { it.kind == "heat-locked" }
    assertEquals(dev.streetsempire.app.native.core.ui.MessageTone.Error, alert.tone)
  }

  @Test
  fun `low morale on either crew raises warnings`() {
    val kinds = alertsFor(player(whore = 40, thug = 50)).map { it.kind }
    assertTrue(kinds.contains("morale-whore"))
    assertTrue(kinds.contains("morale-thug"))
  }

  @Test
  fun `tailed convoy is an error pointing at crew and turf`() {
    val alert = alertsFor(player(convoy = ConvoyAlertSummary(kind = "tailed", cityName = "Chicago"))).single { it.kind == "convoy" }
    assertEquals(dev.streetsempire.app.native.core.ui.MessageTone.Error, alert.tone)
    assertEquals("Crew & Turf", alert.section)
  }

  @Test
  fun `non-active seasons suppress gameplay alerts`() {
    val snapshot = GameSnapshotDto(
      round = round("ENDED"),
      player = player(wounded = 3, turns = 100),
      recentActivity = emptyList(),
    )
    assertTrue(snapshotAlerts(snapshot).isEmpty())
  }

  @Test
  fun `activity payload is preserved verbatim`() {
    val item = ActivityItem(
      id = "activity_1",
      type = "SCOUT",
      payload = JsonPrimitive("seen"),
      createdAt = "2026-10-15T10:00:00.000Z",
    )
    assertEquals("Scout", humanizeActivityType(item.type))
  }
}
