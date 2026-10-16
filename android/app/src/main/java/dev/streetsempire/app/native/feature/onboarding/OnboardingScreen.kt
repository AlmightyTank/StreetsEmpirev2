package dev.streetsempire.app.native.feature.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.streetsempire.app.native.core.ui.SeBrand
import dev.streetsempire.app.native.core.ui.SeEyebrow
import dev.streetsempire.app.native.core.ui.SeShell
import dev.streetsempire.app.native.feature.auth.AuthMessage
import dev.streetsempire.app.native.feature.auth.OnboardingGateway

@Composable
fun OnboardingScreen(
  auth: OnboardingGateway,
  onComplete: () -> Unit,
  onSignedOut: () -> Unit,
  onAccountChanged: (dev.streetsempire.app.native.core.model.AccountDto) -> Unit = {},
  onRoundChanged: (dev.streetsempire.app.native.core.model.CurrentRoundDto) -> Unit = {},
  onSessionExpired: () -> Unit = {},
) {
  val vm: OnboardingViewModel = viewModel(
    factory = remember(auth) {
      OnboardingViewModelFactory(auth, onComplete, onAccountChanged, onRoundChanged, onSessionExpired, onSignedOut)
    },
  )
  val state by vm.state.collectAsStateWithLifecycle()
  // Safe UI state: the 16+ checkbox survives rotation and process death.
  // Passwords and captcha tokens never live here, so fresh secrets are
  // always required after recreation.
  var agreed by rememberSaveable { mutableStateOf(false) }

  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .windowInsetsPadding(WindowInsets.safeDrawing)
      .testTag("onboarding-screen"),
    contentAlignment = Alignment.TopCenter,
  ) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .widthIn(max = 640.dp)
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 20.dp, vertical = 24.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
      SeBrand()
      SeEyebrow("Set up your empire")
      Text("Three steps to the streets", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
      Text(
        "Verify your account, accept the player rules, then enter the active season in New York City.",
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      StepProgress(active = state.step)

      if (state.loading) {
        Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
          CircularProgressIndicator()
        }
      } else {
        state.error?.let {
          Box(Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("onboarding-error")) {
            AuthMessage(it, isError = true)
          }
        }
        state.notice?.let {
          Box(Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("onboarding-notice")) {
            AuthMessage(it, isError = false)
          }
        }

        when (state.step) {
          OnboardingStep.Verify -> VerifyEmailCard(
            email = state.account?.email.orEmpty(),
            busy = state.busy,
            onCheck = { vm.bootstrap() },
            onResend = { vm.resendVerification() },
          )
          OnboardingStep.Rules -> RulesCard(
            agreement = state.agreement,
            agreed = agreed,
            busy = state.busy,
            onAgreedChange = { agreed = it },
            onAccept = { vm.acceptRules(it) },
          )
          OnboardingStep.Join -> JoinSeasonCard(
            current = state.currentRound,
            busy = state.busy,
            onJoin = { vm.joinSeason() },
          )
        }
      }

      HorizontalDivider(color = SeShell.LineSoft)
      TextButton(
        onClick = { vm.signOut() },
        enabled = !state.busy,
        modifier = Modifier.align(Alignment.CenterHorizontally).testTag("onboarding-signout"),
      ) { Text("Sign out") }
    }
  }
}

@Composable
private fun StepProgress(active: OnboardingStep) {
  Row(
    modifier = Modifier.fillMaxWidth().testTag("step-progress"),
    horizontalArrangement = Arrangement.SpaceBetween,
  ) {
    OnboardingStep.entries.forEach { step ->
      val reached = step.number <= active.number
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
          modifier = Modifier.size(36.dp),
          shape = CircleShape,
          color = if (reached) SeShell.Accent else SeShell.PanelHi,
        ) {
          Box(contentAlignment = Alignment.Center) {
            Text(
              step.number.toString(),
              color = if (reached) MaterialTheme.colorScheme.onPrimary else SeShell.TextDim,
              fontWeight = FontWeight.Bold,
            )
          }
        }
        Spacer(Modifier.height(6.dp))
        Text(
          step.label,
          style = MaterialTheme.typography.labelMedium,
          color = if (reached) SeShell.Accent else SeShell.TextDim,
        )
      }
    }
  }
}

@Composable
private fun VerifyEmailCard(
  email: String,
  busy: Boolean,
  onCheck: () -> Unit,
  onResend: () -> Unit,
) {
  OnboardingCard(title = "Verify your email", eyebrow = "STEP 1 OF 3", testTag = "verify-card") {
    Text("We sent a verification link to:", color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(email, fontWeight = FontWeight.Bold, color = SeShell.Accent)
    Text("Open the link in your inbox, then come back here. Check your spam folder if it does not arrive within a minute.")
    Button(
      onClick = onCheck,
      enabled = !busy,
      modifier = Modifier.fillMaxWidth().height(52.dp).testTag("verify-check"),
    ) {
      Text("I verified my email", fontWeight = FontWeight.Bold)
    }
    OutlinedButton(
      onClick = onResend,
      enabled = !busy,
      modifier = Modifier.fillMaxWidth().testTag("verify-resend"),
    ) {
      Text(if (busy) "Sending…" else "Send the link again")
    }
  }
}

@Composable
/** Reusable rules/16+ card. Internal for restoration-test access. */
internal fun RulesCard(
  agreement: dev.streetsempire.app.native.core.model.RulesAgreementDto?,
  agreed: Boolean,
  busy: Boolean,
  onAgreedChange: (Boolean) -> Unit,
  onAccept: (String) -> Unit,
) {
  OnboardingCard(title = "The rules of the street", eyebrow = "STEP 2 OF 3", testTag = "rules-card") {
    Text("Everyone plays by these rules, and staff enforce them.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (agreement == null || agreement.rules.isEmpty()) {
      AuthMessage("The current rules could not be loaded. Check the server and try again.", isError = true)
    } else {
      Text(
        "You must be ${agreement.minimumAge} or older to play. Accepting below declares your age and your agreement.",
        fontWeight = FontWeight.Bold,
      )
      agreement.rules.forEachIndexed { index, rule ->
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          Text("${index + 1}.", color = SeShell.Accent, fontWeight = FontWeight.Bold)
          Column {
            Text(rule.title, fontWeight = FontWeight.Bold)
            Text(rule.body, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
          }
        }
      }
      Surface(color = SeShell.PanelHi, shape = SeShell.ControlShape) {
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
          Checkbox(
            checked = agreed,
            onCheckedChange = onAgreedChange,
            enabled = !busy,
            colors = CheckboxDefaults.colors(checkedColor = SeShell.Accent),
            modifier = Modifier.testTag("rules-agree-checkbox"),
          )
          Text("I am ${agreement.minimumAge} or older. I have read the rules and I will play by them.")
        }
      }
      Button(
        onClick = { onAccept(agreement.version) },
        enabled = agreed && !busy && agreement.version.isNotBlank(),
        modifier = Modifier.fillMaxWidth().height(52.dp).testTag("rules-accept"),
      ) { Text(if (busy) "Saving…" else "Accept and continue", fontWeight = FontWeight.Bold) }
    }
  }
}

@Composable
private fun JoinSeasonCard(
  current: dev.streetsempire.app.native.core.model.CurrentRoundDto?,
  busy: Boolean,
  onJoin: () -> Unit,
) {
  val round = current?.round
  OnboardingCard(title = round?.name ?: "Enter the season", eyebrow = "STEP 3 OF 3", testTag = "join-card") {
    if (round == null) {
      Text("There is no season open right now.", fontWeight = FontWeight.Bold)
      Text("Your account is ready. Come back when the next season opens.", color = MaterialTheme.colorScheme.onSurfaceVariant)
      return@OnboardingCard
    }
    Surface(color = SeShell.AccentDim.copy(alpha = 0.35f), shape = SeShell.PanelShape) {
      Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("STARTING CITY", style = MaterialTheme.typography.labelMedium, color = SeShell.AccentHover)
        Text("New York City", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
        Text("Every new player begins in New York for now.", color = MaterialTheme.colorScheme.onSurfaceVariant)
      }
    }
    Text("You will enter with the same starting cash, turns, crew, weapons, and supplies as every other new player.")
    Text("Season status: ${round.status.lowercase().replaceFirstChar { it.uppercase() }} · ${round.playerCount} players", color = MaterialTheme.colorScheme.onSurfaceVariant)
    Button(
      onClick = onJoin,
      enabled = current.canJoin && !busy,
      modifier = Modifier.fillMaxWidth().height(54.dp).testTag("join-enter"),
      shape = SeShell.ControlShape,
    ) {
      if (busy) CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
      else Text("Enter ${round.name}", fontWeight = FontWeight.Bold)
    }
    if (!current.canJoin) {
      Text("This season is not accepting new players right now.", color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
  }
}

@Composable
private fun OnboardingCard(
  title: String,
  eyebrow: String,
  testTag: String,
  content: @Composable ColumnScope.() -> Unit,
) {
  Card(
    modifier = Modifier.fillMaxWidth().testTag(testTag),
    shape = SeShell.PanelShape,
    colors = CardDefaults.cardColors(containerColor = SeShell.Panel),
    border = BorderStroke(1.dp, SeShell.Line),
  ) {
    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
      SeEyebrow(eyebrow)
      Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
      content()
    }
  }
}
