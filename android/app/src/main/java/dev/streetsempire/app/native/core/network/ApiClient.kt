package dev.streetsempire.app.native.core.network

import dev.streetsempire.app.GameConfig
import dev.streetsempire.app.native.core.model.ApiErrorBody
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.HttpUrl.Companion.toHttpUrl

class ApiError(
  val status: Int,
  val code: String,
  message: String,
  cause: Throwable? = null,
) : Exception(message, cause) {
  val isUnauthenticated: Boolean get() = status == 401
  val isUncertain: Boolean get() = status == 0 || status >= 500
}

/** Narrow credential dependency so transport tests never need Android storage. */
fun interface SessionTokenProvider {
  fun sessionToken(): String?
}

/**
 * Cancellable JSON transport shared by native feature repositories.
 *
 * Server state remains authoritative. A cancelled coroutine cancels its OkHttp call, and
 * mutating callers receive an uncertain [ApiError] for network/5xx failures so they can
 * reconcile before deciding whether to retry.
 */
class ApiClient(
  private val tokenProvider: SessionTokenProvider,
  serverOrigin: String = GameConfig.SERVER_ORIGIN,
  private val http: OkHttpClient = defaultHttpClient(),
) {
  val json: Json = Json { ignoreUnknownKeys = true; isLenient = true }
  private val apiBase = serverOrigin.trimEnd('/').toHttpUrl().newBuilder()
    .addPathSegment("api")
    .build()

  suspend fun get(path: String, query: Map<String, String?> = emptyMap()): String =
    execute(path, "GET", null, query)

  suspend fun post(path: String, bodyJson: String? = null, query: Map<String, String?> = emptyMap()): String =
    execute(path, "POST", bodyJson ?: "{}", query)

  suspend fun patch(path: String, bodyJson: String? = null, query: Map<String, String?> = emptyMap()): String =
    execute(path, "PATCH", bodyJson ?: "{}", query)

  suspend fun delete(path: String, bodyJson: String? = null, query: Map<String, String?> = emptyMap()): String =
    execute(path, "DELETE", bodyJson, query)

  suspend inline fun <reified ResponseBody> getJson(
    path: String,
    query: Map<String, String?> = emptyMap(),
  ): ResponseBody = decode(get(path, query))

  suspend inline fun <reified RequestBody, reified ResponseBody> postJson(
    path: String,
    body: RequestBody,
    query: Map<String, String?> = emptyMap(),
  ): ResponseBody = decode(post(path, json.encodeToString(body), query))

  suspend inline fun <reified RequestBody, reified ResponseBody> patchJson(
    path: String,
    body: RequestBody,
    query: Map<String, String?> = emptyMap(),
  ): ResponseBody = decode(patch(path, json.encodeToString(body), query))

  suspend inline fun <reified ResponseBody> deleteJson(
    path: String,
    bodyJson: String? = null,
    query: Map<String, String?> = emptyMap(),
  ): ResponseBody = decode(delete(path, bodyJson, query))

  inline fun <reified ResponseBody> decode(body: String): ResponseBody = try {
    json.decodeFromString(body)
  } catch (error: SerializationException) {
    throw ApiError(
      status = 0,
      code = "INVALID_RESPONSE",
      message = "The game server returned an unreadable response. Try again.",
      cause = error,
    )
  } catch (error: IllegalArgumentException) {
    throw ApiError(
      status = 0,
      code = "INVALID_RESPONSE",
      message = "The game server returned an unreadable response. Try again.",
      cause = error,
    )
  }

  private suspend fun execute(
    path: String,
    method: String,
    bodyJson: String?,
    query: Map<String, String?>,
  ): String {
    val call = http.newCall(request(path, method, bodyJson, query))
    try {
      return call.await().use { response ->
        val text = response.body?.string().orEmpty()
        if (!response.isSuccessful) throw toApiError(response.code, text)
        text.ifEmpty { "{}" }
      }
    } catch (error: ApiError) {
      throw error
    } catch (error: SocketTimeoutException) {
      throw ApiError(
        status = 0,
        code = "NETWORK_TIMEOUT",
        message = "The game server took too long to respond. Try again.",
        cause = error,
      )
    } catch (error: IOException) {
      throw ApiError(
        status = 0,
        code = "NETWORK_ERROR",
        message = "Cannot reach the game server. Check that it is running and try again.",
        cause = error,
      )
    }
  }

  private fun request(
    path: String,
    method: String,
    bodyJson: String?,
    query: Map<String, String?>,
  ): Request {
    val url = apiBase.newBuilder()
      .addPathSegments(path.trim('/'))
      .apply { query.forEach { (name, value) -> if (value != null) addQueryParameter(name, value) } }
      .build()
    val builder = Request.Builder()
      .url(url)
      .header("Accept", "application/json")
      .header("X-SE-Native", "android")
      .header(
        "User-Agent",
        (System.getProperty("http.agent") ?: "StreetsEmpireAndroid") + " " + GameConfig.NATIVE_UA_TOKEN,
      )
    tokenProvider.sessionToken()?.takeIf { it.isNotBlank() }?.let {
      builder.header("Authorization", "Bearer $it")
    }
    val requestBody = bodyJson?.toRequestBody(JSON_MEDIA_TYPE)
    return builder.method(method, requestBody).build()
  }

  fun toApiError(status: Int, text: String): ApiError {
    return try {
      val detail = json.decodeFromString<ApiErrorBody>(text.ifEmpty { "{}" }).error
      ApiError(
        status = status,
        code = detail?.code ?: if (status == 401) "UNAUTHENTICATED" else "UNKNOWN",
        message = detail?.message
          ?: if (status == 401) "Your session ended. Sign in again." else "Something went wrong. Try that again.",
      )
    } catch (_: Exception) {
      ApiError(
        status = status,
        code = if (status == 401) "UNAUTHENTICATED" else "INVALID_RESPONSE",
        message = if (status == 401) "Your session ended. Sign in again."
          else "The game server returned an unreadable response. Try again.",
      )
    }
  }

  private suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
      override fun onFailure(call: Call, error: IOException) {
        if (continuation.isActive) continuation.resumeWithException(error)
      }

      override fun onResponse(call: Call, response: Response) {
        if (continuation.isActive) continuation.resume(response)
        else response.close()
      }
    })
  }

  companion object {
    private val JSON_MEDIA_TYPE = "application/json".toMediaType()

    private fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
      .cookieJar(InMemoryChallengeCookieJar())
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(15, TimeUnit.SECONDS)
      .build()
  }
}

/** Holds only short-lived pre-auth challenge cookies (for example, the 2FA challenge). */
private class InMemoryChallengeCookieJar : CookieJar {
  private val cookies = mutableListOf<Cookie>()

  override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) = synchronized(this) {
    cookies.forEach { cookie ->
      this.cookies.removeAll { it.name == cookie.name && it.domain == cookie.domain && it.path == cookie.path }
      this.cookies.add(cookie)
    }
  }

  override fun loadForRequest(url: HttpUrl): List<Cookie> = synchronized(this) {
    val now = System.currentTimeMillis()
    cookies.removeAll { it.expiresAt <= now }
    cookies.filter { it.matches(url) }
  }
}
