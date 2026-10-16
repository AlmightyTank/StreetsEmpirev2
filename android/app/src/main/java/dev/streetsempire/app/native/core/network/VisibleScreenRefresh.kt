package dev.streetsempire.app.native.core.network

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private const val MINIMUM_POLL_INTERVAL_MILLIS = 15_000L

/**
 * Refresh policy for one visible destination. Polling is opt-in and deliberately
 * bounded so a feature cannot accidentally become a frame-rate or global poll.
 */
data class ScreenRefreshPolicy(
  val staleAfterMillis: Long,
  val pollIntervalMillis: Long? = null,
) {
  init {
    require(staleAfterMillis >= 0) { "Stale duration cannot be negative." }
    require(pollIntervalMillis == null || pollIntervalMillis >= MINIMUM_POLL_INTERVAL_MILLIS) {
      "Visible-screen polling must be at least ${MINIMUM_POLL_INTERVAL_MILLIS}ms."
    }
  }
}

/**
 * Tracks freshness for one screen. Create one controller per feature/ViewModel;
 * never share one as a global `/game/me` polling loop.
 */
class VisibleScreenRefreshController(
  private val policy: ScreenRefreshPolicy,
  private val nowMillis: () -> Long = { System.currentTimeMillis() },
) {
  private val refreshMutex = Mutex()
  private var lastSuccessfulRefreshAt: Long? = null

  fun isStale(): Boolean {
    val last = lastSuccessfulRefreshAt ?: return true
    return nowMillis() - last >= policy.staleAfterMillis
  }

  /** Runs only while its caller is active. Cancellation stops delay and refresh work. */
  suspend fun runWhileVisible(refresh: suspend () -> Boolean) {
    if (isStale()) refreshAndRecord(refresh)

    val interval = policy.pollIntervalMillis ?: return
    while (currentCoroutineContext().isActive) {
      delay(interval)
      refreshAndRecord(refresh)
    }
  }

  /** User-initiated refresh uses the same overlap protection as lifecycle work. */
  suspend fun refreshNow(refresh: suspend () -> Boolean): Boolean = refreshAndRecord(refresh)

  private suspend fun refreshAndRecord(refresh: suspend () -> Boolean): Boolean = refreshMutex.withLock {
    val succeeded = refresh()
    if (succeeded) lastSuccessfulRefreshAt = nowMillis()
    succeeded
  }
}

/**
 * Starts feature-scoped refresh work while this navigation entry is visible and
 * cancels it when the entry falls below STARTED.
 */
@Composable
fun LifecycleRefreshEffect(
  controller: VisibleScreenRefreshController,
  refreshKey: Any? = Unit,
  refresh: suspend () -> Boolean,
) {
  val lifecycleOwner = LocalLifecycleOwner.current
  val currentRefresh = rememberUpdatedState(refresh)

  LaunchedEffect(lifecycleOwner, controller, refreshKey) {
    lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
      controller.runWhileVisible { currentRefresh.value() }
    }
  }
}
