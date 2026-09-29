import { Link } from 'react-router-dom';
import { GUIDE_STEPS } from '../../help/catalog.js';
import { useOnboarding } from '../../stores/onboarding.js';

/**
 * 1.0.0-B. Early goals on the dashboard. Instructional, not quests: nothing is
 * rewarded, progress comes from what you actually did, and it can be dismissed.
 */
export function GettingStarted() {
  const guide = useOnboarding((s) => s.state?.guide ?? null);
  const act = useOnboarding((s) => s.act);
  if (!guide || guide.dismissed) return null;
  const done = guide.steps.filter((step) => step.done).length;

  return (
    <section className="se-getting-started" aria-labelledby="se-getting-started-title">
      <div className="se-getting-started__head">
        <div>
          <p className="se-eyebrow">Getting started · {done} of {guide.steps.length}</p>
          <h2 id="se-getting-started-title">{guide.complete ? 'You know the basics' : 'Learn the loop'}</h2>
        </div>
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-guide' })}>
          {guide.complete ? 'Close' : 'Hide'}
        </button>
      </div>
      {guide.complete ? (
        <p>Scouting, recruiting, supplies, production and weapons: covered. Raids, runs, turf and alliances explain themselves when you open them.</p>
      ) : (
        <ol className="se-getting-started__steps">
          {guide.steps.map((step) => {
            const copy = GUIDE_STEPS[step.key];
            return (
              <li key={step.key} className={step.done ? 'is-done' : ''}>
                <span className="se-getting-started__check" aria-hidden="true">{step.done ? '✓' : ''}</span>
                <span>
                  {step.done ? <strong>{copy.title}</strong> : <Link to={copy.to}><strong>{copy.title}</strong></Link>}
                  <small>{step.done ? 'Done' : copy.detail}</small>
                </span>
                <span className="se-sr">{step.done ? 'done' : 'not done yet'}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
