package dev.streetsempire.app.native.app

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
import androidx.compose.runtime.collectAsState
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
import androidx.navigation.compose.navigation
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import dev.streetsempire.app.MainActivity
import dev.streetsempire.app.R
import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.model.CitySummary
import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.model.PlayerSummary
import dev.streetsempire.app.native.core.model.RoundSummary
import dev.streetsempire.app.native.core.model.TurnsDto
import dev.streetsempire.app.native.core.network.ApiClient
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.core.network.TokenStore
import dev.streetsempire.app.native.core.ui.AdaptiveGameChrome
import dev.streetsempire.app.native.core.ui.StreetsEmpireTheme
import dev.streetsempire.app.native.feature.auth.AuthRepository
import dev.streetsempire.app.native.feature.auth.AuthResult
import dev.streetsempire.app.native.feature.auth.TurnstileChallenge
import dev.streetsempire.app.native.feature.onboarding.OnboardingScreen
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
    val appState = AppStateStore(tokens)
    val allowPreview = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    setContent {
      StreetsEmpireTheme {
        NativeApp(auth, appState, allowPreview)
      }
    }
  }
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
fun NativeApp(auth: AuthRepository, appState: AppStateStore, allowPreview: Boolean = false) {
  val nav = rememberNavController()
  val start = rootStartGraph(auth.isSignedIn())
  NavHost(navController = nav, startDestination = start) {
    navigation<AuthGraph>(startDestination = LoginDestination) {
      composable<LoginDestination> {
        LoginScreen(
          onSignedIn = {
            appState.beginBootstrap(it)
            nav.navigate(OnboardingGraph) { popUpTo<AuthGraph> { inclusive = true } }
          },
          onTwoFactor = { nav.navigate(TwoFactorDestination) },
          onPreview = { nav.navigate(PreviewDestination) },
          allowPreview = allowPreview,
          auth = auth,
        )
      }
      composable<TwoFactorDestination> {
        TwoFactorScreen(
          onSignedIn = {
            appState.beginBootstrap(it)
            nav.navigate(OnboardingGraph) { popUpTo<AuthGraph> { inclusive = true } }
          },
          auth = auth,
        )
      }
      composable<PreviewDestination> {
        HomeScreen(
          auth = auth,
          appState = appState,
          preview = true,
          onOpenSection = { nav.navigate(FeatureDestination(it.name)) },
          onSignedOut = { nav.popBackStack(LoginDestination, inclusive = false) },
        )
      }
    }
    navigation<OnboardingGraph>(startDestination = OnboardingDestination) {
      composable<OnboardingDestination> {
        ProtectedContent(appState, ProtectedArea.Onboarding, onRedirect = {
          nav.navigate(AuthGraph) { popUpTo<OnboardingGraph> { inclusive = true } }
        }) {
          OnboardingScreen(
            auth = auth,
            onAccountChanged = appState::applyAccount,
            onRoundChanged = appState::applyRound,
            onSessionExpired = {
              appState.invalidateSession()
              nav.navigate(AuthGraph) { popUpTo<OnboardingGraph> { inclusive = true } }
            },
            onComplete = {
              nav.navigate(GameGraph) { popUpTo<OnboardingGraph> { inclusive = true } }
            },
            onSignedOut = {
              appState.invalidateSession()
              nav.navigate(AuthGraph) { popUpTo<OnboardingGraph> { inclusive = true } }
            },
          )
        }
      }
    }
    navigation<GameGraph>(startDestination = HomeDestination) {
      composable<HomeDestination> {
        ProtectedContent(appState, ProtectedArea.Game, onRedirect = { destination ->
          when (destination) {
            LoginDestination -> nav.navigate(AuthGraph) { popUpTo<GameGraph> { inclusive = true } }
            else -> nav.navigate(OnboardingGraph) { popUpTo<GameGraph> { inclusive = true } }
          }
        }) {
          HomeScreen(
            auth = auth,
            appState = appState,
            onOpenSection = { nav.navigate(FeatureDestination(it.name)) },
            onSignedOut = {
              appState.invalidateSession()
              nav.navigate(AuthGraph) { popUpTo<GameGraph> { inclusive = true } }
            },
          )
        }
      }
      composable<FeatureDestination> { backStack ->
        val name = backStack.toRoute<FeatureDestination>().name
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
}

@Composable
private fun ProtectedContent(
  appState: AppStateStore,
  area: ProtectedArea,
  onRedirect: (Any) -> Unit,
  content: @Composable () -> Unit,
) {
  val state by appState.state.collectAsState()
  val redirect = protectedRedirect(state, area)
  LaunchedEffect(redirect) {
    if (redirect != null) onRedirect(redirect)
  }
  if (redirect == null) content()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
  auth: AuthRepository,
  onSignedIn: (AccountDto) -> Unit,
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
          AuthMode.SignUp -> auth.register(username, email, password, ageConfirmed, captchaToken)
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
internal fun AuthMessage(message: String, isError: Boolean) {
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
fun TwoFactorScreen(auth: AuthRepository, onSignedIn: (AccountDto) -> Unit) {
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
              val result = auth.verifyTwoFactor(code)
              if (result is AuthResult.SignedIn) onSignedIn(result.account)
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
  auth: AuthRepository,
  appState: AppStateStore,
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
        account = auth.me()
        snapshot = try {
          auth.dashboard()
        } catch (_: ApiError) {
          null
        }
        account?.let { freshAccount ->
          snapshot?.let { freshSnapshot -> appState.applyRefresh(freshAccount, dashboard = freshSnapshot) }
            ?: appState.applyAccount(freshAccount)
        }
      } catch (e: ApiError) {
        error = e.message
        if (appState.handleFailure(e)) onSignedOut()
      } finally {
        loading = false
      }
    }
  }

  val sharedState by appState.state.collectAsState()
  AdaptiveGameChrome(
    title = "StreetsEmpire",
    selected = "Dashboard",
    unreadNotifications = sharedState.unreadNotifications,
    onNavigate = { label ->
      if (label == "Dashboard") return@AdaptiveGameChrome
      FULL_PARITY_SECTIONS.firstOrNull { it.name == label }?.let(onOpenSection)
    },
  ) { padding ->
    if (loading) {
      Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) { CircularProgressIndicator() }
      return@AdaptiveGameChrome
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
              appState.invalidateSession()
              onSignedOut()
            }
          }
        }) { Text(if (preview) "Back to sign in" else "Sign out") }
      }
    }
  }
}

private val previewAccount = AccountDto(
  id = "preview",
  username = "MidnightBoss",
  email = "preview@streetsempire.dev",
  emailVerifiedAt = "2026-10-15T12:00:00.000Z",
  discordLinked = false,
  discordUsername = null,
  isAdmin = false,
  createdAt = "2026-10-15T12:00:00.000Z",
  lastLoginAt = "2026-10-15T12:00:00.000Z",
  verificationRequired = false,
  rulesAcceptanceRequired = false,
  adminSignInRequired = false,
  twoFactorEnabled = false,
)

private val previewSnapshot = GameSnapshotDto(
  round = RoundSummary(
    id = "preview-season",
    name = "Empire Season",
    slug = "empire-season",
    status = "ACTIVE",
    rulesetId = "classic-og-v3.0-a",
    rulesetVersion = "3.0.0",
    startsAt = "2026-10-15T12:00:00.000Z",
    endsAt = "2026-10-22T12:00:00.000Z",
    registrationOpensAt = null,
    msRemaining = 604_800_000,
    playerCount = 428,
    paused = null,
  ),
  player = PlayerSummary(
    id = "preview-player",
    publicPimpId = 101,
    displayName = "MidnightBoss",
    city = CitySummary(slug = "new-york", name = "New York City"),
    payoutPercent = 50,
    netWorthCents = 12_845_700,
    turns = TurnsDto(
      turns = 42,
      turnCap = 100,
      nextTurnAt = "2026-10-15T12:05:00.000Z",
      turnsGeneratedNextTick = 5,
    ),
  ),
  recentActivity = emptyList(),
)
