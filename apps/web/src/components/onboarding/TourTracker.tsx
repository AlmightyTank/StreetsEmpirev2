import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TOUR_STEPS } from '../../help/catalog.js';
import { useOnboarding } from '../../stores/onboarding.js';

/**
 * The small, reusable journey dock shown outside the dashboard. It is a
 * navigation aid only: completion still comes from server-recorded activity.
 */
export function TourTracker() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tour = useOnboarding((state) => state.state?.tour ?? null);
  const act = useOnboarding((state) => state.act);
  const completedCount = tour?.steps.filter((step) => step.done).length ?? 0;
  const previousCompletedCount = useRef(completedCount);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (completedCount > previousCompletedCount.current) {
      const next = tour?.step ? TOUR_STEPS[tour.step] : null;
      setFeedback(next
        ? `Mission complete. ${next.chapter} continues with ${next.title}.`
        : 'Mission complete. Your progress is saved.');
      const timeout = window.setTimeout(() => setFeedback(null), 5000);
      previousCompletedCount.current = completedCount;
      return () => window.clearTimeout(timeout);
    }
    previousCompletedCount.current = completedCount;
    return undefined;
  }, [completedCount, tour?.step]);

  // The dashboard has the larger TourOffer card; do not stack both trackers.
  if (!tour || tour.complete || pathname === '/game') return null;

  if (tour.dismissed) {
    return (
      <aside className="se-tour-tracker se-tour-tracker--paused" aria-label="Guided journey">
        <div>
          <p className="se-eyebrow">Guided journey</p>
          <strong>Pick up where you left off?</strong>
        </div>
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'restore-tour' })}>
          Replay tour
        </button>
      </aside>
    );
  }

  if (!tour.active || !tour.step) return null;
  const copy = TOUR_STEPS[tour.step];
  const done = completedCount;

  return (
    <aside className="se-tour-tracker" aria-label="Guided journey" data-testid="tour-tracker">
      <div className="se-tour-tracker__progress">
        <p className="se-eyebrow">{copy.chapter} · Mission {done + 1} of {tour.steps.length}</p>
        <strong>{copy.title}</strong>
        <span>{copy.mentor} says: {copy.detail}</span>
        {feedback ? <span className="se-tour-tracker__feedback" role="status" aria-live="polite">{feedback}</span> : null}
      </div>
      <div className="se-tour-tracker__actions">
        <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => navigate(copy.to)}>
          Guide me
        </button>
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-tour' })}>
          Hide
        </button>
      </div>
    </aside>
  );
}
