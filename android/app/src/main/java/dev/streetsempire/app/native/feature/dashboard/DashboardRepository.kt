package dev.streetsempire.app.native.feature.dashboard

import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.network.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

interface DashboardGateway {
  suspend fun snapshot(): GameSnapshotDto
}

class DashboardRepository(private val api: ApiClient) : DashboardGateway {
  override suspend fun snapshot(): GameSnapshotDto = withContext(Dispatchers.IO) {
    api.getJson("/game/me")
  }
}
