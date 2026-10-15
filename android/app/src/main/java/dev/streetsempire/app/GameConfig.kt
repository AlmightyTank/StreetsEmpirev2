package dev.streetsempire.app

import android.net.Uri

/** Single source of truth for the server selected by the Android build flavor. */
object GameConfig {
    val SERVER_ORIGIN: String = BuildConfig.SERVER_ORIGIN

    /** User-agent token the native shell appends; the website uses it to hide install prompts. */
    const val NATIVE_UA_TOKEN = "StreetsEmpireAndroid/1.0.0"

    val GAME_ENTRY: String = "$SERVER_ORIGIN/game"
    const val SUPPORTER_PRODUCT_ID = "supporter_monthly"
    const val BILLING_SCHEME = "streetsempire"

    /** External OAuth hosts allowed to load inside the WebView. */
    private val oauthHosts = setOf(
        "discord.com",
        "www.discord.com",
    )

    /** Only remember in-game pages, same rule as the desktop shell. */
    fun sanitizeGameUrl(rawUrl: String?): String? {
        if (rawUrl.isNullOrBlank()) return null
        return try {
            val uri = Uri.parse(rawUrl)
            if (uri.userInfo != null) return null
            val origin = SERVER_ORIGIN
            val parsedOrigin = Uri.parse(origin)
            if ("${uri.scheme}://${uri.authority}" != "${parsedOrigin.scheme}://${parsedOrigin.authority}") {
                return null
            }
            val path = uri.path ?: return "$origin/game"
            if (path != "/game" && !path.startsWith("/game/")) return "$origin/game"
            uri.buildUpon().fragment(null).build().toString()
        } catch (_: Exception) {
            null
        }
    }

    fun isBillingUrl(uri: Uri): Boolean =
        uri.scheme == BILLING_SCHEME && uri.host == "billing"

    fun isInAppUrl(rawUrl: String?): Boolean {
        if (rawUrl.isNullOrBlank()) return false
        return try {
            val uri = Uri.parse(rawUrl)
            if (uri.userInfo != null) return false
            val configured = Uri.parse(SERVER_ORIGIN)
            val isConfiguredOrigin = uri.scheme == configured.scheme && uri.authority == configured.authority
            val isOAuth = uri.scheme == "https" && oauthHosts.contains(uri.host?.lowercase())
            isConfiguredOrigin || isOAuth
        } catch (_: Exception) {
            false
        }
    }
}
