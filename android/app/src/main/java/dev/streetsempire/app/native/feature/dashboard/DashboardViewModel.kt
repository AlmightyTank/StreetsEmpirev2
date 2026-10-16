package dev.streetsempire.app.native.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.network.ApiError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DashboardUiState(
  val loading: Boolean = true,
  val snapshot: GameSnapshotDto? = null,
  val error: String? = null,
)

class DashboardViewModel(
  private val gateway: DashboardGateway,
  private val onSessionExpired: () -> Unit = {},
  private val onSnapshot: (GameSnapshotDto) -> Unit = {},
) : ViewModel() {
  private val _state = MutableStateFlow(DashboardUiState())
  val state: StateFlow<DashboardUiState> = _state.asStateFlow()

  fun load() {
    val current = _state.value
    _state.value = current.copy(loading = true, error = null)
    viewModelScope.launch {
      try {
        val snapshot = gateway.snapshot()
        _state.value = DashboardUiState(loading = false, snapshot = snapshot)
        onSnapshot(snapshot)
      } catch (e: ApiError) {
        if (e.isUnauthenticated) {
          onSessionExpired()
          return@launch
        }
        _state.value = DashboardUiState(loading = false, error = e.message)
      }
    }
  }

  fun retry() = load()
}

class DashboardViewModelFactory(
  private val gateway: DashboardGateway,
  private val onSessionExpired: () -> Unit = {},
  private val onSnapshot: (GameSnapshotDto) -> Unit = {},
) : ViewModelProvider.Factory {
  @Suppress("UNCHECKED_CAST")
  override fun <T : ViewModel> create(modelClass: Class<T>): T {
    return DashboardViewModel(gateway, onSessionExpired, onSnapshot) as T
  }
}
