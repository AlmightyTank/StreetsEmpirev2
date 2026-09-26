import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { INTRO_CARDS } from '../../help/catalog.js';
import { useOnboarding } from '../../stores/onboarding.js';

/**
 * 1.0.0-B. The first-login intro: three cards, only the core loop. Skippable at
 * any step (Escape skips too), replayable from Rules and Account.
 */
export function IntroDialog() {
  const open = useOnboarding((s) => s.introOpen);
  const act = useOnboarding((s) => s.act);
  const close = useOnboarding((s) => s.closeIntro);
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    setIndex(0);
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;
  const card = INTRO_CARDS[index]!;
  const last = index === INTRO_CARDS.length - 1;

  const skip = () => {
    close();
    void act({ action: 'skip-intro' });
  };
  const finish = (to?: string) => {
    close();
    void act({ action: 'complete-intro' });
    if (to) navigate(to);
  };

  return (
    <div className="se-intro-backdrop" onClick={(event) => { if (event.target === event.currentTarget) skip(); }}>
      <div
        ref={dialog}
        className="se-intro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="se-intro-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') skip();
          if (event.key === 'ArrowRight' && !last) setIndex(index + 1);
          if (event.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
        }}
      >
        <p className="se-eyebrow">{card.eyebrow}</p>
        <h2 id="se-intro-title">{card.title}</h2>
        {card.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <div className="se-intro__dots" aria-hidden="true">
          {INTRO_CARDS.map((item, dot) => <span key={item.key} className={dot === index ? 'is-on' : ''} />)}
        </div>
        <div className="se-intro__actions">
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={skip}>Skip intro</button>
          <span className="se-intro__nav">
            {index > 0 ? <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setIndex(index - 1)}>Back</button> : null}
            {last ? (
              <>
                <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => finish()}>Got it</button>
                {card.cta ? <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => finish(card.cta!.to)}>{card.cta.label}</button> : null}
              </>
            ) : (
              <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => setIndex(index + 1)}>Next</button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
