import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdvisorDto, AdvisorFocus, AdvisorSuggestionDto } from '@streets/shared';
import { gameApi } from '../api/game.js';
import { useSession } from '../stores/session.js';

const FOCUSES: Array<{ value: AdvisorFocus; label: string }> = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'money', label: 'Money' },
  { value: 'territory', label: 'Territory' },
  { value: 'crew', label: 'Crew' },
  { value: 'quests', label: 'Quests' },
];

function Card({ suggestion, slot, advisor, onSuppress }: { suggestion: AdvisorSuggestionDto; slot: number; advisor: AdvisorDto; onSuppress: (mode: 'snooze' | 'dismiss') => void }) {
  const evaluate = (event: 'clicked' | 'dismissed', outcome?: string) => void gameApi.evaluateAdvisor({ event, ruleId: suggestion.ruleId, suggestionKey: suggestion.key, slot, focus: advisor.focus, rulesetVersion: '2.3.0' , ...(outcome ? { outcome } : {}) });
  const content = (
    <>
      <span className="se-advisor-card__kind">{suggestion.actionable ? suggestion.kind : 'Information'}</span>
      <strong>{suggestion.title}</strong>
      <span>{suggestion.reason}</span>
    </>
  );
  return (
    <article className={`se-advisor-card se-advisor-card--${suggestion.kind}`}>
      {suggestion.href && suggestion.actionable ? <Link to={suggestion.href} className="se-advisor-card__link" onClick={() => evaluate('clicked')}>{content}</Link> : <div className="se-advisor-card__link">{content}</div>}
      <div className="se-advisor-card__actions">
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => onSuppress('snooze')}>Later</button>
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => { evaluate('dismissed', 'not_useful'); onSuppress('dismiss'); }}>Dismiss</button>
      </div>
    </article>
  );
}

export function AdvisorBriefing({ advisor }: { advisor: AdvisorDto | null }) {
  const refreshSnapshot = useSession((s) => s.refreshSnapshot);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!advisor) return;
    advisor.suggestions.forEach((suggestion, slot) => {
      void gameApi.evaluateAdvisor({ event: 'shown', ruleId: suggestion.ruleId, suggestionKey: suggestion.key, slot, focus: advisor.focus, rulesetVersion: '2.3.0' });
    });
  }, [advisor]);

  if (!advisor || advisor.suggestions.length === 0) return null;

  async function suppress(suggestionKey: string, mode: 'snooze' | 'dismiss') {
    setBusy(true);
    try {
      await gameApi.suppressAdvisor({ suggestionKey, mode });
      await refreshSnapshot({ background: true });
    } finally {
      setBusy(false);
    }
  }

  async function changeFocus(focus: AdvisorFocus) {
    setBusy(true);
    try {
      await gameApi.updateAdvisorFocus(focus);
      await refreshSnapshot({ background: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="se-advisor" aria-labelledby="advisor-heading" aria-live="polite">
      <div className="se-dashboard-sectionhead">
        <div><span className="se-eyebrow">Empire Advisor</span><h2 id="advisor-heading">Your next moves</h2></div>
        <label className="se-advisor__focus">Focus <select value={advisor.focus} disabled={busy} onChange={(event) => void changeFocus(event.target.value as AdvisorFocus)}>{FOCUSES.map((focus) => <option key={focus.value} value={focus.value}>{focus.label}</option>)}</select></label>
      </div>
      <div className="se-advisor__cards">{advisor.suggestions.map((suggestion, slot) => <Card key={suggestion.key} suggestion={suggestion} slot={slot} advisor={advisor} onSuppress={(mode) => void suppress(suggestion.key, mode)} />)}</div>
    </section>
  );
}
