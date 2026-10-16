package dev.streetsempire.app.native.feature.onboarding

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.streetsempire.app.native.core.model.AccountDto
import dev.streetsempire.app.native.core.model.CitySummary
import dev.streetsempire.app.native.core.model.CurrentRoundDto
import dev.streetsempire.app.native.core.model.HappinessSummary
import dev.streetsempire.app.native.core.model.PlayerSummary
import dev.streetsempire.app.native.core.model.RankSummary
import dev.streetsempire.app.native.core.model.ResourcesSummary
import dev.streetsempire.app.native.core.model.RoundSummary
import dev.streetsempire.app.native.core.model.RuleDto
import dev.streetsempire.app.native.core.model.RulesAgreementDto
import dev.streetsempire.app.native.core.model.TurnsDto
import dev.streetsempire.app.native.core.ui.StreetsEmpireTheme
import dev.streetsempire.app.native.feature.auth.OnboardingGateway
import kotlinx.serialization.json.JsonNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

private fun testAccount(
  verificationRequired: Boolean = false,
  rulesAcceptanceRequired: Boolean = false,
) = AccountDto(
  id = "acct-1",
  username = "MidnightBoss",
  email = "boss@example.com",
  emailVerifiedAt = if (verificationRequired) null else "2026-10-01T00:00:00Z",
  discordLinked = false,
  discordUsername = null,
  isAdmin = false,
  createdAt = "2026-09-01T00:00:00Z",
  lastLoginAt = null,
  verificationRequired = verificationRequired,
  rulesAcceptanceRequired = rulesAcceptanceRequired,
  birthDateRequired = false,
  adminSignInRequired = false,
  twoFactorEnabled = false,
)

private fun testRound(
  name: String = "Empire Season",
  canJoin: Boolean = true,
  me: PlayerSummary? = null,
) = RoundSummary(
  id = "round-1",
  name = name,
  slug = "empire-season",
  status = "ACTIVE",
  rulesetId = "classic",
  rulesetVersion = "3.0",
  startsAt = "2026-10-01T00:00:00Z",
  endsAt = "2026-12-31T00:00:00Z",
  registrationOpensAt = null,
  msRemaining = 1_000_000L,
  playerCount = 42,
  paused = null,
).let { round ->
  CurrentRoundDto(round = round, me = me, canJoin = canJoin, roundOver = JsonNull)
}

private fun testPlayer() = PlayerSummary(
  id = "player-1",
  publicPimpId = 7,
  displayName = "MidnightBoss",
  city = CitySummary(slug = "new-york", name = "New York City"),
  payoutPercent = 10,
  netWorthCents = 128457L,
  resources = ResourcesSummary(
    cashCents = 128457L, whores = 0, thugs = 3, fitThugs = 3, woundedThugs = 0,
    postedThugs = 0, unarmedThugs = 0, product = 0, condoms = 0, beer = 0, medicine = 0,
  ),
  turns = TurnsDto(turns = 42, turnCap = 100, nextTurnAt = "2026-10-16T00:00:00Z", turnsGeneratedNextTick = 5),
  happiness = HappinessSummary(whore = 0, thug = 0),
  heat = null,
  run = null,
  moving = null,
  convoyAlert = null,
  rank = RankSummary(local = null, national = null),
)

private class FakeOnboardingGateway(
  var account: AccountDto,
  var agreement: RulesAgreementDto = RulesAgreementDto(
    version = "2026-10-15a",
    minimumAge = 16,
    rules = listOf(RuleDto("No cheating", "Play fair.")),
  ),
  var round: CurrentRoundDto = testRound(),
  var verified: Boolean = false,
  var joined: Boolean = false,
) : OnboardingGateway {
  var meCalls = 0
  var resendCalls = 0
  var acceptCalls = 0
  var acceptVersion: String? = null
  var joinCalls = 0

  override suspend fun me(): AccountDto {
    meCalls += 1
    return if (verified) account.copy(verificationRequired = false) else account
  }

  override suspend fun rulesAgreement(): RulesAgreementDto = agreement

  override suspend fun requestEmailVerification(): String {
    resendCalls += 1
    return "Verification link sent."
  }

  override suspend fun verifyEmailToken(token: String): String {
    verified = true
    return "Your account email is verified."
  }

  override suspend fun acceptRules(version: String): AccountDto {
    acceptCalls += 1
    acceptVersion = version
    account = account.copy(rulesAcceptanceRequired = false)
    return account
  }

  override suspend fun currentRound(): CurrentRoundDto = round

  override suspend fun joinCurrentRound(): CurrentRoundDto {
    joinCalls += 1
    round = round.copy(me = if (joined) testPlayer() else null)
    return round
  }

  override suspend fun logout() = Unit
}

@RunWith(AndroidJUnit4::class)
class OnboardingScreenTest {
  @get:Rule
  val compose = createComposeRule()

  private fun render(
    gateway: FakeOnboardingGateway,
    onComplete: () -> Unit = {},
  ) {
    compose.setContent {
      StreetsEmpireTheme {
        OnboardingScreen(auth = gateway, onComplete = onComplete, onSignedOut = {})
      }
    }
  }

  @Test
  fun unverifiedAccountShowsVerifyGate() {
    render(FakeOnboardingGateway(account = testAccount(verificationRequired = true)))

    compose.onNodeWithTag("verify-card").assertIsDisplayed()
    compose.onNodeWithText("boss@example.com").assertIsDisplayed()
    compose.onNodeWithTag("verify-check").assertIsEnabled()
  }

  @Test
  fun confirmingVerificationAdvancesToRulesGate() {
    val gateway = FakeOnboardingGateway(
      account = testAccount(verificationRequired = true, rulesAcceptanceRequired = true),
    )
    render(gateway)

    compose.onNodeWithTag("verify-card").assertIsDisplayed()
    gateway.verified = true
    compose.onNodeWithTag("verify-check").performClick()

    compose.waitUntil(timeoutMillis = 5_000) {
      runCatching { compose.onNodeWithTag("rules-card").assertIsDisplayed() }.isSuccess
    }
    compose.onNodeWithText("You must be 16 or older to play. Accepting below declares your age and your agreement.").assertIsDisplayed()
    compose.onNodeWithText("No cheating").assertIsDisplayed()
  }

  @Test
  fun resendingVerificationShowsServerNotice() {
    render(FakeOnboardingGateway(account = testAccount(verificationRequired = true)))

    compose.onNodeWithTag("verify-resend").performClick()

    compose.waitUntil(timeoutMillis = 5_000) {
      runCatching { compose.onNodeWithTag("onboarding-notice").assertIsDisplayed() }.isSuccess
    }
  }

  @Test
  fun acceptingRulesWithDeclarationAdvancesToJoinGate() {
    val gateway = FakeOnboardingGateway(account = testAccount(rulesAcceptanceRequired = true))
    render(gateway)

    compose.waitUntil(timeoutMillis = 5_000) {
      runCatching { compose.onNodeWithTag("rules-card").assertIsDisplayed() }.isSuccess
    }
    compose.onNodeWithTag("rules-accept").assertIsNotEnabled()
    compose.onNodeWithTag("rules-agree-checkbox").performScrollTo().performClick()
    compose.onNodeWithTag("rules-accept").performScrollTo().performClick()

    compose.waitUntil(timeoutMillis = 5_000) {
      runCatching { compose.onNodeWithTag("join-card").assertIsDisplayed() }.isSuccess
    }
    assertEquals(1, gateway.acceptCalls)
    assertEquals("2026-10-15a", gateway.acceptVersion)
    compose.onNodeWithText("New York City").assertIsDisplayed()
  }

  @Test
  fun alreadyJoinedPlayerCompletesImmediately() {
    var completed = false
    render(
      FakeOnboardingGateway(account = testAccount(), round = testRound(me = testPlayer())),
      onComplete = { completed = true },
    )

    compose.waitUntil(timeoutMillis = 5_000) { completed }
    assertTrue(completed)
  }

  @Test
  fun joiningSeasonCompletesWhenPlayerReturned() {
    val gateway = FakeOnboardingGateway(account = testAccount(), joined = true)
    var completed = false
    render(gateway, onComplete = { completed = true })

    compose.waitUntil(timeoutMillis = 5_000) {
      runCatching { compose.onNodeWithTag("join-card").assertIsDisplayed() }.isSuccess
    }
    compose.onNodeWithTag("join-enter").performScrollTo().performClick()

    compose.waitUntil(timeoutMillis = 5_000) { completed }
    assertEquals(1, gateway.joinCalls)
  }

  @Test
  fun closedSeasonShowsWaitingMessage() {
    val gateway = FakeOnboardingGateway(account = testAccount())
    gateway.round = CurrentRoundDto(round = null, me = null, canJoin = false, roundOver = JsonNull)
    render(gateway)

    compose.waitUntil(timeoutMillis = 5_000) {
      runCatching { compose.onNodeWithTag("join-card").assertIsDisplayed() }.isSuccess
    }
    compose.onNodeWithText("There is no season open right now.").assertIsDisplayed()
  }

  @Test
  fun nonJoinableSeasonDisablesEnter() {
    render(FakeOnboardingGateway(account = testAccount(), round = testRound(canJoin = false)))

    compose.waitUntil(timeoutMillis = 5_000) {
      runCatching { compose.onNodeWithTag("join-card").assertIsDisplayed() }.isSuccess
    }
    compose.onNodeWithTag("join-enter").assertIsNotEnabled()
    compose.onNodeWithText("This season is not accepting new players right now.").assertIsDisplayed()
  }
}
