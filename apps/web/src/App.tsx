import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { StaffCapability } from '@streets/shared';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AccountSettingsPage } from './pages/AccountSettingsPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { KonamiCode } from './components/EasterEggs.js';
import { AdminAccountPage } from './pages/AdminAccountPage.js';
import { AdminAccountsPage } from './pages/AdminAccountsPage.js';
import { AdminAuditPage } from './pages/AdminAuditPage.js';
import { AdminEventsPage } from './pages/AdminEventsPage.js';
import { AdminReportsPage } from './pages/AdminReportsPage.js';
import { AdminBugReportsPage } from './pages/AdminBugReportsPage.js';
import { AdminEconomyPage } from './pages/AdminEconomyPage.js';
import { AdminSupplyPage } from './pages/AdminSupplyPage.js';
import { AdminLoansPage } from './pages/AdminLoansPage.js';
import { AdminCasinoPage } from './pages/AdminCasinoPage.js';
import { AdminFactionsPage } from './pages/AdminFactionsPage.js';
import { AdminCrewPage } from './pages/AdminCrewPage.js';
import { AdminVehiclesPage } from './pages/AdminVehiclesPage.js';
import { AdminArmoryPlayerPage } from './pages/AdminArmoryPlayerPage.js';
import { AdminLawPage } from './pages/AdminLawPage.js';
import { AdminLawPlayerPage } from './pages/AdminLawPlayerPage.js';
import { AdminCombatPage } from './pages/AdminCombatPage.js';
import { AdminTurfPage } from './pages/AdminTurfPage.js';
import { AdminMonitoringPage } from './pages/AdminMonitoringPage.js';
import { AdminIntegrationsPage } from './pages/AdminIntegrationsPage.js';
import { AdminNewsPage } from './pages/AdminNewsPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { AdminPlayerPage } from './pages/AdminPlayerPage.js';
import { AdminQuestContentPage } from './pages/AdminQuestContentPage.js';
import { AdminRoundPage } from './pages/AdminRoundPage.js';
import { AdminRulesetsPage } from './pages/AdminRulesetsPage.js';
import { AdminSignalsPage } from './pages/AdminSignalsPage.js';
import { AdminSurveysPage } from './pages/AdminSurveysPage.js';
import { AdminSupportersPage } from './pages/AdminSupportersPage.js';
import { AdminStaffPage } from './pages/AdminStaffPage.js';
import { ForumLinkPage } from './pages/ForumLinkPage.js';
import { AlliancePage } from './pages/AlliancePage.js';
import { AllianceDetailPage } from './pages/AlliancesPage.js';
import { CombatPage } from './pages/CombatPage.js';
import { StreetPassPage } from './pages/StreetPassPage.js';
import { RoundRollCallPage } from './pages/RoundRollCallPage.js';
import { DropPage } from './pages/DropPage.js';
import { AdminDropPage } from './pages/AdminDropPage.js';
import { SupporterPage } from './pages/SupporterPage.js';
import { EmpireInsightsPage } from './pages/EmpireInsightsPage.js';
import { XpProgressPage } from './pages/XpProgressPage.js';
import { ConsolePage } from './pages/ConsolePage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { HallOfFamePage } from './pages/HallOfFamePage.js';
import { RoundAftermathPage } from './pages/RoundAftermathPage.js';
import { RoundArchivePage } from './pages/RoundArchivePage.js';
import { roundAftermathPublicEnabled } from './config/features.js';
import { HideoutPage } from './pages/HideoutPage.js';
import { JoinPage } from './pages/JoinPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NewsPage } from './pages/NewsPage.js';
import { ProducePage } from './pages/ProducePage.js';
import { QuestPage } from './pages/QuestPage.js';
import { ContactRoomPage } from './pages/ContactRoomPage.js';
import { EventsPage } from './pages/EventsPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { SkillsPage } from './pages/SkillsPage.js';
import { PlayersPage } from './pages/PlayersPage.js';
import { RankingsPage } from './pages/RankingsPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ReportBugPage } from './pages/ReportBugPage.js';
import { ResetPasswordPage } from './pages/ResetPasswordPage.js';
import { RulesPage } from './pages/RulesPage.js';
import { ScoutPage } from './pages/ScoutPage.js';
import { StatusPage } from './pages/StatusPage.js';
import { VerifyEmailPage } from './pages/VerifyEmailPage.js';
import { StorePage, StoresIndexPage } from './pages/StorePage.js';
import { ArmoryPage } from './pages/ArmoryPage.js';
import { SupplyPage } from './pages/SupplyPage.js';
import { HoldingsPage } from './pages/HoldingsPage.js';
import { LoanSharkPage } from './pages/LoanSharkPage.js';
import { DealersPage } from './pages/DealersPage.js';
import { CrewRosterPage } from './pages/CrewRosterPage.js';
import { TravelPage } from './pages/TravelPage.js';
import { CasinoPage } from './pages/CasinoPage.js';
import { TurfPage } from './pages/TurfPage.js';
import { OperationsPage } from './pages/OperationsPage.js';
import { BlackBookPage } from './pages/BlackBookPage.js';
import { GameRouteLayout } from './layouts/GameLayout.js';
import { useMaintenanceMessage } from './components/MaintenanceBanner.js';
import { VerifyEmailGate } from './components/VerifyEmailGate.js';
import { RulesGate } from './components/RulesGate.js';
import { BirthDateGate } from './components/BirthDateGate.js';
import { AdminDiscordGate } from './components/AdminDiscordGate.js';
import { adminSectionsFor } from './layouts/gameNav.js';
import { useStaff } from './utils/staff.js';
import { landingPath, useSession } from './stores/session.js';

const UiGalleryPage = import.meta.env.DEV ? lazy(() => import('./pages/UiGalleryPage.js').then((module) => ({ default: module.UiGalleryPage }))) : null;

/** Roll Call used to live on Street Pass; old #round-roll-call links land on its own page. */
function StreetPassRoute() {
  const { hash } = useLocation();
  if (hash === '#round-roll-call') return <Navigate to="/game/roll-call" replace />;
  return <StreetPassPage />;
}

function SurveyRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/game/news${search}#surveys`} replace />;
}

function RequireAccount({ children }: { children: ReactNode }) {
  const account = useSession((s) => s.account);
  if (!account) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Protected({ children }: { children: ReactNode }) {
  return <RequireAccount><RequirePlayable>{children}</RequirePlayable></RequireAccount>;
}

/** Playing needs a verified email or Discord, then the rules accepted; until then the account sees how to get there. */
function RequirePlayable({ children }: { children: ReactNode }) {
  const unverified = useSession((s) => s.account?.verificationRequired ?? false);
  const rulesPending = useSession((s) => s.account?.rulesAcceptanceRequired ?? false);
  const birthDatePending = useSession((s) => s.account?.birthDateRequired ?? false);
  // Enforce birthday collection immediately on the next signed-in game visit.
  if (birthDatePending) return <BirthDateGate />;
  if (unverified) return <VerifyEmailGate />;
  // First sign-in (or the rules changed): accept them before anything else.
  if (rulesPending) return <RulesGate />;
  return <>{children}</>;
}

/** Hides admin pages from anyone whose staff role cannot use them. The server checks every admin route regardless. */
function RequireStaff({ capability, children }: { capability: StaffCapability; children: ReactNode }) {
  const { role, can } = useStaff();
  const needsDiscord = useSession((s) => s.account?.adminSignInRequired ?? false);
  if (!role) return <Navigate to="/game" replace />;
  if (!can(capability)) return <Navigate to="/game/admin" replace />;
  // rc.2/rc.3: admin tools answer only a sign-in with a second factor (REQUIRE_ADMIN_2FA).
  if (needsDiscord) return <AdminDiscordGate />;
  return <>{children}</>;
}

function LiveRound({ children }: { children: ReactNode }) {
  const me = useSession((s) => s.me);
  const roundOver = useSession((s) => s.roundOver);
  if (!me) return <Navigate to={roundOver ? '/game' : '/join'} replace />;
  return <>{children}</>;
}

function GameEntry() {
  const account = useSession((s) => s.account);
  const me = useSession((s) => s.me);
  const profileSettings = useSession((s) => s.profileSettings);

  if (!account) return <LoginPage />;
  return <Navigate to={landingPath(profileSettings.defaultLanding, Boolean(me))} replace />;
}

function Booting() {
  // 1.0.0-F: in maintenance mode the first requests are turned away; say why instead of waiting forever.
  const maintenance = useMaintenanceMessage();
  const bootstrapError = useSession((s) => s.bootstrapError);
  const bootstrap = useSession((s) => s.bootstrap);
  const [retrying, setRetrying] = useState(false);

  function retry() {
    setRetrying(true);
    void bootstrap().finally(() => setRetrying(false));
  }
  return (
    <div className="se-booting">
      <span className="se-eyebrow">StreetsEmpire</span>
      {maintenance ? (
        <>
          <p><strong>Down for maintenance.</strong></p>
          <p className="se-muted">{maintenance}</p>
          <button type="button" className="se-btn" onClick={() => window.location.reload()}>Check again</button>
        </>
      ) : bootstrapError ? (
        <>
          <p className="se-muted" role="alert">{bootstrapError}</p>
          <button type="button" className="se-btn" onClick={retry} disabled={retrying}>
            {retrying ? 'Checking the streets...' : 'Try again'}
          </button>
        </>
      ) : <p className="se-muted">Checking the streets...</p>}
    </div>
  );
}

const admin = (page: ReactNode, capability: StaffCapability = 'admin') => (
  <Protected><RequireStaff capability={capability}>{page}</RequireStaff></Protected>
);

/** /game/admin opens the first page the viewer's staff role may use. */
function AdminHome() {
  const { role } = useStaff();
  const first = adminSectionsFor(role)[0]?.pages[0];
  return <Navigate to={first?.to ?? '/game'} replace />;
}

export function App() {
  const phase = useSession((s) => s.phase);
  const bootstrap = useSession((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (phase === 'booting') return <Booting />;

  return (
    <>
    <KonamiCode />
    <Routes>
      <Route path="/" element={<GameEntry />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/account" element={<RequireAccount><AccountSettingsPage /></RequireAccount>} />
      <Route path="/account/forum-link" element={<ForumLinkPage />} />
      <Route path="/join" element={<Protected><JoinPage /></Protected>} />
      {UiGalleryPage ? <Route path="/dev/ui" element={<Suspense fallback={<Booting />}><UiGalleryPage /></Suspense>} /> : null}

      <Route path="/game" element={<GameRouteLayout />}>
        <Route index element={<Protected><DashboardPage /></Protected>} />
        <Route path="combat" element={<Protected><LiveRound><CombatPage /></LiveRound></Protected>} />
        <Route path="scout" element={<Protected><LiveRound><ScoutPage /></LiveRound></Protected>} />
        <Route path="quests" element={<Protected><LiveRound><QuestPage /></LiveRound></Protected>} />
        <Route path="visit/:contactKey" element={<Protected><LiveRound><ContactRoomPage /></LiveRound></Protected>} />
        <Route path="events" element={<Protected><LiveRound><EventsPage /></LiveRound></Protected>} />
        <Route path="xp-progress" element={<Protected><XpProgressPage /></Protected>} />
        <Route path="skills" element={<Protected><SkillsPage /></Protected>} />
        <Route path="surveys" element={<Protected><LiveRound><SurveyRedirect /></LiveRound></Protected>} />
        <Route path="hideout" element={<Protected><LiveRound><HideoutPage /></LiveRound></Protected>} />
        {/* 0.4.0-E: products are traded at Pip's; old links land there. */}
        <Route path="products" element={<Navigate to="/game/stores/pip" replace />} />
        <Route path="produce" element={<Protected><LiveRound><ProducePage /></LiveRound></Protected>} />
        <Route path="street-pass" element={<Protected><LiveRound><StreetPassRoute /></LiveRound></Protected>} />
        <Route path="roll-call" element={<Protected><LiveRound><RoundRollCallPage /></LiveRound></Protected>} />
        {/* The Collection page was retired; cosmetics are equipped from Account. */}
        <Route path="collection" element={<Navigate to="/account" replace />} />
        <Route path="drop" element={<DropPage view="shop" />} />
        <Route path="drop/item/:slug" element={<DropPage view="item" />} />
        <Route path="drop/wallet" element={<RequireAccount><DropPage view="wallet" /></RequireAccount>} />
        <Route path="drop/crowns" element={<RequireAccount><DropPage view="crowns" /></RequireAccount>} />
        <Route path="drop/pass" element={<Protected><LiveRound><DropPage view="pass" /></LiveRound></Protected>} />
        <Route path="supporter" element={<RequireAccount><SupporterPage /></RequireAccount>} />
        <Route path="insights" element={<Protected><EmpireInsightsPage /></Protected>} />
        <Route path="stores" element={<Protected><LiveRound><StoresIndexPage /></LiveRound></Protected>} />
        <Route path="stores/:slug" element={<Protected><LiveRound><StorePage /></LiveRound></Protected>} />
        <Route path="armory" element={<Protected><LiveRound><ArmoryPage /></LiveRound></Protected>} />
        <Route path="supply" element={<Protected><LiveRound><SupplyPage /></LiveRound></Protected>} />
        <Route path="holdings" element={<Protected><LiveRound><HoldingsPage /></LiveRound></Protected>} />
        <Route path="loans" element={<Protected><LiveRound><LoanSharkPage /></LiveRound></Protected>} />
        <Route path="dealers" element={<Protected><LiveRound><DealersPage /></LiveRound></Protected>} />
        <Route path="crew" element={<Protected><LiveRound><CrewRosterPage /></LiveRound></Protected>} />
        <Route path="casino" element={<Protected><LiveRound><CasinoPage /></LiveRound></Protected>} />
        <Route path="casino/:game" element={<Protected><LiveRound><CasinoPage /></LiveRound></Protected>} />

        <Route path="travel" element={<Protected><LiveRound><TravelPage /></LiveRound></Protected>} />
        <Route path="turf" element={<Protected><LiveRound><TurfPage /></LiveRound></Protected>} />
        <Route path="operations" element={<Protected><LiveRound><OperationsPage /></LiveRound></Protected>} />
        <Route path="black-book" element={<Protected><LiveRound><BlackBookPage /></LiveRound></Protected>} />
        <Route path="blocks" element={<Navigate to="/game/turf" replace />} />
        {/* 0.5.0-A had a Cities page; the road map still lives on Travel. */}
        <Route path="cities" element={<Navigate to="/game/travel" replace />} />
        <Route path="rankings" element={<Protected><LiveRound><RankingsPage /></LiveRound></Protected>} />
        <Route path="round-archive" element={roundAftermathPublicEnabled ? <RoundArchivePage /> : <Navigate to="/game/hall-of-fame" replace />} />
        <Route path="rounds/:roundId/aftermath" element={roundAftermathPublicEnabled ? <RoundAftermathPage /> : <Navigate to="/game/hall-of-fame" replace />} />
        <Route path="alliance" element={<Protected><LiveRound><AlliancePage /></LiveRound></Protected>} />
        <Route path="alliances" element={<Protected><LiveRound><Navigate to="/game/alliance#alliance-rankings" replace /></LiveRound></Protected>} />
        <Route path="contacts" element={<Protected><LiveRound><Navigate to="/game/players#contacts" replace /></LiveRound></Protected>} />
        <Route path="console" element={<Protected><LiveRound><ConsolePage /></LiveRound></Protected>} />
        <Route path="players" element={<Protected><LiveRound><PlayersPage /></LiveRound></Protected>} />
        <Route path="alliances/:tag" element={<Protected><LiveRound><AllianceDetailPage /></LiveRound></Protected>} />
        <Route path="hall-of-fame" element={<HallOfFamePage />} />
        <Route path="profile" element={<Protected><ProfilePage /></Protected>} />
        <Route path="forum/:forumUserId" element={<Protected><LiveRound><ProfilePage /></LiveRound></Protected>} />
        <Route path="players/:publicPimpId" element={<Protected><LiveRound><ProfilePage /></LiveRound></Protected>} />
        <Route path="activity" element={<Protected><LiveRound><Navigate to="/game/console?view=activity" replace /></LiveRound></Protected>} />
        <Route path="news" element={<NewsPage />} />
        <Route path="status" element={<Protected><StatusPage /></Protected>} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="report-bug" element={<RequireAccount><ReportBugPage /></RequireAccount>} />
        <Route path="reputation" element={<Protected><LiveRound><Navigate to="/game/quests#contact-standing" replace /></LiveRound></Protected>} />

        <Route path="admin" element={<Protected><AdminHome /></Protected>} />
        <Route path="admin/rounds" element={admin(<AdminPage />)} />
        <Route path="admin/rounds/:roundId" element={admin(<AdminRoundPage />)} />
        <Route path="admin/news" element={admin(<AdminNewsPage />)} />
        <Route path="admin/accounts" element={admin(<AdminAccountsPage />, 'accounts.view')} />
        <Route path="admin/accounts/:accountId" element={admin(<AdminAccountPage />, 'accounts.view')} />
        <Route path="admin/staff" element={admin(<AdminStaffPage />, 'staff.view')} />
        <Route path="admin/supporters" element={admin(<AdminSupportersPage />)} />
        <Route path="admin/drop" element={admin(<AdminDropPage />)} />
        <Route path="admin/players/:roundPlayerId" element={admin(<AdminPlayerPage />)} />
        <Route path="admin/quests" element={admin(<AdminQuestContentPage />)} />
        <Route path="admin/surveys" element={admin(<AdminSurveysPage />)} />
        <Route path="admin/integrations" element={admin(<AdminIntegrationsPage />)} />
        <Route path="admin/rulesets" element={admin(<AdminRulesetsPage />)} />
        <Route path="admin/signals" element={admin(<AdminSignalsPage />)} />
        <Route path="admin/audit" element={admin(<AdminAuditPage />)} />
        <Route path="admin/events" element={admin(<AdminEventsPage />)} />
        <Route path="admin/reports" element={admin(<AdminReportsPage />, 'reports.handle')} />
        <Route path="admin/bugs" element={admin(<AdminBugReportsPage />, 'bugs.triage')} />
        <Route path="admin/economy" element={admin(<AdminEconomyPage />)} />
        <Route path="admin/supply" element={admin(<AdminSupplyPage />)} />
        <Route path="admin/loans" element={admin(<AdminLoansPage />)} />
        <Route path="admin/casino" element={admin(<AdminCasinoPage />)} />
        <Route path="admin/factions" element={admin(<AdminFactionsPage />)} />
        <Route path="admin/crew" element={admin(<AdminCrewPage />)} />
        <Route path="admin/vehicles" element={admin(<AdminVehiclesPage />)} />
        <Route path="admin/players/:roundPlayerId/armory" element={admin(<AdminArmoryPlayerPage />)} />
        <Route path="admin/law" element={admin(<AdminLawPage />)} />
        <Route path="admin/players/:roundPlayerId/law" element={admin(<AdminLawPlayerPage />)} />
        <Route path="admin/combat" element={admin(<AdminCombatPage />)} />
        <Route path="admin/turf" element={admin(<AdminTurfPage />)} />
        <Route path="admin/monitoring" element={admin(<AdminMonitoringPage />)} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </>
  );
}
