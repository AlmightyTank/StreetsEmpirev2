package dev.streetsempire.app.native.core.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Shared web-shell building blocks. Mirrors `.se-eyebrow`, `.se-panel`,
 * `.se-stat`, and `.se-row` so the Android frame reads as the same shell as
 * the website: uppercase eyebrows, hard 6dp panels, hairline borders, and
 * mono tabular numbers.
 */
@Composable
fun SeEyebrow(text: String, modifier: Modifier = Modifier) {
  Text(
    text = text.uppercase(),
    modifier = modifier,
    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.9f),
    style = MaterialTheme.typography.labelSmall.copy(
      fontSize = 10.sp,
      fontWeight = FontWeight.Bold,
      letterSpacing = 1.6.sp,
    ),
  )
}

@Composable
fun SeTitle(text: String, modifier: Modifier = Modifier) {
  Text(
    text = text,
    modifier = modifier,
    color = MaterialTheme.colorScheme.onSurface,
    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
  )
}

@Composable
fun SePanel(
  title: String,
  modifier: Modifier = Modifier,
  aside: String? = null,
  content: @Composable () -> Unit,
) {
  Card(
    modifier = modifier.fillMaxWidth(),
    shape = SeShell.PanelShape,
    colors = CardDefaults.cardColors(containerColor = SeShell.Panel),
    border = BorderStroke(1.dp, SeShell.Line),
  ) {
    Column {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text(
          text = title.uppercase(),
          color = SeShell.TextDim,
          style = MaterialTheme.typography.labelSmall.copy(
            fontSize = 11.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 1.4.sp,
          ),
        )
        if (aside != null) {
          SeEyebrow(aside)
        }
      }
      Column(Modifier.padding(12.dp)) {
        content()
      }
    }
  }
}

@Composable
fun SeStat(
  label: String,
  value: String,
  sub: String? = null,
  modifier: Modifier = Modifier,
) {
  Column(
    modifier = modifier
      .padding(10.dp),
  ) {
    SeEyebrow(label)
    Text(
      text = value,
      color = SeShell.Text,
      fontFamily = FontFamily.Monospace,
      fontWeight = FontWeight.Bold,
      fontSize = 19.sp,
    )
    if (sub != null) {
      Text(text = sub, color = SeShell.Muted, style = MaterialTheme.typography.bodySmall)
    }
  }
}

@Composable
fun SeRow(
  label: String,
  value: String,
  strong: Boolean = false,
  modifier: Modifier = Modifier,
) {
  Row(
    modifier = modifier
      .fillMaxWidth()
      .padding(horizontal = 12.dp, vertical = 7.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(text = label, color = SeShell.TextDim, style = MaterialTheme.typography.bodySmall)
    Text(
      text = value,
      color = if (strong) SeShell.Text else SeShell.Text,
      fontFamily = FontFamily.Monospace,
      fontWeight = FontWeight.SemiBold,
      fontSize = if (strong) 15.sp else 13.sp,
    )
  }
}

@Composable
fun SeBrand(mark: String = "StreetsEmpire", modifier: Modifier = Modifier) {
  Row(
    modifier = modifier.testTag("se-brand"),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    val split = mark.indexOf("Empire")
    if (split >= 0) {
      Text(
        text = mark.substring(0, split),
        color = SeShell.Text,
        fontWeight = FontWeight.Black,
        fontSize = 18.sp,
      )
      Text(
        text = mark.substring(split),
        color = SeShell.Accent,
        fontWeight = FontWeight.Black,
        fontSize = 18.sp,
      )
    } else {
      Text(text = mark, color = SeShell.Text, fontWeight = FontWeight.Black, fontSize = 18.sp)
    }
  }
}
