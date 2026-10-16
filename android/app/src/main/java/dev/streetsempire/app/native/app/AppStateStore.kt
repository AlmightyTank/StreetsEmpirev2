package dev.streetsempire.app.native.app

import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.model.CurrentRoundDto
import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.model.PlayerSummary
import dev.streetsempire.app.native.core.model.RoundSummary
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.core.network.CredentialStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class BootstrapPhase {
  SignedOut,
  Loading,
  Onboarding,
  Ready,
  Failed,
}

data class AppState(
  val account: AccountDto? = null,
  val round: RoundSummary? = null,
  val player: PlayerSummary? = null,
  val unreadNotifications: Int = 0,
  val bootstrapPhase: BootstrapPhase = BootstrapPhase.SignedOut,
  val bootstrapError: String? = null,
)

/**
 * Activity-owned source of truth for identity and cross-feature summary state.
 * Feature stores publish authoritative server refreshes here; no screen mutates
 * balances or rewards optimistically.
 */
class AppStateStore(private val credentials: CredentialStore) {
  private val mutableState = MutableStateFlow(
    AppState(
      bootstrapPhase = if (credentials.sessionToken() == null) {
        BootstrapPhase.SignedOut
      } else {
        BootstrapPhase.Loading
      },
    ),
  )
  val state: StateFlow<AppState> = mutableState.asStateFlow()

  fun beginBootstrap(account: AccountDto? = null) {
    mutableState.update {
      it.copy(account = account ?: it.account, bootstrapPhase = BootstrapPhase.Loading, bootstrapError = null)
    }
  }

  fun applyAccount(account: AccountDto) {
    mutableState.update {
      it.copy(
        account = account,
        bootstrapPhase = if (account.verificationRequired || account.rulesAcceptanceRequired) {
          BootstrapPhase.Onboarding
        } else {
          it.bootstrapPhase
        },
        bootstrapError = null,
      )
    }
  }

  fun applyRound(current: CurrentRoundDto) {
    mutableState.update {
      it.copy(
        round = current.round,
        player = current.me,
        bootstrapPhase = if (current.me == null) BootstrapPhase.Onboarding else BootstrapPhase.Ready,
        bootstrapError = null,
      )
    }
  }

  fun applyDashboard(snapshot: GameSnapshotDto) {
    mutableState.update {
      it.copy(
        round = snapshot.round,
        player = snapshot.player,
        bootstrapPhase = BootstrapPhase.Ready,
        bootstrapError = null,
      )
    }
  }

  fun applyUnreadNotifications(count: Int) {
    require(count >= 0) { "Unread notification count cannot be negative." }
    mutableState.update { it.copy(unreadNotifications = count) }
  }

  /** Atomically propagates a bootstrap/foreground refresh to every observer. */
  fun applyRefresh(
    account: AccountDto,
    currentRound: CurrentRoundDto? = null,
    dashboard: GameSnapshotDto? = null,
    unreadNotifications: Int = state.value.unreadNotifications,
  ) {
    val round = dashboard?.round ?: currentRound?.round
    val player = dashboard?.player ?: currentRound?.me
    val gated = account.verificationRequired || account.rulesAcceptanceRequired || player == null
    mutableState.value = AppState(
      account = account,
      round = round,
      player = player,
      unreadNotifications = unreadNotifications.coerceAtLeast(0),
      bootstrapPhase = if (gated) BootstrapPhase.Onboarding else BootstrapPhase.Ready,
    )
  }

  fun failBootstrap(message: String) {
    mutableState.update { it.copy(bootstrapPhase = BootstrapPhase.Failed, bootstrapError = message) }
  }

  /** Returns true when a failure invalidated the session and cleared credentials. */
  fun handleFailure(error: ApiError): Boolean {
    if (!error.isUnauthenticated) return false
    invalidateSession()
    return true
  }

  fun invalidateSession() {
    credentials.clear()
    mutableState.value = AppState(bootstrapPhase = BootstrapPhase.SignedOut)
  }
}
