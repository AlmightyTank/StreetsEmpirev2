package dev.streetsempire.app.native.feature.onboarding

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.streetsempire.app.native.app.AuthMessage
import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.model.CurrentRoundDto
import dev.streetsempire.app.native.core.model.RulesAgreementDto
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.feature.auth.AuthRepository
import kotlinx.coroutines.launch

private enum class OnboardingStep(val number: Int, val label: String) {
  Verify(1, "Verify"),
  Rules(2, "Rules"),
  Join(3, "Join"),
}

@Composable
fun OnboardingScreen(
  auth: AuthRepository,
  onComplete: () -> Unit,
  onSignedOut: () -> Unit,
  onAccountChanged: (AccountDto) -> Unit = {},
  onRoundChanged: (CurrentRoundDto) -> Unit = {},
  onSessionExpired: () -> Unit = {},
) {
  val scope = rememberCoroutineScope()
  var account by remember { mutableStateOf<AccountDto?>(null) }
  var agreement by remember { mutableStateOf<RulesAgreementDto?>(null) }
  var currentRound by remember { mutableStateOf<CurrentRoundDto?>(null) }
  var loading by remember { mutableStateOf(true) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  var notice by remember { mutableStateOf<String?>(null) }
  var refreshKey by remember { mutableIntStateOf(0) }

  LaunchedEffect(refreshKey) {
    loading = true
    error = null
    try {
      val freshAccount = auth.me()
      account = freshAccount
      onAccountChanged(freshAccount)
      when {
        freshAccount.verificationRequired -> Unit
        freshAccount.rulesAcceptanceRequired -> agreement = auth.rulesAgreement()
        else -> {
          val round = auth.currentRound()
          currentRound = round
          onRoundChanged(round)
          if (round.me != null) onComplete()
        }
      }
    } catch (caught: ApiError) {
      error = caught.message
      if (caught.isUnauthenticated) onSessionExpired()
    } finally {
      loading = false
    }
  }

  val step = when {
    account?.verificationRequired != false -> OnboardingStep.Verify
    account?.rulesAcceptanceRequired == true -> OnboardingStep.Rules
    else -> OnboardingStep.Join
  }

  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .windowInsetsPadding(WindowInsets.safeDrawing),
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
      Text("SET UP YOUR EMPIRE", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
      Text("Three steps to the streets", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
      Text(
        "Verify your account, accept the player rules, then enter the active season in New York City.",
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      StepProgress(active = step)

      if (loading) {
        Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
          CircularProgressIndicator()
        }
      } else {
        error?.let { AuthMessage(it, isError = true) }
        notice?.let { AuthMessage(it, isError = false) }

        when (step) {
          OnboardingStep.Verify -> VerifyEmailCard(
            email = account?.email.orEmpty(),
            busy = busy,
            onCheck = { notice = null; refreshKey += 1 },
            onResend = {
              busy = true
              error = null
              notice = null
              scope.launch {
                try {
                  notice = auth.requestEmailVerification()
                } catch (caught: ApiError) {
                  error = caught.message
                  if (caught.isUnauthenticated) onSessionExpired()
                } finally {
                  busy = false
                }
              }
            },
          )
          OnboardingStep.Rules -> RulesCard(
            agreement = agreement,
            busy = busy,
            onAccept = { version ->
              busy = true
              error = null
              scope.launch {
                try {
                  account = auth.acceptRules(version).also(onAccountChanged)
                  notice = "Rules accepted. One last step."
                  refreshKey += 1
                } catch (caught: ApiError) {
                  error = caught.message
                  if (caught.isUnauthenticated) onSessionExpired()
                } finally {
                  busy = false
                }
              }
            },
          )
          OnboardingStep.Join -> JoinSeasonCard(
            current = currentRound,
            busy = busy,
            onJoin = {
              busy = true
              error = null
              scope.launch {
                try {
                  val joined = auth.joinCurrentRound()
                  onRoundChanged(joined)
                  if (joined.me != null) onComplete() else error = "The season did not return your player. Try again."
                } catch (caught: ApiError) {
                  error = caught.message
                  if (caught.isUnauthenticated) onSessionExpired()
                } finally {
                  busy = false
                }
              }
            },
          )
        }
      }

      HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
      TextButton(
        onClick = {
          scope.launch {
            try {
              auth.logout()
            } finally {
              onSignedOut()
            }
          }
        },
        enabled = !busy,
        modifier = Modifier.align(Alignment.CenterHorizontally),
      ) { Text("Sign out") }
    }
  }
}

@Composable
private fun StepProgress(active: OnboardingStep) {
  Row(
    modifier = Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.SpaceBetween,
  ) {
    OnboardingStep.entries.forEach { step ->
      val reached = step.number <= active.number
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
          modifier = Modifier.size(36.dp),
          shape = CircleShape,
          color = if (reached) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        ) {
          Box(contentAlignment = Alignment.Center) {
            Text(
              step.number.toString(),
              color = if (reached) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
              fontWeight = FontWeight.Bold,
            )
          }
        }
        Spacer(Modifier.height(6.dp))
        Text(step.label, style = MaterialTheme.typography.labelMedium, color = if (reached) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
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
  OnboardingCard(title = "Verify your email", eyebrow = "STEP 1 OF 3") {
    Text("We sent a verification link to:", color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(email, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
    Text("Open the link in your inbox, then come back here. Check your spam folder if it does not arrive within a minute.")
    Button(onClick = onCheck, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp)) {
      Text("I verified my email", fontWeight = FontWeight.Bold)
    }
    OutlinedButton(onClick = onResend, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
      Text(if (busy) "Sending…" else "Send the link again")
    }
  }
}

@Composable
private fun RulesCard(
  agreement: RulesAgreementDto?,
  busy: Boolean,
  onAccept: (String) -> Unit,
) {
  var agreed by remember(agreement?.version) { mutableStateOf(false) }
  OnboardingCard(title = "The rules of the street", eyebrow = "STEP 2 OF 3") {
    Text("Everyone plays by these rules, and staff enforce them.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (agreement == null || agreement.rules.isEmpty()) {
      AuthMessage("The current rules could not be loaded. Check the server and try again.", isError = true)
    } else {
      agreement.rules.forEachIndexed { index, rule ->
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          Text("${index + 1}.", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
          Column {
            Text(rule.title, fontWeight = FontWeight.Bold)
            Text(rule.body, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
          }
        }
      }
      Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(12.dp)) {
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
          Checkbox(checked = agreed, onCheckedChange = { agreed = it }, enabled = !busy)
          Text("I have read the rules and I will play by them.")
        }
      }
      Button(
        onClick = { onAccept(agreement.version) },
        enabled = agreed && !busy && agreement.version.isNotBlank(),
        modifier = Modifier.fillMaxWidth().height(52.dp),
      ) { Text(if (busy) "Saving…" else "Accept and continue", fontWeight = FontWeight.Bold) }
    }
  }
}

@Composable
private fun JoinSeasonCard(
  current: CurrentRoundDto?,
  busy: Boolean,
  onJoin: () -> Unit,
) {
  val round = current?.round
  OnboardingCard(title = round?.name ?: "Enter the season", eyebrow = "STEP 3 OF 3") {
    if (round == null) {
      Text("There is no season open right now.", fontWeight = FontWeight.Bold)
      Text("Your account is ready. Come back when the next season opens.", color = MaterialTheme.colorScheme.onSurfaceVariant)
      return@OnboardingCard
    }
    Surface(color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f), shape = RoundedCornerShape(14.dp)) {
      Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("STARTING CITY", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        Text("New York City", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
        Text("Every new player begins in New York for now.", color = MaterialTheme.colorScheme.onSurfaceVariant)
      }
    }
    Text("You will enter with the same starting cash, turns, crew, weapons, and supplies as every other new player.")
    Text("Season status: ${round.status.lowercase().replaceFirstChar { it.uppercase() }} · ${round.playerCount} players", color = MaterialTheme.colorScheme.onSurfaceVariant)
    Button(
      onClick = onJoin,
      enabled = current.canJoin && !busy,
      modifier = Modifier.fillMaxWidth().height(54.dp),
      shape = RoundedCornerShape(14.dp),
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
  content: @Composable ColumnScope.() -> Unit,
) {
  Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp)) {
    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
      Text(eyebrow, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
      Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
      content()
    }
  }
}
