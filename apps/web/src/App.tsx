import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ActivityPage } from './pages/ActivityPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { JoinPage } from './pages/JoinPage.js';
import { LandingPage } from './pages/LandingPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NewsPage } from './pages/NewsPage.js';
import { ProducePage } from './pages/ProducePage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { RankingsPage } from './pages/RankingsPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ReputationPage } from './pages/ReputationPage.js';
import { RulesPage } from './pages/RulesPage.js';
import { ScoutPage } from './pages/ScoutPage.js';
import { StatusPage } from './pages/StatusPage.js';
import { StorePage } from './pages/StorePage.js';
import { useSession } from './stores/session.js';

function RequireAccount({ children }: { children: ReactNode }) {
  const account = useSession((s) => s.account);
  if (!account) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Protected({ children }: { children: ReactNode }) {
  return <RequireAccount>{children}</RequireAccount>;
}

function Booting() {
  return (
    <div className="se-booting">
      <span className="se-eyebrow">Street Empire</span>
      <p className="se-muted">Checking the streets...</p>
    </div>
  );
}

export function App() {
  const phase = useSession((s) => s.phase);
  const bootstrap = useSession((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (phase === 'booting') return <Booting />;

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/join" element={<Protected><JoinPage /></Protected>} />

      <Route path="/game" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/game/scout" element={<Protected><ScoutPage /></Protected>} />
      <Route path="/game/produce" element={<Protected><ProducePage /></Protected>} />
      <Route path="/game/stores/:slug" element={<Protected><StorePage /></Protected>} />

      <Route path="/game/rankings" element={<Protected><RankingsPage /></Protected>} />
      <Route path="/game/profile" element={<Protected><ProfilePage /></Protected>} />
      <Route path="/game/players/:publicPimpId" element={<Protected><ProfilePage /></Protected>} />
      <Route path="/game/activity" element={<Protected><ActivityPage /></Protected>} />
      <Route path="/game/news" element={<Protected><NewsPage /></Protected>} />
      <Route path="/game/status" element={<Protected><StatusPage /></Protected>} />
      <Route path="/game/rules" element={<Protected><RulesPage /></Protected>} />
      <Route path="/game/reputation" element={<Protected><ReputationPage /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
