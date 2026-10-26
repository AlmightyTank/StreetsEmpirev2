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
          ? `Step complete. ${next.chapter} continues with ${next.title}.`
          : 'Walkthrough step complete. Your progress is saved.');
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
        <aside className="se-tour-tracker se-tour-tracker--paused" aria-label="Guided walkthrough">
        <div>
          <p className="se-eyebrow">Guided walkthrough paused</p>
          <strong>Pick up where you left off?</strong>
        </div>
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'restore-tour' })}>
          Resume walkthrough
        </button>
      </aside>
    );
  }

  if (!tour.active || !tour.step) return null;
  const copy = TOUR_STEPS[tour.step];
  const done = completedCount;

  return (
    <aside className="se-tour-tracker" aria-label="Guided walkthrough" data-testid="tour-tracker">
      <div className="se-tour-tracker__progress">
        <p className="se-eyebrow">{copy.chapter} · Step {done + 1} of {tour.steps.length}</p>
        <strong>Next step: {copy.title}</strong>
        <span className="se-tour-tracker__mentor">{copy.mentor} says: {copy.detail}</span>
        <span
          className="se-tour-tracker__meter"
          role="progressbar"
          aria-label="Walkthrough progress"
          aria-valuemin={0}
          aria-valuemax={tour.steps.length}
          aria-valuenow={done}
        ><span style={{ width: `${Math.round((done / tour.steps.length) * 100)}%` }} /></span>
        {feedback ? <span className="se-tour-tracker__feedback" role="status" aria-live="polite">{feedback}</span> : null}
      </div>
      <div className="se-tour-tracker__actions">
        <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => navigate(copy.to)}>
          Go to the action
        </button>
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-tour' })}>
          Skip walkthrough
        </button>
      </div>
    </aside>
  );
}
