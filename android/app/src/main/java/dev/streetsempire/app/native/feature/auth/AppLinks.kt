package dev.streetsempire.app.native.feature.auth

import java.net.URI

/**
 * Email deep links the app handles (`/verify-email`, `/reset-password`).
 *
 * The manifest intent-filter is deliberately coarse (scheme + host + path);
 * [parseAppLink] is the strict gate: the link must match the flavor's full
 * [allowedOrigin] (scheme, host, and explicit port) and carry a non-blank
 * `token` query parameter. Anything else returns null and the activity leaves
 * the user where they are, so untrusted hosts can never drive navigation.
 */
sealed interface AppLink {
  data class VerifyEmail(val token: String) : AppLink
  data class ResetPassword(val token: String) : AppLink
}

object AppLinks {
  fun parseAppLink(rawUrl: String?, allowedOrigin: String): AppLink? {
    if (rawUrl.isNullOrBlank() || allowedOrigin.isBlank()) return null
    val link = try {
      URI(rawUrl.trim())
    } catch (_: Exception) {
      return null
    }
    val origin = try {
      URI(allowedOrigin)
    } catch (_: Exception) {
      return null
    }
    if (link.scheme?.lowercase() != origin.scheme?.lowercase()) return null
    if (link.host?.lowercase() != origin.host?.lowercase()) return null
    if (effectivePort(link) != effectivePort(origin)) return null
    if (link.userInfo != null) return null
    val token = queryParam(link, "token")?.trim()
    if (token.isNullOrEmpty()) return null
    return when (link.path) {
      "/verify-email" -> AppLink.VerifyEmail(token)
      "/reset-password" -> AppLink.ResetPassword(token)
      else -> null
    }
  }

  private fun effectivePort(uri: URI): Int {
    if (uri.port != -1) return uri.port
    return when (uri.scheme?.lowercase()) {
      "https" -> 443
      "http" -> 80
      else -> -1
    }
  }

  private fun queryParam(uri: URI, name: String): String? {
    val query = uri.rawQuery ?: return null
    for (pair in query.split("&")) {
      val equals = pair.indexOf('=')
      if (equals <= 0) continue
      if (pair.substring(0, equals) != name) continue
      return try {
        java.net.URLDecoder.decode(pair.substring(equals + 1), "UTF-8")
      } catch (_: Exception) {
        null
      }
    }
    return null
  }
}
