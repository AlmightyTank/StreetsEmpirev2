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
          <p className="se-eyebrow">Opening loop complete · Your next move</p>
          <h2 id="se-sign-recap-title">Your crew is on the map</h2>
          <p>Mama says: “You made your first move and grew the crew. Your progress is saved—build the operation at your own pace.”</p>
          <StreetSignDisplay design={tour.signRecap} compact />
          <div className="se-tour-offer__handoff">
            <strong>Next up: Build your operation</strong>
            <span>Pick up useful supplies, then explore production when you’re ready.</span>
          </div>
        </div>
        <div className="se-tour__actions">
          <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => navigate('/game/stores/corner')}>Visit the store</button>
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
          <p className="se-eyebrow">Guided walkthrough · 4 steps</p>
          <h2 id="se-tour-offer-title">Make your first move</h2>
          <p>Set your crew’s identity, scout once, see what the work paid, then grow your crew. You can skip the guide; your progress saves if you leave.</p>
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
        <p className="se-hint">Your place is saved. Come back when you’re ready, including after turns refill.</p>
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
