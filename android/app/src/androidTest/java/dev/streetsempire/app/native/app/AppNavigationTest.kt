package dev.streetsempire.app.native.app

import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppNavigationTest {
  @get:Rule
  val compose = createComposeRule()

  @Test
  fun coldStartWithoutSessionShowsAuthGraph() {
    compose.setContent { NavigationHarness(signedIn = false) }
    compose.onNodeWithText("Login screen").assertIsDisplayed()
  }

  @Test
  fun coldStartWithSessionShowsOnboardingGraph() {
    compose.setContent { NavigationHarness(signedIn = true) }
    compose.onNodeWithText("Onboarding screen").assertIsDisplayed()
  }

  @Test
  fun expiredSessionRedirectsProtectedGameToLogin() {
    val state = AppState(bootstrapPhase = BootstrapPhase.SignedOut)
    assertEquals(LoginDestination, protectedRedirect(state, ProtectedArea.Game))
    compose.setContent { NavigationHarness(signedIn = false, initialDeepLink = "/game") }
    compose.onNodeWithText("Login screen").assertIsDisplayed()
  }

  @Test
  fun incompleteBootstrapRedirectsGameToOnboarding() {
    val state = AppState(bootstrapPhase = BootstrapPhase.Onboarding)
    assertEquals(OnboardingDestination, protectedRedirect(state, ProtectedArea.Game))
    compose.setContent { NavigationHarness(signedIn = true, initialDeepLink = "/game") }
    compose.onNodeWithText("Onboarding screen").assertIsDisplayed()
  }

  @Test
  fun backFromTwoFactorReturnsToLogin() {
    compose.setContent { NavigationHarness(signedIn = false) }
    compose.onNodeWithText("Open two factor").performClick()
    compose.onNodeWithText("Two-factor screen").assertIsDisplayed()
    compose.onNodeWithText("Back").performClick()
    compose.onNodeWithText("Login screen").assertIsDisplayed()
  }

  @Test
  fun trustedPathRoutesToTypedFeatureDestination() {
    compose.setContent { NavigationHarness(signedIn = true, ready = true, initialDeepLink = "/game/combat") }
    compose.onNodeWithText("Feature: Combat").assertIsDisplayed()
  }
}

@Composable
private fun NavigationHarness(
  signedIn: Boolean,
  ready: Boolean = false,
  initialDeepLink: String? = null,
) {
  val nav = rememberNavController()
  val start = when {
    !signedIn -> AuthGraph
    ready -> GameGraph
    else -> OnboardingGraph
  }
  NavHost(navController = nav, startDestination = start) {
    navigation<AuthGraph>(startDestination = LoginDestination) {
      composable<LoginDestination> {
        Text("Login screen")
        Button(onClick = { nav.navigate(TwoFactorDestination) }) { Text("Open two factor") }
      }
      composable<TwoFactorDestination> {
        Text("Two-factor screen")
        Button(onClick = { nav.popBackStack() }) { Text("Back") }
      }
    }
    navigation<OnboardingGraph>(startDestination = OnboardingDestination) {
      composable<OnboardingDestination> { Text("Onboarding screen") }
    }
    navigation<GameGraph>(startDestination = HomeDestination) {
      composable<HomeDestination> { Text("Home screen") }
      composable<FeatureDestination> { entry ->
        Text("Feature: ${entry.toRoute<FeatureDestination>().name}")
      }
    }
  }

  androidx.compose.runtime.LaunchedEffect(initialDeepLink) {
    val destination = initialDeepLink?.let(::destinationForPath) ?: return@LaunchedEffect
    val allowed = when {
      !signedIn -> LoginDestination
      !ready && destination is HomeDestination -> OnboardingDestination
      !ready && destination is FeatureDestination -> OnboardingDestination
      else -> destination
    }
    navigateReplacingRoot(nav, allowed)
  }
}

private fun navigateReplacingRoot(nav: NavHostController, destination: Any) {
  when (destination) {
    LoginDestination -> nav.navigate(AuthGraph) { popUpTo(nav.graph.id) { inclusive = true } }
    OnboardingDestination -> nav.navigate(OnboardingGraph) { popUpTo(nav.graph.id) { inclusive = true } }
    HomeDestination -> nav.navigate(GameGraph) { popUpTo(nav.graph.id) { inclusive = true } }
    is FeatureDestination -> nav.navigate(destination)
  }
}
