package dev.streetsempire.app.native.feature.onboarding

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.core.ui.SeBrand
import dev.streetsempire.app.native.core.ui.SeShell
import dev.streetsempire.app.native.feature.auth.OnboardingGateway

/**
 * Consumes an emailed `/verify-email?token=…` app link. The server endpoint is
 * public (like web), so this works signed-out; Continue routes through the
 * normal bootstrap so signed-in players land in onboarding and everyone else
 * lands at sign-in with the address already verified.
 */
@Composable
fun VerifyEmailLinkScreen(
  gateway: OnboardingGateway,
  token: String,
  onContinue: () -> Unit,
  onBackToSignIn: () -> Unit,
) {
  var busy by remember(token) { mutableStateOf(token.isNotBlank()) }
  var error by remember(token) { mutableStateOf<String?>(null) }
  var info by remember(token) { mutableStateOf<String?>(null) }

  LaunchedEffect(token) {
    if (token.isBlank()) {
      busy = false
      error = "That email link is missing its token. Open the full link from your email."
      return@LaunchedEffect
    }
    try {
      info = gateway.verifyEmailToken(token)
    } catch (e: ApiError) {
      error = e.message
    } finally {
      busy = false
    }
  }

  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .windowInsetsPadding(WindowInsets.safeDrawing)
      .testTag("verify-link-screen"),
    contentAlignment = Alignment.TopCenter,
  ) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .widthIn(max = 560.dp)
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 20.dp, vertical = 24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      SeBrand("StreetsEmpire")
      Text(
        text = "EMAIL VERIFICATION",
        modifier = Modifier.fillMaxWidth(),
        color = SeShell.Muted,
        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.6.sp),
        textAlign = TextAlign.Center,
      )
      Spacer(Modifier.height(24.dp))
      Card(
        modifier = Modifier.fillMaxWidth(),
        shape = SeShell.PanelShape,
        colors = CardDefaults.cardColors(containerColor = SeShell.Panel),
        border = BorderStroke(1.dp, SeShell.Line),
      ) {
        Column(
          modifier = Modifier.padding(20.dp),
          verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
          Text("Verify your email", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
          when {
            busy -> CircularProgressIndicator()
            error != null -> Text(
              error!!,
              color = SeShell.Bad,
              modifier = Modifier.testTag("verify-link-error"),
            )
            info != null -> Text(
              info!!,
              color = SeShell.Good,
              modifier = Modifier.testTag("verify-link-info"),
            )
          }
          if (!busy && info != null) {
            Button(onClick = onContinue, modifier = Modifier.fillMaxWidth().testTag("verify-link-continue")) {
              Text("Continue")
            }
          }
          TextButton(onClick = onBackToSignIn, modifier = Modifier.fillMaxWidth()) {
            Text("Back to sign in")
          }
        }
      }
    }
  }
}
