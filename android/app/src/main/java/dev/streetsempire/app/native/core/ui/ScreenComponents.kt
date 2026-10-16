package dev.streetsempire.app.native.core.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import java.util.Locale

private val MinimumTouchTarget = 48.dp

@Composable
fun LoadingState(label: String = "Loading", modifier: Modifier = Modifier) {
  Column(
    modifier = modifier.fillMaxWidth().padding(24.dp).semantics {
      contentDescription = label
      liveRegion = LiveRegionMode.Polite
    }.testTag("loading-state"),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    CircularProgressIndicator()
    Text(label, textAlign = TextAlign.Center)
  }
}

@Composable
fun RefreshAction(
  refreshing: Boolean,
  onRefresh: () -> Unit,
  modifier: Modifier = Modifier,
) {
  OutlinedButton(
    onClick = onRefresh,
    enabled = !refreshing,
    modifier = modifier.sizeIn(minWidth = MinimumTouchTarget, minHeight = MinimumTouchTarget).testTag("refresh-action"),
  ) {
    Text(if (refreshing) "Refreshing…" else "Refresh")
  }
}

@Composable
fun EmptyState(
  title: String,
  message: String,
  actionLabel: String? = null,
  onAction: (() -> Unit)? = null,
  modifier: Modifier = Modifier,
) {
  Column(
    modifier = modifier.fillMaxWidth().padding(24.dp).testTag("empty-state"),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
    Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    if (actionLabel != null && onAction != null) {
      Button(
        onClick = onAction,
        modifier = Modifier.sizeIn(minHeight = MinimumTouchTarget).testTag("empty-action"),
      ) { Text(actionLabel) }
    }
  }
}

@Composable
fun BlockingErrorState(
  message: String,
  onRetry: () -> Unit,
  modifier: Modifier = Modifier,
) {
  Card(
    modifier.fillMaxWidth().testTag("blocking-error"),
    shape = SeShell.PanelShape,
    colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = SeShell.Panel),
    border = androidx.compose.foundation.BorderStroke(1.dp, SeShell.Line),
  ) {
    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Text("Couldn’t load this", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.error)
      Text(message)
      Button(
        onClick = onRetry,
        modifier = Modifier.sizeIn(minHeight = MinimumTouchTarget).testTag("retry-action"),
      ) { Text("Try again") }
    }
  }
}

enum class MessageTone { Info, Success, Warning, Error }

@Composable
fun MessageBanner(message: String, tone: MessageTone = MessageTone.Info, modifier: Modifier = Modifier) {
  val color = when (tone) {
    MessageTone.Info -> SeShell.Accent2
    MessageTone.Success -> SeShell.Good
    MessageTone.Warning -> SeShell.Warn
    MessageTone.Error -> SeShell.Bad
  }
  Card(
    modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }.testTag("message-banner"),
    shape = SeShell.PanelShape,
    colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = SeShell.Panel),
    border = androidx.compose.foundation.BorderStroke(1.dp, SeShell.Line),
  ) {
    Text(message, color = color, modifier = Modifier.padding(16.dp))
  }
}

@Composable
fun ConfirmationPrompt(
  title: String,
  message: String,
  confirmLabel: String,
  onConfirm: () -> Unit,
  onDismiss: () -> Unit,
  destructive: Boolean = false,
) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(title) },
    text = { Text(message) },
    confirmButton = {
      Button(
        onClick = onConfirm,
        colors = if (destructive) ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error) else ButtonDefaults.buttonColors(),
        modifier = Modifier.sizeIn(minHeight = MinimumTouchTarget).testTag("confirm-action"),
      ) {
        Text(confirmLabel)
      }
    },
    dismissButton = {
      TextButton(onClick = onDismiss, modifier = Modifier.sizeIn(minHeight = MinimumTouchTarget).testTag("dismiss-action")) {
        Text("Cancel")
      }
    },
    modifier = Modifier.testTag("confirmation-prompt"),
  )
}

@Composable
fun PaginationControls(
  page: Int,
  hasPrevious: Boolean,
  hasNext: Boolean,
  onPrevious: () -> Unit,
  onNext: () -> Unit,
  modifier: Modifier = Modifier,
) {
  require(page >= 1) { "Page numbers start at one." }
  Row(
    modifier.fillMaxWidth().testTag("pagination-controls"),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    TextButton(
      onClick = onPrevious,
      enabled = hasPrevious,
      modifier = Modifier.sizeIn(minWidth = MinimumTouchTarget, minHeight = MinimumTouchTarget).testTag("previous-page"),
    ) { Text("Previous") }
    Text("Page $page", style = MaterialTheme.typography.labelLarge)
    TextButton(
      onClick = onNext,
      enabled = hasNext,
      modifier = Modifier.sizeIn(minWidth = MinimumTouchTarget, minHeight = MinimumTouchTarget).testTag("next-page"),
    ) { Text("Next") }
  }
}

@Composable
fun CountBadge(count: Int, label: String, modifier: Modifier = Modifier) {
  require(count >= 0) { "Badge count cannot be negative." }
  if (count == 0) return
  Badge(
    modifier.semantics { contentDescription = "$count $label" }.testTag("count-badge"),
  ) { Text(if (count > 99) "99+" else count.toString()) }
}

@Composable
fun FormattedValue(
  label: String,
  value: String,
  modifier: Modifier = Modifier,
) {
  Row(
    modifier.fillMaxWidth().testTag("formatted-value"),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, color = SeShell.TextDim)
    Text(
      value,
      fontWeight = FontWeight.SemiBold,
      textAlign = TextAlign.End,
      fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
      color = SeShell.Text,
    )
  }
}

fun formatUsdCents(cents: Long): String = NumberFormat.getCurrencyInstance(Locale.US).format(cents / 100.0)

fun formatWholeNumber(value: Long): String = NumberFormat.getIntegerInstance(Locale.US).format(value)

fun formatDuration(milliseconds: Long): String {
  val totalMinutes = (milliseconds.coerceAtLeast(0) / 60_000)
  val days = totalMinutes / (24 * 60)
  val hours = (totalMinutes / 60) % 24
  val minutes = totalMinutes % 60
  return buildList {
    if (days > 0) add("${days}d")
    if (hours > 0 || days > 0) add("${hours}h")
    add("${minutes}m")
  }.joinToString(" ")
}
