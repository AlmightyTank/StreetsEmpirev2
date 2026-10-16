package dev.streetsempire.app.native.feature.auth

import android.util.Patterns
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.core.ui.SeBrand
import dev.streetsempire.app.native.core.ui.SeShell
import kotlinx.coroutines.launch

@Composable
private fun RecoveryShell(title: String, subtitle: String, content: @Composable () -> Unit) {
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
        .widthIn(max = 560.dp)
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 20.dp, vertical = 24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      SeBrand("StreetsEmpire")
      Text(
        text = "ACCOUNT RECOVERY",
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
        border = androidx.compose.foundation.BorderStroke(1.dp, SeShell.Line),
      ) {
        Column(
          modifier = Modifier.padding(20.dp),
          verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
          Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
          Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
          content()
        }
      }
    }
  }
}

@Composable
fun ForgotPasswordScreen(
  auth: RecoveryGateway,
  onBackToSignIn: () -> Unit,
  turnstileContent: @Composable (String, Int, (String?) -> Unit) -> Unit = { key, challenge, onToken ->
    TurnstileChallenge(siteKey = key, captchaKey = challenge, onToken = onToken)
  },
) {
  val scope = rememberCoroutineScope()
  val focusManager = LocalFocusManager.current
  var email by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  var info by remember { mutableStateOf<String?>(null) }
  var siteKey by remember { mutableStateOf<String?>(null) }
  var siteKeyLoaded by remember { mutableStateOf(false) }
  var captchaToken by remember { mutableStateOf<String?>(null) }
  var captchaKey by remember { mutableStateOf(0) }

  LaunchedEffect(Unit) {
    siteKey = auth.turnstileSiteKey()
    siteKeyLoaded = true
  }

  fun submit() {
    if (!Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches()) {
      error = "Enter a valid email address."
      return
    }
    if (siteKey != null && captchaToken == null) {
      error = "Finish the human check first."
      return
    }
    focusManager.clearFocus()
    busy = true
    error = null
    info = null
    scope.launch {
      try {
        // The server answers identically whether or not the email exists.
        info = auth.forgotPassword(email, captchaToken)
      } catch (e: ApiError) {
        error = e.message
        if (e.code == "CAPTCHA_REQUIRED" || e.code == "CAPTCHA_FAILED") {
          if (siteKey == null) siteKey = auth.turnstileSiteKey()
        }
      } finally {
        // Single-use human-check tokens never survive an attempt.
        captchaToken = null
        captchaKey += 1
        busy = false
      }
    }
  }

  RecoveryShell(
    title = "Recover your login",
    subtitle = "We will send a one-hour password reset link if the email is on an account.",
  ) {
    OutlinedTextField(
      value = email,
      onValueChange = { email = it; error = null },
      label = { Text("Account email") },
      modifier = Modifier.fillMaxWidth().testTag("recovery-email"),
      singleLine = true,
      enabled = !busy,
      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
      keyboardActions = KeyboardActions(onDone = { submit() }),
    )
    if (siteKeyLoaded && siteKey != null) {
      Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = SeShell.ControlShape,
      ) {
        turnstileContent(siteKey!!, captchaKey) { captchaToken = it }
      }
    }
    error?.let { AuthMessage(it, isError = true) }
    info?.let { AuthMessage(it, isError = false) }
    Button(
      onClick = { submit() },
      enabled = !busy,
      modifier = Modifier.fillMaxWidth().height(52.dp).testTag("recovery-submit"),
      shape = SeShell.ControlShape,
    ) {
      if (busy) {
        CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
      } else {
        Text("Send recovery email", fontWeight = FontWeight.Bold)
      }
    }
    if (siteKey != null) {
      TextButton(
        onClick = { captchaToken = null; captchaKey += 1 },
        enabled = !busy,
        modifier = Modifier.fillMaxWidth(),
      ) { Text("Reload human check") }
    }
    TextButton(onClick = onBackToSignIn, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
      Text("Remembered it? Sign in")
    }
  }
}

@Composable
fun ResetPasswordScreen(
  auth: RecoveryGateway,
  token: String,
  onSignedIn: (AccountDto) -> Unit,
  onTwoFactor: () -> Unit,
  onRequestNewLink: () -> Unit,
) {
  val scope = rememberCoroutineScope()
  val focusManager = LocalFocusManager.current
  var password by remember { mutableStateOf("") }
  var confirmPassword by remember { mutableStateOf("") }
  var passwordVisible by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  fun submit() {
    if (token.isBlank()) {
      error = "This link is missing its reset code. Request a new email."
      return
    }
    if (password.length < 8) {
      error = "Password must be at least 8 characters."
      return
    }
    if (password != confirmPassword) {
      error = "Passwords do not match."
      return
    }
    focusManager.clearFocus()
    busy = true
    error = null
    scope.launch {
      try {
        when (val result = auth.resetPassword(token, password)) {
          is AuthResult.SignedIn -> onSignedIn(result.account)
          is AuthResult.TwoFactorRequired -> onTwoFactor()
          is AuthResult.ApprovalRequired -> error = result.message
        }
      } catch (e: ApiError) {
        error = e.message
      } finally {
        busy = false
      }
    }
  }

  RecoveryShell(title = "Set a new password", subtitle = "At least 8 characters.") {
    if (token.isBlank()) {
      AuthMessage("Open the full recovery link from your email.", isError = true)
    }
    OutlinedTextField(
      value = password,
      onValueChange = { password = it; error = null },
      label = { Text("New password") },
      supportingText = { Text("At least 8 characters") },
      modifier = Modifier.fillMaxWidth().testTag("recovery-password"),
      singleLine = true,
      enabled = !busy,
      visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
      trailingIcon = {
        TextButton(onClick = { passwordVisible = !passwordVisible }) {
          Text(if (passwordVisible) "Hide" else "Show")
        }
      },
      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
    )
    OutlinedTextField(
      value = confirmPassword,
      onValueChange = { confirmPassword = it; error = null },
      label = { Text("Confirm password") },
      modifier = Modifier.fillMaxWidth().testTag("recovery-confirm-password"),
      singleLine = true,
      enabled = !busy,
      visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
      keyboardActions = KeyboardActions(onDone = { submit() }),
    )
    error?.let { AuthMessage(it, isError = true) }
    Button(
      onClick = { submit() },
      enabled = !busy && token.isNotBlank(),
      modifier = Modifier.fillMaxWidth().height(52.dp).testTag("recovery-submit"),
      shape = SeShell.ControlShape,
    ) {
      if (busy) {
        CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
      } else {
        Text("Reset password", fontWeight = FontWeight.Bold)
      }
    }
    TextButton(onClick = onRequestNewLink, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
      Text("Need a new link? Send recovery email")
    }
  }
}
