package dev.streetsempire.app.native.core.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ScreenComponentsTest {
  @get:Rule
  val compose = createComposeRule()

  @Test
  fun blockingErrorExposesRetryAndMinimumTouchTarget() {
    var retries = 0
    compose.setContent {
      StreetsEmpireTheme {
        BlockingErrorState("The server is unavailable.", onRetry = { retries++ })
      }
    }

    compose.onNodeWithTag("blocking-error").assertIsDisplayed()
    compose.onNodeWithTag("retry-action")
      .assertIsDisplayed()
      .assertHasClickAction()
      .assertHeightIsAtLeast(48.dp)
      .performClick()
    compose.runOnIdle { assertEquals(1, retries) }
  }

  @Test
  fun sharedStatesRemainReadableAtTwoHundredPercentFontScale() {
    compose.setContent {
      CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = 2f)) {
        StreetsEmpireTheme {
          Column(Modifier.requiredSize(390.dp, 800.dp).padding(8.dp)) {
            EmptyState(
              title = "No activity yet",
              message = "Your latest moves will appear here.",
              actionLabel = "Scout",
              onAction = {},
            )
            MessageBanner("Season paused by staff.", MessageTone.Warning)
            FormattedValue("Net worth", formatUsdCents(12_845_700))
            PaginationControls(2, hasPrevious = true, hasNext = true, onPrevious = {}, onNext = {})
          }
        }
      }
    }

    compose.onNodeWithTag("empty-state").assertIsDisplayed()
    compose.onNodeWithTag("message-banner").assertIsDisplayed()
    compose.onNodeWithTag("formatted-value").assertIsDisplayed()
    compose.onNodeWithTag("pagination-controls").assertIsDisplayed()
    compose.onNodeWithTag("empty-action").assertHeightIsAtLeast(48.dp)
    compose.onNodeWithTag("previous-page").assertHeightIsAtLeast(48.dp)
    compose.onNodeWithTag("next-page").assertHeightIsAtLeast(48.dp)
  }

  @Test
  fun confirmationAndBadgeExposeAccessibleSemantics() {
    var confirmed = 0
    compose.setContent {
      StreetsEmpireTheme {
        Box {
          CountBadge(12, "unread notifications")
          ConfirmationPrompt(
            title = "Spend turns?",
            message = "This action costs 5 turns.",
            confirmLabel = "Spend 5 turns",
            onConfirm = { confirmed++ },
            onDismiss = {},
          )
        }
      }
    }

    compose.onNodeWithTag("confirmation-prompt").assertIsDisplayed()
    compose.onNodeWithTag("confirm-action").assertHeightIsAtLeast(48.dp).performClick()
    compose.runOnIdle { assertEquals(1, confirmed) }

    compose.onNodeWithTag("count-badge", useUnmergedTree = true)
      .assertContentDescriptionEquals("12 unread notifications")
  }
}
