import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BlackBookPageDto } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { EmptyState, GamePageHeader, StatusBadge } from '../components/GameUI.js';
import { GameLayout } from '../layouts/GameLayout.js';

const confidenceCopy = {
  rumor: 'One voice on the street',
  likely: 'Independent word lines up',
  confirmed: 'Three sources agree',
} as const;

const sourceLabels = { contact: 'Contact', scout: 'Scout', faction_warning: 'Faction warning' } as const;

export function BlackBookPage() {
  const [page, setPage] = useState<BlackBookPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setPage(await api.get<BlackBookPageDto>('/game/black-book'));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The Black Book could not be opened.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <GameLayout>
      <div className="se-blackbook">
        <GamePageHeader eyebrow="Street intelligence" title="The Black Book" description="Rumors are not facts. Corroborate a lead before you put your crew on the line." />
        {error ? <Alert tone="error">{error}</Alert> : null}
        {!page ? <p className="se-muted">Opening the book…</p> : page.entries.length === 0 ? (
          <EmptyState title="No live leads" description="Recon a rival or work your contacts. Old intelligence burns itself when it expires." action={<Link className="se-btn se-btn--primary" to="/game/combat#intel">Investigate a rival</Link>} />
        ) : (
          <div className="se-blackbook__grid">
            {page.entries.map((entry) => (
              <article className={`se-blackbook-card se-blackbook-card--${entry.confidence}`} key={entry.id}>
                <header>
                  <div>
                    <span className="se-eyebrow">{entry.city.name}{entry.district ? ` · ${entry.district.replaceAll('_', ' ')}` : ''}</span>
                    <h2>{entry.target?.displayName ?? 'Territory warning'}</h2>
                  </div>
                  <StatusBadge tone={entry.confidence === 'confirmed' ? 'good' : entry.confidence === 'likely' ? 'warning' : 'neutral'}>{entry.confidence}</StatusBadge>
                </header>
                <p className="se-blackbook-card__assessment">Defenses look <strong>{entry.strengthBand}</strong>. {confidenceCopy[entry.confidence]}.</p>
                <div className="se-blackbook-card__sources">
                  {entry.sourceKinds.map((source) => <span className="se-tag" key={source}>{sourceLabels[source]}</span>)}
                  <small>{entry.ageMinutes < 1 ? 'just now' : `${entry.ageMinutes}m old`} · burns {new Date(entry.expiresAt).toLocaleString()}</small>
                </div>
                <nav aria-label={`Actions for ${entry.target?.displayName ?? entry.city.name}`}>
                  <Link className="se-btn se-btn--sm" to={entry.actions.investigate}>Investigate</Link>
                  {entry.actions.negotiate ? <Link className="se-btn se-btn--ghost se-btn--sm" to={entry.actions.negotiate}>Negotiate</Link> : null}
                  <Link className="se-btn se-btn--ghost se-btn--sm" to={entry.actions.reinforce}>Reinforce</Link>
                  {entry.actions.strike ? <Link className="se-btn se-btn--danger se-btn--sm" to={entry.actions.strike}>Strike</Link> : null}
                </nav>
              </article>
            ))}
          </div>
        )}
      </div>
    </GameLayout>
  );
}
