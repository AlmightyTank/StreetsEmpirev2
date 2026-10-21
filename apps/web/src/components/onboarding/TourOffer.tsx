import { useNavigate } from 'react-router-dom';
import type { OnboardingStateDto } from '@streets/shared';
import { TOUR_STEPS } from '../../help/catalog.js';
import { useOnboarding } from '../../stores/onboarding.js';

/**
 * Dashboard entry point for the guided walkthrough. Offers the tour to new
 * players, resumes it while active, and stays hidden for veterans and
 * players who dismissed it this season.
 */
export function TourOffer({ tour: tourOverride }: { tour?: OnboardingStateDto['tour'] }) {
  const storeTour = useOnboarding((s) => s.state?.tour ?? null);
  const tour = tourOverride ?? storeTour;
  const act = useOnboarding((s) => s.act);
  const navigate = useNavigate();
  if (!tour || tour.complete) return null;

  if (tour.due) {
    return (
      <section className="se-tour-offer" aria-labelledby="se-tour-offer-title" data-testid="tour-offer">
        <div>
          <p className="se-eyebrow">Guided tour · 7 steps</p>
          <h2 id="se-tour-offer-title">Learn the loop, earn for it</h2>
          <p>Seven short jobs walk you through quests, scouting, stores, crew, production, the hideout and your first raid. Each one pays.</p>
        </div>
      <div className="se-tour__actions">
          <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => void act({ action: 'start-tour' })}>
            Start the tour
          </button>
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-tour' })}>
            Skip
          </button>
        </div>
      </section>
    );
  }

  if (!tour.active || tour.dismissed || !tour.step) return null;
  const done = tour.steps.filter((step) => step.done).length;
  const copy = TOUR_STEPS[tour.step];
  return (
    <section className="se-tour-offer" aria-labelledby="se-tour-offer-title" data-testid="tour-offer">
      <div>
        <p className="se-eyebrow">Guided tour · {done} of {tour.steps.length}</p>
        <h2 id="se-tour-offer-title">Next: {copy.title}</h2>
        <p>{copy.detail}</p>
      </div>
        <div className="se-tour__actions">
          <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => navigate(copy.to)}>
            Guide me
          </button>
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-tour' })}>
          Hide
        </button>
      </div>
    </section>
  );
}
