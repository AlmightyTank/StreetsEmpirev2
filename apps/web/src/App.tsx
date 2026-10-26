import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { StaffCapability } from '@streets/shared';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage.js').then(({ AccountSettingsPage }) => ({ default: AccountSettingsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.js').then(({ NotFoundPage }) => ({ default: NotFoundPage })));
import { KonamiCode } from './components/EasterEggs.js';
const AdminAccountPage = lazy(() => import('./pages/AdminAccountPage.js').then(({ AdminAccountPage }) => ({ default: AdminAccountPage })));
const AdminAccountsPage = lazy(() => import('./pages/AdminAccountsPage.js').then(({ AdminAccountsPage }) => ({ default: AdminAccountsPage })));
const AdminAuditPage = lazy(() => import('./pages/AdminAuditPage.js').then(({ AdminAuditPage }) => ({ default: AdminAuditPage })));
const AdminEventsPage = lazy(() => import('./pages/AdminEventsPage.js').then(({ AdminEventsPage }) => ({ default: AdminEventsPage })));
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage.js').then(({ AdminReportsPage }) => ({ default: AdminReportsPage })));
const AdminBugReportsPage = lazy(() => import('./pages/AdminBugReportsPage.js').then(({ AdminBugReportsPage }) => ({ default: AdminBugReportsPage })));
const AdminEconomyPage = lazy(() => import('./pages/AdminEconomyPage.js').then(({ AdminEconomyPage }) => ({ default: AdminEconomyPage })));
const AdminCasinoPage = lazy(() => import('./pages/AdminCasinoPage.js').then(({ AdminCasinoPage }) => ({ default: AdminCasinoPage })));
const AdminFactionsPage = lazy(() => import('./pages/AdminFactionsPage.js').then(({ AdminFactionsPage }) => ({ default: AdminFactionsPage })));
const AdminCrewPage = lazy(() => import('./pages/AdminCrewPage.js').then(({ AdminCrewPage }) => ({ default: AdminCrewPage })));
const AdminVehiclesPage = lazy(() => import('./pages/AdminVehiclesPage.js').then(({ AdminVehiclesPage }) => ({ default: AdminVehiclesPage })));
const AdminLawPage = lazy(() => import('./pages/AdminLawPage.js').then(({ AdminLawPage }) => ({ default: AdminLawPage })));
const AdminLawPlayerPage = lazy(() => import('./pages/AdminLawPlayerPage.js').then(({ AdminLawPlayerPage }) => ({ default: AdminLawPlayerPage })));
const AdminCombatPage = lazy(() => import('./pages/AdminCombatPage.js').then(({ AdminCombatPage }) => ({ default: AdminCombatPage })));
const AdminTurfPage = lazy(() => import('./pages/AdminTurfPage.js').then(({ AdminTurfPage }) => ({ default: AdminTurfPage })));
const AdminMonitoringPage = lazy(() => import('./pages/AdminMonitoringPage.js').then(({ AdminMonitoringPage }) => ({ default: AdminMonitoringPage })));
const AdminIntegrationsPage = lazy(() => import('./pages/AdminIntegrationsPage.js').then(({ AdminIntegrationsPage }) => ({ default: AdminIntegrationsPage })));
const AdminNewsPage = lazy(() => import('./pages/AdminNewsPage.js').then(({ AdminNewsPage }) => ({ default: AdminNewsPage })));
const AdminPage = lazy(() => import('./pages/AdminPage.js').then(({ AdminPage }) => ({ default: AdminPage })));
const AdminPlayerPage = lazy(() => import('./pages/AdminPlayerPage.js').then(({ AdminPlayerPage }) => ({ default: AdminPlayerPage })));
const AdminQuestContentPage = lazy(() => import('./pages/AdminQuestContentPage.js').then(({ AdminQuestContentPage }) => ({ default: AdminQuestContentPage })));
const AdminRoundPage = lazy(() => import('./pages/AdminRoundPage.js').then(({ AdminRoundPage }) => ({ default: AdminRoundPage })));
const AdminRulesetsPage = lazy(() => import('./pages/AdminRulesetsPage.js').then(({ AdminRulesetsPage }) => ({ default: AdminRulesetsPage })));
const AdminSignalsPage = lazy(() => import('./pages/AdminSignalsPage.js').then(({ AdminSignalsPage }) => ({ default: AdminSignalsPage })));
const AdminSurveysPage = lazy(() => import('./pages/AdminSurveysPage.js').then(({ AdminSurveysPage }) => ({ default: AdminSurveysPage })));
const AdminSupportersPage = lazy(() => import('./pages/AdminSupportersPage.js').then(({ AdminSupportersPage }) => ({ default: AdminSupportersPage })));
const AdminStaffPage = lazy(() => import('./pages/AdminStaffPage.js').then(({ AdminStaffPage }) => ({ default: AdminStaffPage })));
const ForumLinkPage = lazy(() => import('./pages/ForumLinkPage.js').then(({ ForumLinkPage }) => ({ default: ForumLinkPage })));
const AlliancePage = lazy(() => import('./pages/AlliancePage.js').then(({ AlliancePage }) => ({ default: AlliancePage })));
const AllianceDetailPage = lazy(() => import('./pages/AlliancesPage.js').then(({ AllianceDetailPage }) => ({ default: AllianceDetailPage })));
const CombatPage = lazy(() => import('./pages/CombatPage.js').then(({ CombatPage }) => ({ default: CombatPage })));
const StreetPassPage = lazy(() => import('./pages/StreetPassPage.js').then(({ StreetPassPage }) => ({ default: StreetPassPage })));
const RoundRollCallPage = lazy(() => import('./pages/RoundRollCallPage.js').then(({ RoundRollCallPage }) => ({ default: RoundRollCallPage })));
const DropPage = lazy(() => import('./pages/DropPage.js').then(({ DropPage }) => ({ default: DropPage })));
const AdminDropPage = lazy(() => import('./pages/AdminDropPage.js').then(({ AdminDropPage }) => ({ default: AdminDropPage })));
const SupporterPage = lazy(() => import('./pages/SupporterPage.js').then(({ SupporterPage }) => ({ default: SupporterPage })));
const EmpireInsightsPage = lazy(() => import('./pages/EmpireInsightsPage.js').then(({ EmpireInsightsPage }) => ({ default: EmpireInsightsPage })));
const XpProgressPage = lazy(() => import('./pages/XpProgressPage.js').then(({ XpProgressPage }) => ({ default: XpProgressPage })));
const ConsolePage = lazy(() => import('./pages/ConsolePage.js').then(({ ConsolePage }) => ({ default: ConsolePage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage.js').then(({ DashboardPage }) => ({ default: DashboardPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.js').then(({ ForgotPasswordPage }) => ({ default: ForgotPasswordPage })));
const HallOfFamePage = lazy(() => import('./pages/HallOfFamePage.js').then(({ HallOfFamePage }) => ({ default: HallOfFamePage })));
const RoundAftermathPage = lazy(() => import('./pages/RoundAftermathPage.js').then(({ RoundAftermathPage }) => ({ default: RoundAftermathPage })));
const RoundArchivePage = lazy(() => import('./pages/RoundArchivePage.js').then(({ RoundArchivePage }) => ({ default: RoundArchivePage })));
import { roundAftermathPublicEnabled } from './config/features.js';
const HideoutPage = lazy(() => import('./pages/HideoutPage.js').then(({ HideoutPage }) => ({ default: HideoutPage })));
const JoinPage = lazy(() => import('./pages/JoinPage.js').then(({ JoinPage }) => ({ default: JoinPage })));
const LoginPage = lazy(() => import('./pages/LoginPage.js').then(({ LoginPage }) => ({ default: LoginPage })));
const NewsPage = lazy(() => import('./pages/NewsPage.js').then(({ NewsPage }) => ({ default: NewsPage })));
const ProducePage = lazy(() => import('./pages/ProducePage.js').then(({ ProducePage }) => ({ default: ProducePage })));
const QuestPhonePage = lazy(() => import('./pages/QuestPhonePage.js').then(({ QuestPhonePage }) => ({ default: QuestPhonePage })));
const ContactRoomPage = lazy(() => import('./pages/ContactRoomPage.js').then(({ ContactRoomPage }) => ({ default: ContactRoomPage })));
const StoryArchivePage = lazy(() => import('./pages/StoryArchivePage.js').then(({ StoryArchivePage }) => ({ default: StoryArchivePage })));
const EventsPage = lazy(() => import('./pages/EventsPage.js').then(({ EventsPage }) => ({ default: EventsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage.js').then(({ ProfilePage }) => ({ default: ProfilePage })));
const SkillsPage = lazy(() => import('./pages/SkillsPage.js').then(({ SkillsPage }) => ({ default: SkillsPage })));
const PlayersPage = lazy(() => import('./pages/PlayersPage.js').then(({ PlayersPage }) => ({ default: PlayersPage })));
const RankingsPage = lazy(() => import('./pages/RankingsPage.js').then(({ RankingsPage }) => ({ default: RankingsPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage.js').then(({ RegisterPage }) => ({ default: RegisterPage })));
const ReportBugPage = lazy(() => import('./pages/ReportBugPage.js').then(({ ReportBugPage }) => ({ default: ReportBugPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.js').then(({ ResetPasswordPage }) => ({ default: ResetPasswordPage })));
const RulesPage = lazy(() => import('./pages/RulesPage.js').then(({ RulesPage }) => ({ default: RulesPage })));
const ScoutPage = lazy(() => import('./pages/ScoutPage.js').then(({ ScoutPage }) => ({ default: ScoutPage })));
const StatusPage = lazy(() => import('./pages/StatusPage.js').then(({ StatusPage }) => ({ default: StatusPage })));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage.js').then(({ VerifyEmailPage }) => ({ default: VerifyEmailPage })));
const StorePage = lazy(() => import('./pages/StorePage.js').then(({ StorePage }) => ({ default: StorePage })));
const StoresIndexPage = lazy(() => import('./pages/StorePage.js').then(({ StoresIndexPage }) => ({ default: StoresIndexPage })));
const MarketPage = lazy(() => import('./components/PlayerBoard.js').then(({ PlayerBoard }) => ({ default: PlayerBoard })));
const HoldingsPage = lazy(() => import('./pages/HoldingsPage.js').then(({ HoldingsPage }) => ({ default: HoldingsPage })));
const TravelPage = lazy(() => import('./pages/TravelPage.js').then(({ TravelPage }) => ({ default: TravelPage })));
const CasinoPage = lazy(() => import('./pages/CasinoPage.js').then(({ CasinoPage }) => ({ default: CasinoPage })));
const TurfPage = lazy(() => import('./pages/TurfPage.js').then(({ TurfPage }) => ({ default: TurfPage })));
import { GameRouteLayout } from './layouts/GameLayout.js';
import { useMaintenanceMessage } from './components/MaintenanceBanner.js';
import { VerifyEmailGate } from './components/VerifyEmailGate.js';
import { RulesGate } from './components/RulesGate.js';
import { BirthDateGate } from './components/BirthDateGate.js';
import { AdminDiscordGate } from './components/AdminDiscordGate.js';
import { adminSectionsFor } from './layouts/gameNav.js';
import { useStaff } from './utils/staff.js';
import { landingPath, useSession } from './stores/session.js';
import { prefetchRoute } from './utils/routePrefetch.js';

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

  useEffect(() => {
    const prefetch = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      if (event.type === 'pointerover' && event instanceof PointerEvent && event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) return;
      prefetchRoute(link.href);
    };
    document.addEventListener('pointerover', prefetch, { passive: true });
    document.addEventListener('focusin', prefetch, { passive: true });
    document.addEventListener('touchstart', prefetch, { passive: true });
    return () => {
      document.removeEventListener('pointerover', prefetch);
      document.removeEventListener('focusin', prefetch);
      document.removeEventListener('touchstart', prefetch);
    };
  }, []);

  if (phase === 'booting') return <Booting />;

  return (
    <>
    <KonamiCode />
    <Suspense fallback={<Booting />}>
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
        <Route path="quests" element={<Protected><LiveRound><QuestPhonePage /></LiveRound></Protected>} />
        {/* The old quest desk is retired; preserve old bookmarks without restoring it. */}
        <Route path="quests/contracts" element={<Navigate to="/game/quests" replace />} />
        <Route path="story" element={<Protected><LiveRound><StoryArchivePage /></LiveRound></Protected>} />
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
        <Route path="market" element={<Protected><LiveRound><MarketPage /></LiveRound></Protected>} />
        <Route path="stores/board" element={<Navigate to="/game/market" replace />} />
        <Route path="stores/:slug" element={<Protected><LiveRound><StorePage /></LiveRound></Protected>} />
        <Route path="armory" element={<Navigate to="/game/hideout" replace />} />
        <Route path="supply" element={<Navigate to="/game" replace />} />
        <Route path="holdings" element={<Protected><LiveRound><HoldingsPage /></LiveRound></Protected>} />
        <Route path="loans" element={<Navigate to="/game" replace />} />
        <Route path="dealers" element={<Navigate to="/game" replace />} />
        <Route path="crew" element={<Navigate to="/game#crew-health" replace />} />
        <Route path="casino" element={<Protected><LiveRound><CasinoPage /></LiveRound></Protected>} />
        <Route path="casino/:game" element={<Protected><LiveRound><CasinoPage /></LiveRound></Protected>} />

        <Route path="travel" element={<Protected><LiveRound><TravelPage /></LiveRound></Protected>} />
        <Route path="turf" element={<Protected><LiveRound><TurfPage /></LiveRound></Protected>} />
        <Route path="operations" element={<Navigate to="/game" replace />} />
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
        <Route path="admin/casino" element={admin(<AdminCasinoPage />)} />
        <Route path="admin/factions" element={admin(<AdminFactionsPage />)} />
        <Route path="admin/crew" element={admin(<AdminCrewPage />)} />
        <Route path="admin/vehicles" element={admin(<AdminVehiclesPage />)} />
        <Route path="admin/law" element={admin(<AdminLawPage />)} />
        <Route path="admin/players/:roundPlayerId/law" element={admin(<AdminLawPlayerPage />)} />
        <Route path="admin/combat" element={admin(<AdminCombatPage />)} />
        <Route path="admin/turf" element={admin(<AdminTurfPage />)} />
        <Route path="admin/monitoring" element={admin(<AdminMonitoringPage />)} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
    </>
  );
}
