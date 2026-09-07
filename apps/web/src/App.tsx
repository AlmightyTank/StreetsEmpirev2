import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage.js';
import { JoinPage } from './pages/JoinPage.js';
import { LandingPage } from './pages/LandingPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { ProducePage } from './pages/ProducePage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ScoutPage } from './pages/ScoutPage.js';
import { useSession } from './stores/session.js';

function RequireAccount({ children }: { children: ReactNode }) {
  const account = useSession((s) => s.account);
  if (!account) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
      <Route
        path="/join"
        element={
          <RequireAccount>
            <JoinPage />
          </RequireAccount>
        }
      />
      <Route
        path="/game"
        element={
          <RequireAccount>
            <DashboardPage />
          </RequireAccount>
        }
      />
      <Route
        path="/game/scout"
        element={
          <RequireAccount>
            <ScoutPage />
          </RequireAccount>
        }
      />
      <Route
        path="/game/produce"
        element={
          <RequireAccount>
            <ProducePage />
          </RequireAccount>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
