package dev.streetsempire.app.native.core.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AdaptiveGameChromeTest {
  @get:Rule
  val compose = createComposeRule()

  @Test
  fun phonePortraitScreenshotHasNoClipping() {
    showChrome(width = 390.dp, height = 800.dp)

    compose.onNodeWithTag("compact-navigation").assertIsDisplayed()
    compose.onNodeWithTag("compact-bottom-bar").assertIsDisplayed()
    compose.onAllNodesWithTag("expanded-navigation").assertCountEquals(0)
    listOf("Dashboard", "Actions", "Crew & Turf", "More").forEach {
      compose.onNodeWithTag("bottom-item-$it").assertIsDisplayed()
    }
    assertRenderedScreenshot()
  }

  @Test
  fun phoneLandscapeScreenshotHasNoClipping() {
    showChrome(width = 800.dp, height = 390.dp, density = 0.5f)

    compose.onNodeWithTag("compact-navigation").assertIsDisplayed()
    compose.onNodeWithTag("compact-bottom-bar").assertIsDisplayed()
    compose.onNodeWithText("StreetsEmpire").assertIsDisplayed()
    compose.onNodeWithTag("bottom-item-More").assertIsDisplayed()
    assertRenderedScreenshot()
  }

  @Test
  fun expandedScreenshotUsesRailWithoutClipping() {
    showChrome(width = 1000.dp, height = 700.dp, density = 0.4f)

    compose.onNodeWithTag("expanded-navigation").assertIsDisplayed()
    compose.onAllNodesWithTag("compact-bottom-bar").assertCountEquals(0)
    compose.onNodeWithTag("expanded-all-features").assertIsDisplayed()
    compose.onNodeWithTag("rail-item-Dashboard").assertIsDisplayed()
    assertRenderedScreenshot()
  }

  @Test
  fun allFeaturesMenuIsCategorizedAndShowsUnreadBadge() {
    showChrome(width = 390.dp, height = 800.dp)

    compose.onNodeWithText("More").performClick()
    compose.waitUntil(3_000) {
      compose.onAllNodes(androidx.compose.ui.test.hasTestTag("all-features-menu"))
        .fetchSemanticsNodes().isNotEmpty()
    }
    compose.onNodeWithTag("all-features-menu").assertIsDisplayed()
    listOf("Street", "Empire", "Social", "Account").forEach {
      compose.onNodeWithTag("category-$it").assertIsDisplayed()
    }
    compose.onNodeWithTag("drawer-item-Notifications").assertIsDisplayed()
    compose.onAllNodesWithTag("unread-badge", useUnmergedTree = true).assertCountEquals(1)
  }

  private fun showChrome(width: Dp, height: Dp, density: Float = 1f) {
    compose.setContent {
      CompositionLocalProvider(LocalDensity provides Density(density = density, fontScale = 1f)) {
        StreetsEmpireTheme {
          Box(Modifier.requiredSize(width, height)) {
            AdaptiveGameChrome(
              title = "StreetsEmpire",
              selected = "Dashboard",
              unreadNotifications = 7,
              onNavigate = {},
            ) { padding ->
              Text("Dashboard content", Modifier.padding(padding).padding(16.dp).testTag("screen-content"))
            }
          }
        }
      }
    }
  }

  private fun assertRenderedScreenshot() {
    val screenshot = compose.onRoot().captureToImage()
    assertTrue("Rendered chrome screenshot must have width", screenshot.width > 0)
    assertTrue("Rendered chrome screenshot must have height", screenshot.height > 0)
    compose.onAllNodesWithTag("screen-content").assertCountEquals(1)
  }
}
