package dev.streetsempire.app.native.core.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * House shell theme shared with the website. Hex values mirror
 * `packages/shared/src/theme.ts` (post-polish.css overrides): near-black
 * street background, compact panels, hairline borders, crimson accent,
 * 6dp panels and 4dp controls.
 *
 * Deliberate adaptation: the web frame fixes its top bar at 58px and its
 * phone tab bar at 60px, but Material3 TopAppBar/NavigationBar enforce their
 * own internal heights (64dp/80dp). Forcing exact web heights from outside
 * collapses the bar content to zero height (verified via semantics dump), so
 * Android keeps M3 bar heights and matches the shell through colors, brand,
 * dividers, and typography instead.
 */
object SeShell {
  val Bg = Color(0xFF07090C)
  val Panel = Color(0xFF12161C)
  val PanelHi = Color(0xFF181D25)
  val Line = Color(0xFF303743)
  val LineSoft = Color(0xFF202630)
  val Text = Color(0xFFE4E9F1)
  val TextDim = Color(0xFFA9B3C0)
  val Muted = Color(0xFF8A96A5)
  val Accent = Color(0xFFEF4657)
  val AccentDim = Color(0xFFB72E3D)
  val AccentHover = Color(0xFFFF7784)
  val Accent2 = Color(0xFFD6DEE8)
  val Good = Color(0xFF4ADE80)
  val Bad = Color(0xFFF33F63)
  val Warn = Color(0xFFFF791A)

  val RadiusMd = 6.dp
  val RadiusSm = 4.dp
  val PanelShape = RoundedCornerShape(RadiusMd)
  val ControlShape = RoundedCornerShape(RadiusSm)
}

private val StreetsEmpireColors = darkColorScheme(
  primary = SeShell.Accent,
  onPrimary = Color.White,
  primaryContainer = SeShell.AccentDim,
  onPrimaryContainer = Color.White,
  secondary = SeShell.Accent2,
  onSecondary = Color(0xFF0B0C0E),
  background = SeShell.Bg,
  onBackground = SeShell.Text,
  surface = SeShell.Panel,
  onSurface = SeShell.Text,
  surfaceVariant = SeShell.PanelHi,
  onSurfaceVariant = SeShell.TextDim,
  surfaceContainerHigh = SeShell.PanelHi,
  outline = SeShell.Line,
  outlineVariant = SeShell.LineSoft,
  error = SeShell.Bad,
  onError = Color.White,
  tertiary = SeShell.Good,
)

private val StreetsEmpireShapes = Shapes(
  extraSmall = SeShell.ControlShape,
  small = SeShell.ControlShape,
  medium = SeShell.PanelShape,
  large = SeShell.PanelShape,
  extraLarge = SeShell.PanelShape,
)

@Composable
fun StreetsEmpireTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = StreetsEmpireColors, shapes = StreetsEmpireShapes, content = content)
}
