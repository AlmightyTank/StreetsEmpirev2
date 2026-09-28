import { useNavigate } from 'react-router-dom';
import { useSession } from '../../stores/session.js';
import { useOnboarding } from '../../stores/onboarding.js';

/** 1.0.0-B. Replays the intro and every page intro, and brings back the getting-started goals. */
export function ReplayTutorial({ className = 'se-btn se-btn--ghost se-btn--sm' }: { className?: string }) {
  const me = useSession((s) => s.me);
  const act = useOnboarding((s) => s.act);
  const openIntro = useOnboarding((s) => s.openIntro);
  const navigate = useNavigate();
  if (!me) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await act({ action: 'replay' });
        navigate('/game');
        openIntro();
      }}
    >
      Replay the tutorial
    </button>
  );
}
