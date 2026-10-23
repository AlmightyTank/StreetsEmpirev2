import { useNavigate } from 'react-router-dom';
import type { OnboardingStateDto } from '@streets/shared';
import { TOUR_STEPS } from '../../help/catalog.js';
import { useOnboarding } from '../../stores/onboarding.js';
import { StreetSignDisplay } from '../StreetSignBuilder.js';

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
  if (tour?.signRecap) {
    return (
      <section className="se-tour-offer se-tour-offer--recap" aria-labelledby="se-sign-recap-title" data-testid="street-sign-recap">
        <div>
          <p className="se-eyebrow">Make Your Mark · Mission complete</p>
          <h2 id="se-sign-recap-title">You’re on the map</h2>
          <p>Mama says: “You’ve got a street to call your own. This sign is your crew’s mark—not a turf claim.”</p>
          <StreetSignDisplay design={tour.signRecap} compact />
        </div>
        <div className="se-tour__actions">
          <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => void act({ action: 'dismiss-sign-recap' })}>Keep going</button>
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => navigate('/account', { state: { tourTarget: 'build-street-sign' } })}>Edit sign</button>
        </div>
      </section>
    );
  }
  if (!tour || tour.complete) return null;

  if (tour.due) {
    return (
      <section className="se-tour-offer" aria-labelledby="se-tour-offer-title" data-testid="tour-offer">
        <div>
          <p className="se-eyebrow">Guided tour · 8 steps</p>
          <h2 id="se-tour-offer-title">Make your mark, then learn the loop</h2>
          <p>Start with your crew’s street sign, then learn quests, scouting, supplies, crew, production, the hideout and combat. The sign is cosmetic; it does not claim turf.</p>
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
