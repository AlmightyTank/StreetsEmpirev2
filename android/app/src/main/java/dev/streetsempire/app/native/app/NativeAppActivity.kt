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
import androidx.compose.runtime.State
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
import dev.streetsempire.app.GameConfig
import dev.streetsempire.app.MainActivity
import dev.streetsempire.app.R
import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.model.CitySummary
import dev.streetsempire.app.native.core.model.ConvoyAlertSummary
import dev.streetsempire.app.native.core.model.GameSnapshotDto
import dev.streetsempire.app.native.core.model.HappinessSummary
import dev.streetsempire.app.native.core.model.HeatSummary
import dev.streetsempire.app.native.core.model.MovingSummary
import dev.streetsempire.app.native.core.model.PlayerSummary
import dev.streetsempire.app.native.core.model.RankSummary
import dev.streetsempire.app.native.core.model.ResourcesSummary
import dev.streetsempire.app.native.core.model.RoundSummary
import dev.streetsempire.app.native.core.model.RunSummary
import dev.streetsempire.app.native.core.model.TurnsDto
import dev.streetsempire.app.native.core.network.ApiClient
import dev.streetsempire.app.native.core.network.ApiError
import dev.streetsempire.app.native.core.network.TokenStore
import dev.streetsempire.app.native.core.ui.AdaptiveGameChrome
import dev.streetsempire.app.native.core.ui.BirthdayDateField
import dev.streetsempire.app.native.core.ui.StreetsEmpireTheme
import dev.streetsempire.app.native.core.ui.birthdayError
import dev.streetsempire.app.native.feature.auth.AppLink
import dev.streetsempire.app.native.feature.auth.AppLinks
import dev.streetsempire.app.native.feature.auth.AuthRepository
import dev.streetsempire.app.native.feature.auth.AuthMessage
import dev.streetsempire.app.native.feature.auth.ForgotPasswordScreen
import dev.streetsempire.app.native.feature.auth.LoginScreen
import dev.streetsempire.app.native.feature.auth.ResetPasswordScreen
import dev.streetsempire.app.native.feature.auth.TwoFactorScreen
import dev.streetsempire.app.native.feature.dashboard.DashboardGateway
import dev.streetsempire.app.native.feature.dashboard.DashboardScreen
import dev.streetsempire.app.native.feature.onboarding.OnboardingScreen
import dev.streetsempire.app.native.feature.onboarding.VerifyEmailLinkScreen
import kotlinx.coroutines.launch

/**
 * Phase 1 native interface. The server remains the backend: every screen reads
 * and writes through the same `/api` JSON contracts as the web client, using
 * a bearer mobile session. Login + dashboard are live; the remaining game
 * modules are staged destinations so full parity lands incrementally.
 */
class NativeAppActivity : ComponentActivity() {
  private val pendingLink = mutableStateOf<AppLink?>(null)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleAppLink(intent)
    val tokens = TokenStore(this)
    val api = ApiClient(tokens)
    val auth = AuthRepository(api, tokens)
    val appState = AppStateStore(tokens)
    val allowPreview = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    setContent {
      StreetsEmpireTheme {
        NativeApp(auth, appState, allowPreview, pendingLink, onLinkConsumed = { pendingLink.value = null })
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleAppLink(intent)
  }

  /**
   * Strict app-link gate: only links matching the flavor's LINK_ORIGIN become
   * navigation. Untrusted hosts, schemes, ports, paths, and token-less links
   * are ignored and the user stays where they are.
   */
  private fun handleAppLink(intent: Intent?) {
    val data = intent?.data?.toString()
    pendingLink.value = AppLinks.parseAppLink(data, GameConfig.LINK_ORIGIN)
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
fun NativeApp(
  auth: AuthRepository,
  appState: AppStateStore,
  allowPreview: Boolean = false,
  pendingLink: State<AppLink?>? = null,
  onLinkConsumed: () -> Unit = {},
) {
  val nav = rememberNavController()
  val start = rootStartGraph(auth.isSignedIn())
  val link = pendingLink?.value
  LaunchedEffect(link) {
    when (link) {
      is AppLink.VerifyEmail -> nav.navigate(VerifyEmailLinkDestination(link.token))
      is AppLink.ResetPassword -> nav.navigate(ResetPasswordDestination(link.token))
      null -> return@LaunchedEffect
    }
    onLinkConsumed()
  }
  NavHost(navController = nav, startDestination = start) {
    navigation<AuthGraph>(startDestination = LoginDestination) {
      composable<LoginDestination> {
        LoginScreen(
          onSignedIn = {
            appState.beginBootstrap(it)
            nav.navigate(OnboardingGraph) { popUpTo<AuthGraph> { inclusive = true } }
          },
          onTwoFactor = { nav.navigate(TwoFactorDestination) },
          onForgotPassword = { nav.navigate(ForgotPasswordDestination) },
          onPreview = { nav.navigate(PreviewDestination) },
          allowPreview = allowPreview,
          auth = auth,
        )
      }
      composable<ForgotPasswordDestination> {
        ForgotPasswordScreen(
          auth = auth,
          onBackToSignIn = { nav.popBackStack() },
        )
      }
      composable<ResetPasswordDestination> { backStack ->
        val token = backStack.toRoute<ResetPasswordDestination>().token
        ResetPasswordScreen(
          auth = auth,
          token = token,
          onSignedIn = {
            appState.beginBootstrap(it)
            nav.navigate(OnboardingGraph) { popUpTo<AuthGraph> { inclusive = true } }
          },
          onTwoFactor = { nav.navigate(TwoFactorDestination) },
          onRequestNewLink = { nav.navigate(ForgotPasswordDestination) },
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
      composable<VerifyEmailLinkDestination> { backStack ->
        val token = backStack.toRoute<VerifyEmailLinkDestination>().token
        VerifyEmailLinkScreen(
          gateway = auth,
          token = token,
          onContinue = {
            if (auth.isSignedIn()) {
              nav.navigate(OnboardingGraph) { popUpTo<AuthGraph> { inclusive = true } }
            } else {
              nav.popBackStack(LoginDestination, inclusive = false)
            }
          },
          onBackToSignIn = { nav.popBackStack(LoginDestination, inclusive = false) },
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
  appState: AppStateStore,
  onOpenSection: (GameSection) -> Unit,
  onSignedOut: () -> Unit,
  preview: Boolean = false,
) {
  val scope = rememberCoroutineScope()
  var account by remember(preview) { mutableStateOf<AccountDto?>(if (preview) previewAccount else null) }
  var accountError by remember { mutableStateOf<String?>(null) }
  var accountLoading by remember(preview) { mutableStateOf(!preview) }
  var dashboardRefresh by remember { mutableStateOf(0) }
  val previewGateway = remember {
    object : DashboardGateway {
      override suspend fun snapshot(): GameSnapshotDto = previewSnapshot
    }
  }

  LaunchedEffect(preview) {
    if (preview) return@LaunchedEffect
    scope.launch {
      try {
        account = auth.me()
      } catch (e: ApiError) {
        accountError = e.message
        if (appState.handleFailure(e)) onSignedOut()
      } finally {
        accountLoading = false
      }
    }
  }

  if (!preview && account?.birthDateRequired == true && !accountLoading) {
    BirthdayGateScreen(
      auth = auth,
      onSaved = { updated ->
        account = updated
        dashboardRefresh++
      },
      onSignedOut = onSignedOut,
    )
    return
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
    if (accountLoading) {
      Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) { CircularProgressIndicator() }
      return@AdaptiveGameChrome
    }
    val context = LocalContext.current
    LazyColumn(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      if (preview) {
        item { Text("Preview mode · sample data", color = MaterialTheme.colorScheme.primary) }
      }
      accountError?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
      item {
        DashboardScreen(
          gateway = if (preview) previewGateway else auth,
          refreshSignal = dashboardRefresh,
          onSessionExpired = {
            if (!preview) {
              appState.invalidateSession()
              onSignedOut()
            }
          },
          onSnapshot = { snapshot ->
            if (!preview) {
              account?.let { freshAccount -> appState.applyRefresh(freshAccount, dashboard = snapshot) }
            }
          },
          onOpenSection = { name ->
            FULL_PARITY_SECTIONS.firstOrNull { it.name == name }?.let(onOpenSection)
          },
        )
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
  birthDateRequired = false,
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
    resources = ResourcesSummary(
      cashCents = 400_000,
      whores = 2,
      thugs = 4,
      fitThugs = 4,
      woundedThugs = 0,
      postedThugs = 0,
      unarmedThugs = 0,
      product = 10,
      condoms = 25,
      beer = 12,
      medicine = 3,
    ),
    turns = TurnsDto(
      turns = 42,
      turnCap = 100,
      nextTurnAt = "2026-10-15T12:05:00.000Z",
      turnsGeneratedNextTick = 5,
    ),
    happiness = HappinessSummary(whore = 80, thug = 70),
    heat = HeatSummary(heat = 12, max = 100, lockedUntil = null),
    run = null,
    moving = null,
    convoyAlert = null,
    rank = RankSummary(local = 3, national = 41),
  ),
  recentActivity = emptyList(),
)
