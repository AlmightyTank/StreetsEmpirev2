package dev.streetsempire.app.native.core.network

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.testing.TestLifecycleOwner
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LifecycleRefreshEffectTest {
  @get:Rule
  val compose = createComposeRule()

  @Test
  fun effectRunsOnlyWhileNavigationLifecycleIsStarted() {
    val owner = TestLifecycleOwner(initialState = Lifecycle.State.CREATED)
    val controller = VisibleScreenRefreshController(ScreenRefreshPolicy(staleAfterMillis = 0))
    var reads = 0

    compose.setContent {
      CompositionLocalProvider(LocalLifecycleOwner provides owner) {
        LifecycleRefreshEffect(controller) {
          reads++
          true
        }
      }
    }

    compose.runOnIdle { assertEquals(0, reads) }
    compose.runOnIdle { owner.currentState = Lifecycle.State.STARTED }
    compose.waitForIdle()
    compose.runOnIdle { assertEquals(1, reads) }

    compose.runOnIdle { owner.currentState = Lifecycle.State.CREATED }
    compose.runOnIdle { owner.currentState = Lifecycle.State.STARTED }
    compose.waitForIdle()
    compose.runOnIdle { assertEquals(2, reads) }
  }
}
