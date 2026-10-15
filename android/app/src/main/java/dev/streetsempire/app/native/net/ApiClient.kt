package dev.streetsempire.app.native.net

import dev.streetsempire.app.GameConfig
import dev.streetsempire.app.native.auth.TokenStore
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiError(val status: Int, val code: String, message: String) : Exception(message)

class ApiClient(private val tokenStore: TokenStore) {
  val json: Json = Json { ignoreUnknownKeys = true; isLenient = true }
  private val cookieJar = object : okhttp3.CookieJar {
    private val jar = mutableListOf<okhttp3.Cookie>()
    override fun saveFromResponse(url: okhttp3.HttpUrl, cookies: List<okhttp3.Cookie>) {
      for (cookie in cookies) {
        jar.removeAll { it.name == cookie.name }
        jar.add(cookie)
      }
    }
    override fun loadForRequest(url: okhttp3.HttpUrl): List<okhttp3.Cookie> =
      jar.filter { it.expiresAt > System.currentTimeMillis() }
  }
  private val http = OkHttpClient.Builder()
    .cookieJar(cookieJar)
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(15, TimeUnit.SECONDS)
    .build()

  private fun base(): String = GameConfig.SERVER_ORIGIN

  private fun request(path: String, method: String, bodyJson: String?): Request {
    val url = base() + "/api" + path
    val builder = Request.Builder()
      .url(url)
      .header("Accept", "application/json")
      .header("X-SE-Native", "android")
      .header("User-Agent", (System.getProperty("http.agent") ?: "StreetsEmpireAndroid") + " " + GameConfig.NATIVE_UA_TOKEN)
    tokenStore.sessionToken()?.let { builder.header("Authorization", "Bearer $it") }
    if (bodyJson != null) {
      builder.method(method, bodyJson.toRequestBody("application/json".toMediaType()))
    } else if (method == "POST") {
      builder.post("".toRequestBody("application/json".toMediaType()))
    } else {
      builder.method(method, null)
    }
    return builder.build()
  }

  private fun <T> execute(path: String, method: String, bodyJson: String?, parse: (String) -> T): T {
    try {
      http.newCall(request(path, method, bodyJson)).execute().use { response ->
        val text = response.body?.string().orEmpty()
        if (!response.isSuccessful) {
          throw toApiError(response.code, text)
        }
        return parse(text.ifEmpty { "{}" })
      }
    } catch (error: ApiError) {
      throw error
    } catch (error: IOException) {
      throw ApiError(
        status = 0,
        code = "NETWORK_ERROR",
        message = "Cannot reach the game server. Check that it is running and try again.",
      )
    }
  }

  fun get(path: String): String = execute(path, "GET", null) { it }
  fun post(path: String, bodyJson: String? = null): String = execute(path, "POST", bodyJson) { it }

  inline fun <reified T> getJson(path: String): T {
    val body = get(path)
    return try {
      json.decodeFromString<T>(body)
    } catch (error: ApiError) {
      throw error
    } catch (_: Exception) {
      throw ApiError(0, "INVALID_RESPONSE", "The game server returned an unreadable response. Try again.")
    }
  }

  fun toApiError(status: Int, text: String): ApiError {
    return try {
      val body = json.decodeFromString<ApiErrorBody>(text.ifEmpty { "{}" })
      ApiError(status, body.error?.code ?: "UNKNOWN", body.error?.message ?: "Something went wrong. Try that again.")
    } catch (_: Exception) {
      ApiError(status, "INVALID_RESPONSE", "The game server returned an unreadable response. Try again.")
    }
  }
}
