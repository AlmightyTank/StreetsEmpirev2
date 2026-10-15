import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CareerIdentityDto, CareerIdentityKey } from '@streets/shared';
import { GUIDE_STEPS } from '../../help/catalog.js';
import { useOnboarding } from '../../stores/onboarding.js';
import { communityApi } from '../../api/community.js';

const CAREERS: Array<{ key: CareerIdentityKey; title: string; detail: string }> = [
  { key: 'ENFORCER', title: 'Enforcer', detail: 'Combat and turf contracts.' },
  { key: 'SMUGGLER', title: 'Smuggler', detail: 'Travel and supply contracts.' },
  { key: 'FIXER', title: 'Fixer', detail: 'Law and faction contracts.' },
  { key: 'BUSINESS_BOSS', title: 'Business Boss', detail: 'Business and economy contracts.' },
  { key: 'INTELLIGENCE_BROKER', title: 'Intelligence Broker', detail: 'Intel and combat contracts.' },
];

/**
 * 1.0.0-B. Early goals on the dashboard. Instructional, not quests: nothing is
 * rewarded, progress comes from what you actually did, and it can be dismissed.
 */
export function GettingStarted() {
  const guide = useOnboarding((s) => s.state?.guide ?? null);
  const act = useOnboarding((s) => s.act);
  const reload = useOnboarding((s) => s.load);
  const [career, setCareer] = useState<CareerIdentityDto | null>(null);
  const [careerBusy, setCareerBusy] = useState(false);
  const [careerError, setCareerError] = useState<string | null>(null);
  useEffect(() => {
    void communityApi.careerIdentity().then((result) => setCareer(result.career)).catch(() => undefined);
  }, []);
  if (!guide || guide.dismissed) return null;
  const done = guide.steps.filter((step) => step.done).length;

  return (
    <section className="se-getting-started" aria-labelledby="se-getting-started-title">
      <div className="se-getting-started__head">
        <div>
          <p className="se-eyebrow">Getting started · {done} of {guide.steps.length}</p>
          <h2 id="se-getting-started-title">{guide.complete ? 'Your first chapter is written' : 'Write your origin'}</h2>
        </div>
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-guide' })}>
          {guide.complete ? 'Close' : 'Hide'}
        </button>
      </div>
      {guide.complete ? (
        <p>You met a contact, opened a front, made a hard choice and chose the name the city will remember.</p>
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
      {!guide.complete && !guide.steps.find((step) => step.key === 'choose_career')?.done ? (
        <div className="se-origin-careers" id="origin-career">
          <div>
            <strong>Choose your reputation</strong>
            <small>Cosmetic title and contract filter only. Every career uses identical game math.</small>
          </div>
          <div className="se-origin-careers__grid">
            {CAREERS.map((option) => (
              <button
                type="button"
                className={`se-origin-career${career?.key === option.key ? ' is-selected' : ''}`}
                key={option.key}
                disabled={careerBusy}
                onClick={() => {
                  setCareerBusy(true);
                  setCareerError(null);
                  void communityApi.chooseCareer(option.key)
                    .then(async (result) => { setCareer(result.career); await reload(); })
                    .catch((error: unknown) => setCareerError(error instanceof Error ? error.message : 'Career choice failed.'))
                    .finally(() => setCareerBusy(false));
                }}
              >
                <strong>{option.title}</strong>
                <small>{option.detail}</small>
              </button>
            ))}
          </div>
          {careerError ? <p className="se-origin-careers__error">{careerError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
