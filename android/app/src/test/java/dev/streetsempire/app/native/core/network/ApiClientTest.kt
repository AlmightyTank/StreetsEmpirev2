package dev.streetsempire.app.native.core.network

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ApiClientTest {
  @Serializable
  private data class RequestFixture(val amount: Int)

  @Serializable
  private data class ResponseFixture(val ok: Boolean)

  @Test
  fun getSendsNativeBearerAndQueryHeaders() = withServer { server, client ->
    server.enqueue(jsonResponse("{\"ok\":true}"))

    val response = client.getJson<ResponseFixture>("/game/me", mapOf("background" to "1", "ignored" to null))

    assertTrue(response.ok)
    val request = server.takeRequest()
    assertEquals("GET", request.method)
    assertEquals("/api/game/me?background=1", request.path)
    assertEquals("android", request.getHeader("X-SE-Native"))
    assertEquals("Bearer test-token", request.getHeader("Authorization"))
    assertTrue(request.getHeader("User-Agent").orEmpty().contains("StreetsEmpireAndroid/"))
  }

  @Test
  fun supportsPostPatchDeleteAndGenericSerialization() = withServer { server, client ->
    repeat(3) { server.enqueue(jsonResponse("{\"ok\":true}")) }

    assertTrue(client.postJson<RequestFixture, ResponseFixture>("/resource", RequestFixture(3)).ok)
    assertTrue(client.patchJson<RequestFixture, ResponseFixture>("/resource/1", RequestFixture(4)).ok)
    assertTrue(client.deleteJson<ResponseFixture>("/resource/1").ok)

    val post = server.takeRequest()
    val patch = server.takeRequest()
    val delete = server.takeRequest()
    assertEquals("POST", post.method)
    assertEquals("{\"amount\":3}", post.body.readUtf8())
    assertEquals("PATCH", patch.method)
    assertEquals("{\"amount\":4}", patch.body.readUtf8())
    assertEquals("DELETE", delete.method)
    assertEquals(0L, delete.bodySize)
  }

  @Test
  fun timeoutBecomesNormalizedApiError() = withServer(
    http = OkHttpClient.Builder().readTimeout(100, TimeUnit.MILLISECONDS).build(),
  ) { server, client ->
    server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))

    val error = apiError { client.get("/slow") }

    assertEquals(0, error.status)
    assertEquals("NETWORK_TIMEOUT", error.code)
    assertTrue(error.isUncertain)
  }

  @Test
  fun malformedJsonBecomesInvalidResponse() = withServer { server, client ->
    server.enqueue(jsonResponse("not-json"))

    val error = apiError { client.getJson<ResponseFixture>("/broken") }

    assertEquals("INVALID_RESPONSE", error.code)
    assertEquals(0, error.status)
  }

  @Test
  fun unauthorizedResponsePreservesServerMessage() = withServer { server, client ->
    server.enqueue(
      jsonResponse("{\"error\":{\"code\":\"SESSION_EXPIRED\",\"message\":\"Sign in again.\"}}", 401),
    )

    val error = apiError { client.get("/private") }

    assertEquals(401, error.status)
    assertEquals("SESSION_EXPIRED", error.code)
    assertEquals("Sign in again.", error.message)
    assertTrue(error.isUnauthenticated)
  }

  @Test
  fun cancellingCoroutineCancelsInFlightRequest() = withServer { server, client ->
    server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))

    val request = launch(Dispatchers.IO) { client.get("/never-finishes") }
    assertNotNull(server.takeRequest(2, TimeUnit.SECONDS))
    withTimeout(2_000) { request.cancelAndJoin() }

    assertTrue(request.isCancelled)
  }

  private fun withServer(
    http: OkHttpClient = OkHttpClient(),
    block: suspend kotlinx.coroutines.CoroutineScope.(MockWebServer, ApiClient) -> Unit,
  ) = runBlocking {
    MockWebServer().use { server ->
      server.start()
      val client = ApiClient(
        tokenProvider = SessionTokenProvider { "test-token" },
        serverOrigin = server.url("/").toString(),
        http = http,
      )
      block(server, client)
    }
  }

  private suspend fun apiError(block: suspend () -> Unit): ApiError = try {
    block()
    fail("Expected ApiError")
    error("unreachable")
  } catch (error: ApiError) {
    error
  }

  private fun jsonResponse(body: String, code: Int = 200): MockResponse = MockResponse()
    .setResponseCode(code)
    .setHeader("Content-Type", "application/json")
    .setBody(body)
}
