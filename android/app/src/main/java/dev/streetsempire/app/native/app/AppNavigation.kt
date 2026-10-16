package dev.streetsempire.app.native.app

import kotlinx.serialization.Serializable

@Serializable data object AuthGraph
@Serializable data object OnboardingGraph
@Serializable data object GameGraph

@Serializable data object LoginDestination
@Serializable data object TwoFactorDestination
@Serializable data object ForgotPasswordDestination
@Serializable data class ResetPasswordDestination(val token: String = "")
@Serializable data class VerifyEmailLinkDestination(val token: String = "")
@Serializable data object OnboardingDestination
@Serializable data object HomeDestination
@Serializable data object PreviewDestination
@Serializable data class FeatureDestination(val name: String)

enum class ProtectedArea { Onboarding, Game }

/** Chooses the only root graph a cold start may enter. */
fun rootStartGraph(signedIn: Boolean): Any = if (signedIn) OnboardingGraph else AuthGraph

/**
 * Pure protected-route policy used by navigation and tests. A null result means
 * the requested area is allowed; otherwise the caller must replace the stack.
 */
fun protectedRedirect(state: AppState, requested: ProtectedArea): Any? {
  if (state.bootstrapPhase == BootstrapPhase.SignedOut) return LoginDestination
  if (requested == ProtectedArea.Game && state.bootstrapPhase != BootstrapPhase.Ready) {
    return OnboardingDestination
  }
  return null
}

/** Trusted in-app route conversion; host verification is added at the Android app-link boundary. */
fun destinationForPath(path: String): Any? {
  val normalized = "/" + path.trim().trim('/').substringBefore('?').substringBefore('#')
  if (normalized == "/reset-password") {
    // The token arrives as a query parameter; base64url needs no decoding.
    val token = path.substringAfter("token=", "").substringBefore('&').substringBefore('#').trim()
    return ResetPasswordDestination(token)
  }
  if (normalized == "/verify-email") {
    val token = path.substringAfter("token=", "").substringBefore('&').substringBefore('#').trim()
    return VerifyEmailLinkDestination(token)
  }
  return when {
    normalized == "/login" -> LoginDestination
    normalized == "/register" -> LoginDestination
    normalized == "/forgot-password" -> ForgotPasswordDestination
    normalized == "/join" -> OnboardingDestination
    normalized == "/game" -> HomeDestination
    normalized.startsWith("/game/stores/") -> FeatureDestination("Stores")
    normalized.startsWith("/game/") -> {
      val segment = normalized.removePrefix("/game/").substringBefore('/')
      FEATURE_PATHS[segment]?.let(::FeatureDestination)
    }
    else -> null
  }
}

private val FEATURE_PATHS = mapOf(
  "combat" to "Combat",
  "scout" to "Actions",
  "quests" to "Actions",
  "events" to "Actions",
  "hideout" to "Crew & Turf",
  "stores" to "Stores",
  "supply" to "Actions",
  "holdings" to "Crew & Turf",
  "loans" to "Actions",
  "dealers" to "Crew & Turf",
  "crew" to "Crew & Turf",
  "casino" to "Casino",
  "travel" to "Crew & Turf",
  "turf" to "Crew & Turf",
  "alliance" to "Alliance",
  "console" to "Community",
  "players" to "Community",
  "supporter" to "Supporter",
  "account" to "Account",
)
