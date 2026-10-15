package dev.streetsempire.app.native.ui

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dev.streetsempire.app.MainActivity
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
      MaterialTheme {
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
  var identifier by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
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

  Scaffold(topBar = { TopAppBar(title = { Text("StreetsEmpire") }) }) { padding ->
    Column(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      OutlinedTextField(value = identifier, onValueChange = { identifier = it }, label = { Text("Pimp name or email") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
      OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("Password") }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation())
      if (siteKeyLoaded && siteKey != null) {
        TurnstileChallenge(siteKey = siteKey!!, captchaKey = captchaKey, onToken = { captchaToken = it })
      }
      error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
      info?.let { Text(it) }
      if (busy) {
        CircularProgressIndicator()
      } else {
        val captchaOn = siteKey != null
        Button(
          onClick = {
            if (captchaOn && captchaToken == null) {
              error = "Finish the \"are you a human\" check first."
              return@Button
            }
            busy = true
            error = null
            info = null
            scope.launch {
              try {
                when (val result = auth.login(identifier, password, captchaToken)) {
                  is AuthResult.SignedIn -> onSignedIn()
                  is AuthResult.TwoFactorRequired -> onTwoFactor()
                  is AuthResult.ApprovalRequired -> info = result.message
                }
              } catch (e: ApiError) {
                error = e.message
                // Tokens are single-use: force a fresh widget after every attempt.
                if (e.code == "CAPTCHA_REQUIRED" || e.code == "CAPTCHA_FAILED") {
                  captchaToken = null
                  captchaKey += 1
                  if (siteKey == null) siteKey = auth.turnstileSiteKey()
                } else {
                  captchaToken = null
                  captchaKey += 1
                }
              } finally {
                busy = false
              }
            }
          },
          enabled = true,
          modifier = Modifier.fillMaxWidth(),
        ) { Text("Sign in") }
        if (captchaOn) {
          if (captchaToken == null) {
            TurnstileHint()
          }
          TextButton(onClick = {
            captchaToken = null
            captchaKey += 1
          }) { Text("Reload human check") }
        }
      }
      if (allowPreview) {
        TextButton(onClick = onPreview, modifier = Modifier.fillMaxWidth()) {
          Text("Preview the app without signing in")
        }
      }
      Text("Native sign-in uses the game server directly. No WebView, no shared browser cookies.")
    }
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
        account = auth.me()
        snapshot = try {
          auth.dashboard()
        } catch (_: ApiError) {
          null
        }
      } catch (e: ApiError) {
        error = e.message
      } finally {
        loading = false
      }
    }
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
