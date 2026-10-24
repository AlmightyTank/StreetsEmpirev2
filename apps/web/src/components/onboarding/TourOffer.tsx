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
      <section className="se-tour-offer se-tour-offer--recap" aria-labelledby="se-sign-recap-title" data-testid="walkthrough-complete">
        <div>
          <p className="se-eyebrow">Walkthrough complete · Your first permanent upgrade</p>
          <h2 id="se-sign-recap-title">You’re on the map</h2>
          <p>Mama says: “You’ve got a street to call your own. This sign is your crew’s permanent mark—not a turf claim.”</p>
          <StreetSignDisplay design={tour.signRecap} compact />
          <div className="se-tour-offer__handoff">
            <strong>Next system: Turf</strong>
            <span>Rivals are watching. Build enough power to take your first piece of turf.</span>
          </div>
        </div>
        <div className="se-tour__actions">
          <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => navigate('/game/turf')}>See turf</button>
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-sign-recap' })}>Keep going</button>
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
       <p className="se-eyebrow">Guided walkthrough · 9 steps</p>
          <h2 id="se-tour-offer-title">Make your mark, then learn the loop</h2>
           <p>Start with your crew’s street sign, earn your first payout, then learn supplies, crew, production, the hideout and combat. The sign is cosmetic; it does not claim turf.</p>
        </div>
        <div className="se-tour__actions">
          <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => void act({ action: 'start-tour' })}>
            Start walkthrough
          </button>
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-tour' })}>
            Skip walkthrough
          </button>
        </div>
      </section>
    );
  }

  if (!tour.active || tour.dismissed || !tour.step) return null;
  const done = tour.steps.filter((step) => step.done).length;
  const copy = TOUR_STEPS[tour.step];
  const goToAction = () => navigate(copy.to.split('#')[0]!, { state: { tourTarget: copy.target } });
  return (
    <section className="se-tour-offer" aria-labelledby="se-tour-offer-title" data-testid="tour-offer">
      <div>
        <p className="se-eyebrow">{copy.chapter} · Step {done + 1} of {tour.steps.length}</p>
        <h2 id="se-tour-offer-title">Next step: {copy.title}</h2>
        <p className="se-tour-offer__mentor">{copy.mentor} says: {copy.detail}</p>
        <div
          className="se-tour-offer__progress"
          role="progressbar"
          aria-label="Walkthrough progress"
          aria-valuemin={0}
          aria-valuemax={tour.steps.length}
          aria-valuenow={done}
        >
          <span style={{ width: `${Math.round((done / tour.steps.length) * 100)}%` }} />
        </div>
      </div>
        <div className="se-tour__actions">
           <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={goToAction}>
             Go to the action
          </button>
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-tour' })}>
             Skip walkthrough
        </button>
      </div>
    </section>
  );
}
