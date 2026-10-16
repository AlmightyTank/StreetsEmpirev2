package dev.streetsempire.app.native.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.model.CurrentRoundDto
import dev.streetsempire.app.native.core.model.RulesAgreementDto
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.feature.auth.OnboardingGateway
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class OnboardingStep(val number: Int, val label: String) {
  Verify(1, "Verify"),
  Rules(2, "Rules"),
  Join(3, "Join"),
}

/** Immutable onboarding state: email gate, rules/16+ gate, then New York season join. */
data class OnboardingUiState(
  val loading: Boolean = true,
  val account: AccountDto? = null,
  val agreement: RulesAgreementDto? = null,
  val currentRound: CurrentRoundDto? = null,
  val busy: Boolean = false,
  val error: String? = null,
  val notice: String? = null,
) {
  val step: OnboardingStep = when {
    (account?.verificationRequired ?: true) -> OnboardingStep.Verify
    account?.rulesAcceptanceRequired == true -> OnboardingStep.Rules
    else -> OnboardingStep.Join
  }
}

/**
 * Owns the Verify → Rules → Join state machine. The screen only renders
 * [state] and forwards intents; navigation callbacks fire exactly once per
 * authoritative server response.
 */
class OnboardingViewModel(
  private val gateway: OnboardingGateway,
  private val onComplete: () -> Unit = {},
  private val onAccountChanged: (AccountDto) -> Unit = {},
  private val onRoundChanged: (CurrentRoundDto) -> Unit = {},
  private val onSessionExpired: () -> Unit = {},
  private val onSignedOut: () -> Unit = {},
) : ViewModel() {
  private val _state = MutableStateFlow(OnboardingUiState())
  val state: StateFlow<OnboardingUiState> = _state.asStateFlow()

  init {
    bootstrap()
  }

  fun bootstrap() {
    viewModelScope.launch {
      _state.update { it.copy(loading = true, error = null) }
      try {
        val freshAccount = gateway.me()
        _state.update { it.copy(account = freshAccount) }
        onAccountChanged(freshAccount)
        when {
          freshAccount.verificationRequired -> Unit
          freshAccount.rulesAcceptanceRequired -> {
            _state.update { it.copy(agreement = gateway.rulesAgreement()) }
          }
          else -> loadRound()
        }
      } catch (caught: ApiError) {
        _state.update { it.copy(error = caught.message) }
        if (caught.isUnauthenticated) onSessionExpired()
      } finally {
        _state.update { it.copy(loading = false) }
      }
    }
  }

  private suspend fun loadRound() {
    val round = gateway.currentRound()
    _state.update { it.copy(currentRound = round) }
    onRoundChanged(round)
    if (round.me != null) onComplete()
  }

  fun resendVerification() {
    viewModelScope.launch {
      _state.update { it.copy(busy = true, error = null, notice = null) }
      try {
        _state.update { it.copy(notice = gateway.requestEmailVerification()) }
      } catch (caught: ApiError) {
        _state.update { it.copy(error = caught.message) }
        if (caught.isUnauthenticated) onSessionExpired()
      } finally {
        _state.update { it.copy(busy = false) }
      }
    }
  }

  fun acceptRules(version: String) {
    viewModelScope.launch {
      _state.update { it.copy(busy = true, error = null) }
      try {
        val account = gateway.acceptRules(version)
        _state.update { it.copy(account = account, notice = "Rules accepted. One last step.") }
        onAccountChanged(account)
        loadRound()
      } catch (caught: ApiError) {
        _state.update { it.copy(error = caught.message) }
        if (caught.isUnauthenticated) onSessionExpired()
      } finally {
        _state.update { it.copy(busy = false) }
      }
    }
  }

  fun joinSeason() {
    viewModelScope.launch {
      _state.update { it.copy(busy = true, error = null) }
      try {
        val joined = gateway.joinCurrentRound()
        _state.update { it.copy(currentRound = joined) }
        onRoundChanged(joined)
        if (joined.me != null) {
          onComplete()
        } else {
          _state.update { it.copy(error = "The season did not return your player. Try again.") }
        }
      } catch (caught: ApiError) {
        _state.update { it.copy(error = caught.message) }
        if (caught.isUnauthenticated) onSessionExpired()
      } finally {
        _state.update { it.copy(busy = false) }
      }
    }
  }

  fun signOut() {
    viewModelScope.launch {
      try {
        gateway.logout()
      } finally {
        onSignedOut()
      }
    }
  }
}

class OnboardingViewModelFactory(
  private val gateway: OnboardingGateway,
  private val onComplete: () -> Unit = {},
  private val onAccountChanged: (AccountDto) -> Unit = {},
  private val onRoundChanged: (CurrentRoundDto) -> Unit = {},
  private val onSessionExpired: () -> Unit = {},
  private val onSignedOut: () -> Unit = {},
) : ViewModelProvider.Factory {
  @Suppress("UNCHECKED_CAST")
  override fun <T : ViewModel> create(modelClass: Class<T>): T {
    return OnboardingViewModel(gateway, onComplete, onAccountChanged, onRoundChanged, onSessionExpired, onSignedOut) as T
  }
}
