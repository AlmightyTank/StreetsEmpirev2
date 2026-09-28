import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PAGE_INTROS, pageHelpFor, pageIntroFor } from '../../help/catalog.js';
import { useOnboarding } from '../../stores/onboarding.js';

/**
 * 1.0.0-B. On every major page: a one-time intro card the first time a system's
 * page opens, and a "How this page works" panel that is always there. Neither
 * ever covers the page or blocks an action.
 */
export function PageGuide() {
  const { pathname } = useLocation();
  const state = useOnboarding((s) => s.state);
  const introOpen = useOnboarding((s) => s.introOpen);
  const act = useOnboarding((s) => s.act);
  const [helpFor, setHelpFor] = useState<string | null>(null);
  const help = pageHelpFor(pathname);
  const introKey = pageIntroFor(pathname);
  const showIntro = Boolean(state && introKey && !introOpen && !state.seenPages.includes(introKey));
  const helpOpen = helpFor === pathname;

  if (!help && !showIntro) return null;
  const intro = introKey ? PAGE_INTROS[introKey] : null;

  return (
    <div className="se-pageguide">
      {showIntro && intro ? (
        <aside className="se-pageguide__intro" aria-label="New here">
          <div>
            <p className="se-eyebrow">New here</p>
            <strong>{intro.title}</strong>
            <p>{intro.body}</p>
          </div>
          <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => void act({ action: 'see-page', page: introKey! })}>
            Got it
          </button>
        </aside>
      ) : null}
      {help ? (
        <div className="se-pageguide__help">
          <button
            type="button"
            className="se-pageguide__toggle"
            aria-expanded={helpOpen}
            aria-controls="se-pageguide-panel"
            onClick={() => setHelpFor(helpOpen ? null : pathname)}
          >
            <span aria-hidden="true">?</span> How this page works
          </button>
          {helpOpen ? (
            <section id="se-pageguide-panel" className="se-pageguide__panel" aria-label={`${help.title} help`}>
              <p>{help.what}</p>
              {help.terms.length ? (
                <dl>
                  {help.terms.map(([term, meaning]) => (
                    <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>
                  ))}
                </dl>
              ) : null}
              {help.risks.length ? (
                <>
                  <p className="se-pageguide__risk-title">Watch out</p>
                  <ul>{help.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
                </>
              ) : null}
              <p><Link to={help.rules}>Full rules</Link></p>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
