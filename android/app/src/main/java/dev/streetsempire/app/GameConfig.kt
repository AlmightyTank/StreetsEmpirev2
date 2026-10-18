package dev.streetsempire.app

import android.net.Uri

/** Environment-specific configuration supplied by the Android build flavor. */
object GameConfig {
    val LIVE_ORIGIN: String = BuildConfig.LIVE_ORIGIN

    /** User-agent token the native shell appends; the website uses it to hide install prompts. */
    const val NATIVE_UA_TOKEN = "StreetsEmpireAndroid/1.0.0"

    val LIVE_ENTRY: String = "$LIVE_ORIGIN/game"
    const val SUPPORTER_PRODUCT_ID = "supporter_monthly"
    const val BILLING_SCHEME = "streetsempire"

    /** Hosts allowed to load inside the WebView (game + Discord OAuth). */
    private val inAppHosts = setOf(
        "beta.streetsempire.dev",
        "play.streetsempire.dev",
        "discord.com",
        "www.discord.com",
    )

    /** Only remember in-game pages, same rule as the desktop shell. */
    fun sanitizeGameUrl(rawUrl: String?): String? {
        if (rawUrl.isNullOrBlank()) return null
        return try {
            val uri = Uri.parse(rawUrl)
            if (uri.userInfo != null) return null
            val origin = LIVE_ORIGIN
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
            uri.scheme == "https" &&
                uri.userInfo == null &&
                inAppHosts.contains(uri.host?.lowercase())
        } catch (_: Exception) {
            false
        }
    }
}
