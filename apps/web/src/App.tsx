import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AccountSettingsPage } from './pages/AccountSettingsPage.js';
import { AdminAccountPage } from './pages/AdminAccountPage.js';
import { AdminAccountsPage } from './pages/AdminAccountsPage.js';
import { AdminAuditPage } from './pages/AdminAuditPage.js';
import { AdminIntegrationsPage } from './pages/AdminIntegrationsPage.js';
import { AdminNewsPage } from './pages/AdminNewsPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { AdminPlayerPage } from './pages/AdminPlayerPage.js';
import { AdminQuestContentPage } from './pages/AdminQuestContentPage.js';
import { AdminRoundPage } from './pages/AdminRoundPage.js';
import { AdminRulesetsPage } from './pages/AdminRulesetsPage.js';
import { AdminSignalsPage } from './pages/AdminSignalsPage.js';
import { ForumLinkPage } from './pages/ForumLinkPage.js';
import { ActivityPage } from './pages/ActivityPage.js';
import { AlliancePage } from './pages/AlliancePage.js';
import { AllianceDetailPage, AlliancesPage } from './pages/AlliancesPage.js';
import { ContactsPage } from './pages/ContactsPage.js';
import { CombatPage } from './pages/CombatPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { HallOfFamePage } from './pages/HallOfFamePage.js';
import { HideoutPage } from './pages/HideoutPage.js';
import { JoinPage } from './pages/JoinPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NewsPage } from './pages/NewsPage.js';
import { ProducePage } from './pages/ProducePage.js';
import { QuestPage } from './pages/QuestPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { PlayersPage } from './pages/PlayersPage.js';
import { RankingsPage } from './pages/RankingsPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ResetPasswordPage } from './pages/ResetPasswordPage.js';
import { ReputationPage } from './pages/ReputationPage.js';
import { RulesPage } from './pages/RulesPage.js';
import { ScoutPage } from './pages/ScoutPage.js';
import { StatusPage } from './pages/StatusPage.js';
import { VerifyEmailPage } from './pages/VerifyEmailPage.js';
import { StorePage, StoresIndexPage } from './pages/StorePage.js';
import { TravelPage } from './pages/TravelPage.js';
import { TurfPage } from './pages/TurfPage.js';
import { GameRouteLayout } from './layouts/GameLayout.js';
import { landingPath, useSession } from './stores/session.js';

function RequireAccount({ children }: { children: ReactNode }) {
  const account = useSession((s) => s.account);
  if (!account) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Protected({ children }: { children: ReactNode }) {
  return <RequireAccount>{children}</RequireAccount>;
}

/** Hides admin pages from players. The server checks isAdmin on every admin route regardless. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const isAdmin = useSession((s) => s.account?.isAdmin ?? false);
  if (!isAdmin) return <Navigate to="/game" replace />;
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
  return (
    <div className="se-booting">
      <span className="se-eyebrow">StreetsEmpire</span>
      <p className="se-muted">Checking the streets...</p>
    </div>
  );
}

const admin = (page: ReactNode) => <Protected><RequireAdmin>{page}</RequireAdmin></Protected>;

export function App() {
  const phase = useSession((s) => s.phase);
  const bootstrap = useSession((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (phase === 'booting') return <Booting />;

  return (
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

      <Route path="/game" element={<GameRouteLayout />}>
        <Route index element={<Protected><DashboardPage /></Protected>} />
        <Route path="combat" element={<Protected><LiveRound><CombatPage /></LiveRound></Protected>} />
        <Route path="scout" element={<Protected><LiveRound><ScoutPage /></LiveRound></Protected>} />
        <Route path="quests" element={<Protected><LiveRound><QuestPage /></LiveRound></Protected>} />
        <Route path="hideout" element={<Protected><LiveRound><HideoutPage /></LiveRound></Protected>} />
        {/* 0.4.0-E: products are traded at Pip's; old links land there. */}
        <Route path="products" element={<Navigate to="/game/stores/pip" replace />} />
        <Route path="produce" element={<Protected><LiveRound><ProducePage /></LiveRound></Protected>} />
        <Route path="stores" element={<Protected><LiveRound><StoresIndexPage /></LiveRound></Protected>} />
        <Route path="stores/:slug" element={<Protected><LiveRound><StorePage /></LiveRound></Protected>} />

        <Route path="travel" element={<Protected><LiveRound><TravelPage /></LiveRound></Protected>} />
        <Route path="turf" element={<Protected><LiveRound><TurfPage /></LiveRound></Protected>} />
        <Route path="blocks" element={<Navigate to="/game/turf" replace />} />
        {/* 0.5.0-A had a Cities page; the road map still lives on Travel. */}
        <Route path="cities" element={<Navigate to="/game/travel" replace />} />
        <Route path="rankings" element={<Protected><LiveRound><RankingsPage /></LiveRound></Protected>} />
        <Route path="alliance" element={<Protected><LiveRound><AlliancePage /></LiveRound></Protected>} />
        <Route path="alliances" element={<Protected><LiveRound><AlliancesPage /></LiveRound></Protected>} />
        <Route path="contacts" element={<Protected><LiveRound><ContactsPage /></LiveRound></Protected>} />
        <Route path="players" element={<Protected><LiveRound><PlayersPage /></LiveRound></Protected>} />
        <Route path="alliances/:tag" element={<Protected><LiveRound><AllianceDetailPage /></LiveRound></Protected>} />
        <Route path="hall-of-fame" element={<HallOfFamePage />} />
        <Route path="profile" element={<Protected><ProfilePage /></Protected>} />
        <Route path="forum/:forumUserId" element={<Protected><LiveRound><ProfilePage /></LiveRound></Protected>} />
        <Route path="players/:publicPimpId" element={<Protected><LiveRound><ProfilePage /></LiveRound></Protected>} />
        <Route path="activity" element={<Protected><LiveRound><ActivityPage /></LiveRound></Protected>} />
        <Route path="news" element={<NewsPage />} />
        <Route path="status" element={<Protected><StatusPage /></Protected>} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="reputation" element={<Protected><LiveRound><ReputationPage /></LiveRound></Protected>} />

        <Route path="admin" element={admin(<AdminPage />)} />
        <Route path="admin/rounds/:roundId" element={admin(<AdminRoundPage />)} />
        <Route path="admin/news" element={admin(<AdminNewsPage />)} />
        <Route path="admin/accounts" element={admin(<AdminAccountsPage />)} />
        <Route path="admin/accounts/:accountId" element={admin(<AdminAccountPage />)} />
        <Route path="admin/players/:roundPlayerId" element={admin(<AdminPlayerPage />)} />
        <Route path="admin/quests" element={admin(<AdminQuestContentPage />)} />
        <Route path="admin/integrations" element={admin(<AdminIntegrationsPage />)} />
        <Route path="admin/rulesets" element={admin(<AdminRulesetsPage />)} />
        <Route path="admin/signals" element={admin(<AdminSignalsPage />)} />
        <Route path="admin/audit" element={admin(<AdminAuditPage />)} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
