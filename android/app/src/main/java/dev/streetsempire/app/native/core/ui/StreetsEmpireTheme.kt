package dev.streetsempire.app.native.core.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val StreetsEmpireColors = darkColorScheme(
  primary = Color(0xFFE8B33C),
  onPrimary = Color(0xFF241A00),
  secondary = Color(0xFF8BC5FF),
  background = Color(0xFF080C11),
  onBackground = Color(0xFFF2F5F9),
  surface = Color(0xFF121923),
  onSurface = Color(0xFFF2F5F9),
  surfaceVariant = Color(0xFF1A2431),
  onSurfaceVariant = Color(0xFFB8C4D2),
  error = Color(0xFFFFB4AB),
)

@Composable
fun StreetsEmpireTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = StreetsEmpireColors, content = content)
}
