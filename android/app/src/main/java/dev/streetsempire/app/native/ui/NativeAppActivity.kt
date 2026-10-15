package dev.streetsempire.app.native.ui

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.util.Patterns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.darkColorScheme
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dev.streetsempire.app.MainActivity
import dev.streetsempire.app.R
import dev.streetsempire.app.native.auth.AuthRepository
import dev.streetsempire.app.native.auth.AuthResult
import dev.streetsempire.app.native.auth.TokenStore
import dev.streetsempire.app.native.net.AccountDto
import dev.streetsempire.app.native.net.ApiClient
import dev.streetsempire.app.native.net.ApiError
import dev.streetsempire.app.native.net.GameSnapshotDto
import dev.streetsempire.app.native.net.PlayerSummary
import dev.streetsempire.app.native.net.RoundSummary
import dev.streetsempire.app.native.net.TurnsDto
import kotlinx.coroutines.launch

/**
 * Phase 1 native interface. The server remains the backend: every screen reads
 * and writes through the same `/api` JSON contracts as the web client, using
 * a bearer mobile session. Login + dashboard are live; the remaining game
 * modules are staged destinations so full parity lands incrementally.
 */
class NativeAppActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val tokens = TokenStore(this)
    val api = ApiClient(tokens)
    val auth = AuthRepository(api, tokens)
    val allowPreview = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    setContent {
      MaterialTheme(colorScheme = StreetsEmpireColors) {
        NativeApp(auth, allowPreview)
      }
    }
  }
}

private object Routes {
  const val LOGIN = "login"
  const val TWO_FACTOR = "2fa"
  const val HOME = "home"
  const val PREVIEW = "preview"
  const val SECTION = "section/{name}"
}

data class GameSection(val name: String, val endpoint: String)

val FULL_PARITY_SECTIONS = listOf(
  GameSection("Actions", "POST /api/game/* (quests, stores, supply, loans, scouting)"),
  GameSection("Crew & Turf", "GET/POST /api/game/crew/*, dealers, holdings"),
  GameSection("Casino", "GET/POST /api/game/casino/*"),
  GameSection("Combat", "GET/POST /api/game/combat/*"),
  GameSection("Alliance", "GET/POST /api/game/alliance*"),
  GameSection("Community", "GET/POST /api/game/* + /api/forum/*"),
  GameSection("Notifications", "GET /api/notifications"),
  GameSection("Supporter", "GET /api/supporter/status + Play Billing"),
  GameSection("Account", "GET /api/auth/me + sessions, profile, 2FA"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeApp(auth: AuthRepository, allowPreview: Boolean = false) {
  val nav = rememberNavController()
  val start = if (auth.isSignedIn()) Routes.HOME else Routes.LOGIN
  NavHost(navController = nav, startDestination = start) {
    composable(Routes.LOGIN) {
      LoginScreen(
        onSignedIn = { nav.navigate(Routes.HOME) { popUpTo(Routes.LOGIN) { inclusive = true } } },
        onTwoFactor = { nav.navigate(Routes.TWO_FACTOR) },
        onPreview = { nav.navigate(Routes.PREVIEW) },
        allowPreview = allowPreview,
        auth = auth,
      )
    }
    composable(Routes.TWO_FACTOR) {
      TwoFactorScreen(
        onSignedIn = { nav.navigate(Routes.HOME) { popUpTo(Routes.LOGIN) { inclusive = true } } },
        auth = auth,
      )
    }
    composable(Routes.HOME) {
      HomeScreen(
        auth = auth,
        onOpenSection = { nav.navigate("section/${it.name}") },
        onSignedOut = { nav.navigate(Routes.LOGIN) { popUpTo(Routes.HOME) { inclusive = true } } },
      )
    }
    composable(Routes.PREVIEW) {
      HomeScreen(
        auth = auth,
        preview = true,
        onOpenSection = { nav.navigate("section/${it.name}") },
        onSignedOut = { nav.navigate(Routes.LOGIN) { popUpTo(Routes.PREVIEW) { inclusive = true } } },
      )
    }
    composable(Routes.SECTION) { backStack ->
      val name = backStack.arguments?.getString("name").orEmpty()
      val section = FULL_PARITY_SECTIONS.firstOrNull { it.name == name }
      Scaffold(topBar = { TopAppBar(title = { Text(name.ifEmpty { "Section" }) }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
          Text(section?.endpoint ?: "Unknown section.")
          Text("Native UI for this module is next. It will use the same endpoint contract as web.")
          Button(onClick = { nav.popBackStack() }) { Text("Back") }
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
  auth: AuthRepository,
  onSignedIn: () -> Unit,
  onTwoFactor: () -> Unit,
  onPreview: () -> Unit = {},
  allowPreview: Boolean = false,
) {
  val scope = rememberCoroutineScope()
  val focusManager = LocalFocusManager.current
  var mode by remember { mutableStateOf(AuthMode.SignIn) }
  var identifier by remember { mutableStateOf("") }
  var username by remember { mutableStateOf("") }
  var email by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var confirmPassword by remember { mutableStateOf("") }
  var passwordVisible by remember { mutableStateOf(false) }
  var ageConfirmed by remember { mutableStateOf(false) }
  var birthDate by remember { mutableStateOf("") }
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
    mode = next
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
          is AuthResult.SignedIn -> onSignedIn()
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
      Text(
        text = "STREETSEMPIRE",
        color = MaterialTheme.colorScheme.onBackground,
        style = MaterialTheme.typography.headlineMedium.copy(
          fontWeight = FontWeight.Black,
          letterSpacing = 2.sp,
        ),
      )
      Text(
        text = "Build your name. Run your city.",
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
      )
      Spacer(Modifier.height(24.dp))

      Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
      ) {
        Column(
          modifier = Modifier.padding(20.dp),
          verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
          TabRow(selectedTabIndex = mode.ordinal, containerColor = Color.Transparent) {
            AuthMode.entries.forEach { option ->
              Tab(
                selected = mode == option,
                onClick = { switchMode(option) },
                text = { Text(option.label, fontWeight = FontWeight.SemiBold) },
                enabled = !busy,
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
              modifier = Modifier.fillMaxWidth(),
              singleLine = true,
              enabled = !busy,
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
          } else {
            OutlinedTextField(
              value = username,
              onValueChange = { username = it.take(20); error = null },
              label = { Text("Pimp name") },
              supportingText = { Text("3–20 characters · letters, numbers, _ or -") },
              modifier = Modifier.fillMaxWidth(),
              singleLine = true,
              enabled = !busy,
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
            OutlinedTextField(
              value = email,
              onValueChange = { email = it; error = null },
              label = { Text("Email") },
              modifier = Modifier.fillMaxWidth(),
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
            modifier = Modifier.fillMaxWidth(),
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
              modifier = Modifier.fillMaxWidth(),
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
              TurnstileChallenge(siteKey = siteKey!!, captchaKey = captchaKey, onToken = { captchaToken = it })
            }
          }

          error?.let { AuthMessage(it, isError = true) }
          info?.let { AuthMessage(it, isError = false) }

          Button(
            onClick = { submit() },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().height(52.dp),
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
private fun AuthMessage(message: String, isError: Boolean) {
  Surface(
    modifier = Modifier.fillMaxWidth(),
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
fun TwoFactorScreen(auth: AuthRepository, onSignedIn: () -> Unit) {
  val scope = rememberCoroutineScope()
  var code by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  Scaffold(topBar = { TopAppBar(title = { Text("Two-step sign-in") }) }) { padding ->
    Column(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Text("Enter the 6-digit code from your authenticator app.")
      OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text("Code") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
      error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
      if (busy) {
        CircularProgressIndicator()
      } else {
        Button(onClick = {
          busy = true
          error = null
          scope.launch {
            try {
              auth.verifyTwoFactor(code)
              onSignedIn()
            } catch (e: ApiError) {
              error = e.message
            } finally {
              busy = false
            }
          }
        }, modifier = Modifier.fillMaxWidth()) { Text("Verify") }
      }
    }
  }
}

/** Native signed-in accounts cannot enter the game before their private birthday is saved. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BirthdayGateScreen(
  auth: AuthRepository,
  onSaved: (AccountDto) -> Unit,
  onSignedOut: () -> Unit,
) {
  val scope = rememberCoroutineScope()
  var birthday by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  Scaffold(topBar = { TopAppBar(title = { Text("Account age verification") }) }) { padding ->
    Column(
      modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
      Text("One-time birthday check", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
      Text("StreetsEmpire is for players 16 and older. Your birthday is kept private and is never shown to other players.")
      BirthdayDateField(value = birthday, enabled = !busy, onSelect = { birthday = it; error = null })
      error?.let { AuthMessage(it, isError = true) }
      Button(
        onClick = {
          val invalid = birthdayError(birthday)
          if (invalid != null) {
            error = invalid
          } else {
            busy = true
            error = null
            scope.launch {
              try {
                onSaved(auth.saveBirthday(birthday))
              } catch (e: ApiError) {
                error = e.message
              } finally {
                busy = false
              }
            }
          }
        },
        modifier = Modifier.fillMaxWidth(),
        enabled = !busy && birthday.isNotBlank(),
      ) { Text(if (busy) "Saving..." else "Save birthday and continue") }
      TextButton(onClick = {
        busy = true
        scope.launch {
          try { auth.logout() } finally { onSignedOut() }
        }
      }, enabled = !busy) { Text("Sign out") }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
  auth: AuthRepository,
  onOpenSection: (GameSection) -> Unit,
  onSignedOut: () -> Unit,
  preview: Boolean = false,
) {
  val scope = rememberCoroutineScope()
  var account by remember(preview) { mutableStateOf<AccountDto?>(if (preview) previewAccount else null) }
  var snapshot by remember(preview) { mutableStateOf<GameSnapshotDto?>(if (preview) previewSnapshot else null) }
  var error by remember { mutableStateOf<String?>(null) }
  var loading by remember(preview) { mutableStateOf(!preview) }

  LaunchedEffect(preview) {
    if (preview) return@LaunchedEffect
    scope.launch {
      try {
        val signedIn = auth.me()
        account = signedIn
        // A missing date of birth must be completed before requesting game data.
        if (!signedIn.birthDateRequired) {
          snapshot = try { auth.dashboard() } catch (_: ApiError) { null }
        }
      } catch (e: ApiError) {
        error = e.message
      } finally {
        loading = false
      }
    }
  }

  if (!preview && account?.birthDateRequired == true && !loading) {
    BirthdayGateScreen(
      auth = auth,
      onSaved = { updated ->
        account = updated
        scope.launch {
          snapshot = try { auth.dashboard() } catch (_: ApiError) { null }
        }
      },
      onSignedOut = onSignedOut,
    )
    return
  }

  Scaffold(topBar = { TopAppBar(title = { Text("StreetsEmpire") }) }) { padding ->
    if (loading) {
      Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) { CircularProgressIndicator() }
      return@Scaffold
    }
    val context = LocalContext.current
    LazyColumn(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      if (preview) {
        item { Text("Preview mode · sample data", color = MaterialTheme.colorScheme.primary) }
      }
      error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
      item {
        Card(Modifier.fillMaxWidth()) {
          Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Welcome, ${account?.username ?: snapshot?.player?.displayName ?: "boss"}", style = MaterialTheme.typography.titleLarge)
            snapshot?.let {
              Text("Season: ${it.round.name}")
              Text("Net worth: $${it.player.netWorthCents / 100}")
              Text("Turns: ${it.player.turns.turns}/${it.player.turns.turnCap}")
            } ?: Text("You are signed in. Join the current season on web to see your dashboard here.")
          }
        }
      }
      item { Text("Game", style = MaterialTheme.typography.titleMedium) }
      items(FULL_PARITY_SECTIONS) { section ->
        Card(onClick = { onOpenSection(section) }, modifier = Modifier.fillMaxWidth()) {
          Column(Modifier.padding(16.dp)) {
            Text(section.name, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(section.endpoint, style = MaterialTheme.typography.bodySmall)
          }
        }
      }
      item {
        TextButton(onClick = {
          context.startActivity(Intent(context, MainActivity::class.java))
        }) { Text("Open full game in web view (fallback until parity)") }
        TextButton(onClick = {
          if (preview) {
            onSignedOut()
            return@TextButton
          }
          scope.launch {
            try {
              auth.logout()
            } finally {
              onSignedOut()
            }
          }
        }) { Text(if (preview) "Back to sign in" else "Sign out") }
      }
    }
  }
}

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

private val previewAccount = AccountDto(
  id = "preview",
  username = "MidnightBoss",
  email = "preview@streetsempire.dev",
)

private val previewSnapshot = GameSnapshotDto(
  round = RoundSummary(
    id = "preview-season",
    name = "Empire Season",
    status = "ACTIVE",
    msRemaining = 604_800_000,
    playerCount = 428,
  ),
  player = PlayerSummary(
    id = "preview-player",
    displayName = "MidnightBoss",
    netWorthCents = 12_845_700,
    turns = TurnsDto(turns = 42, turnCap = 100, turnsGeneratedNextTick = 5),
  ),
)
