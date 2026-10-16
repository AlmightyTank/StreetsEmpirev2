package dev.streetsempire.app.native.app

import dev.streetsempire.app.native.core.model.AuthResponse
import dev.streetsempire.app.native.core.model.CurrentRoundDto
import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.core.network.CredentialStore
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppStateStoreTest {
  private val json = Json { ignoreUnknownKeys = true }

  @Test
  fun `authoritative refresh propagates account round player and unread count atomically`() {
    val credentials = FakeCredentials("token")
    val store = AppStateStore(credentials)
    val account = json.decodeFromString<AuthResponse>(fixture("auth-login.json")).account!!
    val current = json.decodeFromString<CurrentRoundDto>(fixture("current-round.json"))
    val dashboard = json.decodeFromString<GameSnapshotDto>(fixture("game-snapshot.json"))

    store.applyRefresh(account, currentRound = current, dashboard = dashboard, unreadNotifications = 7)

    val state = store.state.value
    assertEquals(account, state.account)
    assertEquals(dashboard.round, state.round)
    assertEquals(dashboard.player, state.player)
    assertEquals(7, state.unreadNotifications)
    assertEquals(BootstrapPhase.Ready, state.bootstrapPhase)
  }

  @Test
  fun `unauthenticated failure clears credential and all account state`() {
    val credentials = FakeCredentials("token")
    val store = AppStateStore(credentials)
    val account = json.decodeFromString<AuthResponse>(fixture("auth-login.json")).account!!
    store.beginBootstrap(account)
    store.applyUnreadNotifications(4)

    assertTrue(store.handleFailure(ApiError(401, "UNAUTHENTICATED", "Sign in again.")))

    assertTrue(credentials.cleared)
    assertNull(credentials.sessionToken())
    assertNull(store.state.value.account)
    assertEquals(0, store.state.value.unreadNotifications)
    assertEquals(BootstrapPhase.SignedOut, store.state.value.bootstrapPhase)
  }

  @Test
  fun `ordinary server failure preserves credential and session state`() {
    val credentials = FakeCredentials("token")
    val store = AppStateStore(credentials)

    assertFalse(store.handleFailure(ApiError(503, "UNAVAILABLE", "Try again.")))
    assertEquals("token", credentials.sessionToken())
    assertFalse(credentials.cleared)
  }

  private fun fixture(name: String): String =
    requireNotNull(javaClass.classLoader?.getResource("contracts/$name")).readText()

  private class FakeCredentials(private var token: String?) : CredentialStore {
    var cleared = false

    override fun sessionToken(): String? = token

    override fun save(token: String) {
      this.token = token
    }

    override fun clear() {
      cleared = true
      token = null
    }
  }
}
