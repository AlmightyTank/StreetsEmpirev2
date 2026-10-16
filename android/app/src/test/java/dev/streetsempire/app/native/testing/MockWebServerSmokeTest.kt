package dev.streetsempire.app.native.testing

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Test

class MockWebServerSmokeTest {
  @Test
  fun clientReadsAQueuedJsonResponse() {
    MockWebServer().use { server ->
      server.enqueue(
        MockResponse()
          .setHeader("Content-Type", "application/json")
          .setBody("{\"status\":\"ok\"}"),
      )
      server.start()

      val request = Request.Builder().url(server.url("/api/meta")).build()
      OkHttpClient().newCall(request).execute().use { response ->
        assertEquals(200, response.code)
        assertEquals("{\"status\":\"ok\"}", response.body?.string())
      }
      assertEquals("/api/meta", server.takeRequest().path)
    }
  }
}
