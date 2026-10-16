package dev.streetsempire.app.native.feature.auth

import android.util.Patterns
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.streetsempire.app.R
import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.core.ui.BirthdayDateField
import dev.streetsempire.app.native.core.ui.SeBrand
import dev.streetsempire.app.native.core.ui.SeShell
import dev.streetsempire.app.native.core.ui.birthdayError
import kotlinx.coroutines.launch
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
  auth: AuthGateway,
  onSignedIn: (AccountDto) -> Unit,
  onTwoFactor: () -> Unit,
  onForgotPassword: () -> Unit = {},
  onPreview: () -> Unit = {},
  allowPreview: Boolean = false,
  turnstileContent: @Composable (String, Int, (String?) -> Unit) -> Unit = { key, challenge, onToken ->
    TurnstileChallenge(siteKey = key, captchaKey = challenge, onToken = onToken)
  },
) {
  val scope = rememberCoroutineScope()
  val focusManager = LocalFocusManager.current
  // Safe UI state survives rotation and process death via the saved-instance
  // bundle. Passwords and the single-use captcha token stay in plain `remember`
  // so a recreated process always requires fresh secrets.
  var modeName by rememberSaveable { mutableStateOf(AuthMode.SignIn.name) }
  val mode = AuthMode.valueOf(modeName)
  var identifier by rememberSaveable { mutableStateOf("") }
  var username by rememberSaveable { mutableStateOf("") }
  var email by rememberSaveable { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var confirmPassword by remember { mutableStateOf("") }
  var passwordVisible by rememberSaveable { mutableStateOf(false) }
  var ageConfirmed by rememberSaveable { mutableStateOf(false) }
  var birthDate by rememberSaveable { mutableStateOf("") }
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

  fun switchMode(next: AuthMode) {
    if (mode == next || busy) return
    modeName = next.name
    error = null
    info = null
    password = ""
    confirmPassword = ""
  }

  fun validationError(): String? = when (mode) {
    AuthMode.SignIn -> when {
      identifier.isBlank() -> "Enter your pimp name or email."
      password.isBlank() -> "Enter your password."
      else -> null
    }
    AuthMode.SignUp -> when {
      username.trim().length !in 3..20 -> "Pimp name must be 3–20 characters."
      !username.trim().matches(Regex("^[A-Za-z0-9_-]+$")) -> "Use only letters, numbers, underscores, or hyphens in your pimp name."
      !Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches() -> "Enter a valid email address."
      password.length < 8 -> "Password must be at least 8 characters."
      password != confirmPassword -> "Passwords do not match."
      birthdayError(birthDate) != null -> birthdayError(birthDate)
      !ageConfirmed -> "Confirm that you are at least 16 years old."
      else -> null
    }
  }

  fun submit() {
    val invalid = validationError()
    if (invalid != null) {
      error = invalid
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
        val result = when (mode) {
          AuthMode.SignIn -> auth.login(identifier, password, captchaToken)
          AuthMode.SignUp -> auth.register(username, email, password, ageConfirmed, birthDate, captchaToken)
        }
        when (result) {
          is AuthResult.SignedIn -> onSignedIn(result.account)
          is AuthResult.TwoFactorRequired -> onTwoFactor()
          is AuthResult.ApprovalRequired -> info = result.message
        }
      } catch (e: ApiError) {
        error = e.message
        captchaToken = null
        captchaKey += 1
        if (e.code == "CAPTCHA_REQUIRED" || e.code == "CAPTCHA_FAILED") {
          if (siteKey == null) siteKey = auth.turnstileSiteKey()
        }
      } finally {
        busy = false
      }
    }
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
        .widthIn(max = 560.dp)
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 20.dp, vertical = 24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Image(
        painter = painterResource(R.mipmap.ic_launcher_foreground),
        contentDescription = null,
        modifier = Modifier.size(88.dp),
        contentScale = ContentScale.Fit,
      )
      SeBrand("StreetsEmpire")
      Text(
        text = "BUILD YOUR NAME · RUN YOUR CITY",
        modifier = Modifier.fillMaxWidth(),
        color = SeShell.Muted,
        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.6.sp),
        textAlign = TextAlign.Center,
      )
      Spacer(Modifier.height(24.dp))

      Card(
        modifier = Modifier.fillMaxWidth(),
        shape = SeShell.PanelShape,
        colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = SeShell.Panel),
        border = androidx.compose.foundation.BorderStroke(1.dp, SeShell.Line),
      ) {
        Column(
          modifier = Modifier.padding(20.dp),
          verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
          TabRow(selectedTabIndex = mode.ordinal, containerColor = SeShell.Panel) {
            AuthMode.entries.forEach { option ->
              Tab(
                selected = mode == option,
                onClick = { switchMode(option) },
                text = {
                  Text(
                    option.label,
                    fontWeight = FontWeight.SemiBold,
                    color = if (mode == option) SeShell.Accent else SeShell.TextDim,
                  )
                },
                enabled = !busy,
                modifier = Modifier.testTag("auth-tab-${option.name.lowercase()}"),
              )
            }
          }

          Text(
            text = if (mode == AuthMode.SignIn) "Welcome back, boss" else "Claim your street name",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
          )
          Text(
            text = if (mode == AuthMode.SignIn)
              "Your empire is waiting. Sign in to continue."
            else
              "Create an account and start building your empire.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )

          if (mode == AuthMode.SignIn) {
            OutlinedTextField(
              value = identifier,
              onValueChange = { identifier = it; error = null },
              label = { Text("Pimp name or email") },
              singleLine = true,
              enabled = !busy,
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
              modifier = Modifier.fillMaxWidth().testTag("auth-identifier"),
            )
          } else {
            OutlinedTextField(
              value = username,
              onValueChange = { username = it.take(20); error = null },
              label = { Text("Pimp name") },
              supportingText = { Text("3–20 characters · letters, numbers, _ or -") },
              modifier = Modifier.fillMaxWidth().testTag("auth-username"),
              singleLine = true,
              enabled = !busy,
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
            OutlinedTextField(
              value = email,
              onValueChange = { email = it; error = null },
              label = { Text("Email") },
              modifier = Modifier.fillMaxWidth().testTag("auth-email"),
              singleLine = true,
              enabled = !busy,
              keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            )
          }

          OutlinedTextField(
            value = password,
            onValueChange = { password = it; error = null },
            label = { Text("Password") },
            supportingText = if (mode == AuthMode.SignUp) ({ Text("At least 8 characters") }) else null,
            modifier = Modifier.fillMaxWidth().testTag("auth-password"),
            singleLine = true,
            enabled = !busy,
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
              TextButton(onClick = { passwordVisible = !passwordVisible }) {
                Text(if (passwordVisible) "Hide" else "Show")
              }
            },
            keyboardOptions = KeyboardOptions(
              keyboardType = KeyboardType.Password,
              imeAction = if (mode == AuthMode.SignIn) ImeAction.Done else ImeAction.Next,
            ),
            keyboardActions = KeyboardActions(onDone = { submit() }),
          )

          if (mode == AuthMode.SignUp) {
            OutlinedTextField(
              value = confirmPassword,
              onValueChange = { confirmPassword = it; error = null },
              label = { Text("Confirm password") },
              modifier = Modifier.fillMaxWidth().testTag("auth-confirm-password"),
              singleLine = true,
              enabled = !busy,
              visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
              keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
              keyboardActions = KeyboardActions(onDone = { submit() }),
            )
            BirthdayDateField(value = birthDate, enabled = !busy, onSelect = { birthDate = it; error = null })
            Row(
              modifier = Modifier.fillMaxWidth(),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Checkbox(
                checked = ageConfirmed,
                onCheckedChange = { ageConfirmed = it; error = null },
                enabled = !busy,
              )
              Text("I confirm that I am 16 or older.")
            }
          }

          if (siteKeyLoaded && siteKey != null) {
            Surface(
              modifier = Modifier.fillMaxWidth(),
              color = MaterialTheme.colorScheme.surfaceVariant,
              shape = RoundedCornerShape(12.dp),
            ) {
              turnstileContent(siteKey!!, captchaKey, { captchaToken = it })
            }
          }

          error?.let { AuthMessage(it, isError = true) }
          info?.let { AuthMessage(it, isError = false) }

          Button(
            onClick = { submit() },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().height(52.dp).testTag("auth-submit"),
            shape = RoundedCornerShape(14.dp),
          ) {
            if (busy) {
              CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
            } else {
              Text(if (mode == AuthMode.SignIn) "Enter the streets" else "Create my account", fontWeight = FontWeight.Bold)
            }
          }

          if (siteKey != null) {
            TextButton(
              onClick = { captchaToken = null; captchaKey += 1 },
              enabled = !busy,
              modifier = Modifier.fillMaxWidth(),
            ) { Text("Reload human check") }
          }
          TextButton(
            onClick = onForgotPassword,
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().testTag("auth-forgot-password"),
          ) { Text("Forgot your password?") }
        }
      }

      if (allowPreview) {
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = onPreview, modifier = Modifier.fillMaxWidth()) {
          Text("Preview the app with sample data")
        }
      }
      Spacer(Modifier.height(12.dp))
      HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
      Spacer(Modifier.height(12.dp))
      Text(
        text = "Secure native sign-in · Connected directly to the StreetsEmpire game server",
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.bodySmall,
        textAlign = TextAlign.Center,
      )
    }
  }
}

private enum class AuthMode(val label: String) {
  SignIn("Sign in"),
  SignUp("Sign up"),
}

@Composable
internal fun AuthMessage(message: String, isError: Boolean) {
  Surface(
    modifier = Modifier.fillMaxWidth().testTag(if (isError) "auth-error" else "auth-info"),
    color = if (isError) MaterialTheme.colorScheme.error.copy(alpha = 0.12f) else MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
    shape = RoundedCornerShape(12.dp),
  ) {
    Text(
      text = message,
      modifier = Modifier.padding(12.dp),
      color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
      style = MaterialTheme.typography.bodyMedium,
    )
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TwoFactorScreen(auth: AuthGateway, onSignedIn: (AccountDto) -> Unit) {
  val scope = rememberCoroutineScope()
  var code by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  Scaffold(topBar = { TopAppBar(title = { Text("Two-step sign-in") }) }) { padding ->
    Column(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Text("Enter the 6-digit code from your authenticator app.")
      OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text("Code") }, modifier = Modifier.fillMaxWidth().testTag("two-factor-code"), singleLine = true)
      error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
      if (busy) {
        CircularProgressIndicator()
      } else {
        Button(onClick = {
          busy = true
          error = null
          scope.launch {
            try {
              val result = auth.verifyTwoFactor(code)
              if (result is AuthResult.SignedIn) onSignedIn(result.account)
            } catch (e: ApiError) {
              error = e.message
            } finally {
              busy = false
            }
          }
        }, modifier = Modifier.fillMaxWidth().testTag("two-factor-submit")) { Text("Verify") }
      }
    }
  }
}

