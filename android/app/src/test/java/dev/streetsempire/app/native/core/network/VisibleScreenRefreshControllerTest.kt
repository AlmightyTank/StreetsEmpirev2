package dev.streetsempire.app.native.core.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VisibleScreenRefreshControllerTest {
  @Test
  fun `visible polling stops off-screen and stale resume refreshes immediately`() = runTest {
    val controller = VisibleScreenRefreshController(
      policy = ScreenRefreshPolicy(staleAfterMillis = 30_000, pollIntervalMillis = 15_000),
      nowMillis = { testScheduler.currentTime },
    )
    var featureReads = 0
    val featureRefresh: suspend () -> Boolean = {
      featureReads++
      true
    }

    val visibleJob = launch { controller.runWhileVisible(featureRefresh) }
    runCurrent()
    assertEquals(1, featureReads)

    advanceTimeBy(15_000)
    runCurrent()
    assertEquals(2, featureReads)

    visibleJob.cancel()
    advanceTimeBy(60_000)
    runCurrent()
    assertEquals("No requests run while the destination is off-screen.", 2, featureReads)

    val resumedJob = launch { controller.runWhileVisible(featureRefresh) }
    runCurrent()
    assertEquals("Stale feature data refreshes as soon as the screen resumes.", 3, featureReads)
    resumedJob.cancel()
  }

  @Test
  fun `fresh navigation resume does not duplicate a read`() = runTest {
    val controller = VisibleScreenRefreshController(
      policy = ScreenRefreshPolicy(staleAfterMillis = 60_000),
      nowMillis = { testScheduler.currentTime },
    )
    var reads = 0
    val refresh: suspend () -> Boolean = { reads++; true }

    controller.runWhileVisible(refresh)
    assertEquals(1, reads)
    advanceTimeBy(10_000)
    controller.runWhileVisible(refresh)

    assertEquals(1, reads)
    assertFalse(controller.isStale())
  }

  @Test
  fun `failed refresh remains stale and manual retry records success`() = runTest {
    val controller = VisibleScreenRefreshController(ScreenRefreshPolicy(staleAfterMillis = 60_000))

    assertFalse(controller.refreshNow { false })
    assertTrue(controller.isStale())
    assertTrue(controller.refreshNow { true })
    assertFalse(controller.isStale())
  }

  @Test
  fun `polling cannot be configured as an aggressive global loop`() {
    assertThrows(IllegalArgumentException::class.java) {
      ScreenRefreshPolicy(staleAfterMillis = 0, pollIntervalMillis = 1_000)
    }
  }
}
