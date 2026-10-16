package dev.streetsempire.app.native.core.model

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ContractFixtureTest {
  private val json = Json { ignoreUnknownKeys = true }

  @Test
  fun `representative shared contract fixtures decode`() {
    val auth = json.decodeFromString<AuthResponse>(fixture("auth-login.json"))
    val platform = json.decodeFromString<PlatformMetaDto>(fixture("platform-meta.json"))
    val currentRound = json.decodeFromString<CurrentRoundDto>(fixture("current-round.json"))
    val snapshot = json.decodeFromString<GameSnapshotDto>(fixture("game-snapshot.json"))
    val error = json.decodeFromString<ApiErrorBody>(fixture("api-error.json"))

    assertEquals("MidnightBoss", auth.account?.username)
    assertEquals(16, platform.rulesAgreement.minimumAge)
    assertEquals(true, currentRound.canJoin)
    assertEquals(42, snapshot.player.turns.turns)
    assertEquals("INVALID_CREDENTIALS", error.error?.code)
  }

  @Test
  fun `missing required account field fails clearly`() {
    val root = json.parseToJsonElement(fixture("auth-login.json")).jsonObject
    val account = root.getValue("account").jsonObject.toMutableMap().apply { remove("username") }
    val broken = JsonObject(root.toMutableMap().apply { put("account", JsonObject(account)) }).toString()

    val failure = assertThrows(SerializationException::class.java) {
      json.decodeFromString<AuthResponse>(broken)
    }
    check(failure.message.orEmpty().contains("username")) {
      "Expected the missing field name in the failure, got: ${failure.message}"
    }
  }

  @Test
  fun `missing required round envelope field fails clearly`() {
    val root = json.parseToJsonElement(fixture("current-round.json")).jsonObject.toMutableMap()
    root.remove("roundOver")

    val failure = assertThrows(SerializationException::class.java) {
      json.decodeFromString<CurrentRoundDto>(JsonObject(root).toString())
    }
    check(failure.message.orEmpty().contains("roundOver")) {
      "Expected the missing field name in the failure, got: ${failure.message}"
    }
  }

  private fun fixture(name: String): String =
    requireNotNull(javaClass.classLoader?.getResource("contracts/$name")) {
      "Missing contract fixture contracts/$name"
    }.readText()
}
