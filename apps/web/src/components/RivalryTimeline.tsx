import { useEffect, useState } from 'react';
import type { RivalryHistoryDto } from '@streets/shared';
import { Panel } from './Panel.js';
import { rivalriesApi } from '../api/rivalries.js';
import { formatWhen } from '../utils/time.js';

const statusLabel: Record<RivalryHistoryDto['status'], string> = {
  ACTIVE: 'Active', MUTUAL: 'Mutual', ONE_SIDED: 'One-sided', SUPPRESSED: 'Suppressed',
  CEASEFIRE: 'Ceasefire', TIMEOUT: 'Timed out', DEFEATED: 'Defeated rival', CLOSED: 'Story closed',
};

export function RivalryTimeline({ roundId }: { roundId: string }) {
  const [items, setItems] = useState<RivalryHistoryDto[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(window.localStorage.getItem('streets:rivalry-record-dismissed') === '1');
  }, []);
  useEffect(() => {
    if (!roundId) { setItems([]); return; }
    let active = true;
    setItems(null);
    void rivalriesApi.list(roundId).then((result) => { if (active) setItems(result); }).catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, [roundId]);

  return (
    <Panel title="Rivalry record" className="se-profile-panel se-rivalry-timeline">
      <button type="button" className="se-rivalry-timeline__dismiss" aria-pressed={dismissed} onClick={() => {
        const next = !dismissed;
        setDismissed(next);
        if (next) window.localStorage.setItem('streets:rivalry-record-dismissed', '1');
        else window.localStorage.removeItem('streets:rivalry-record-dismissed');
      }}>{dismissed ? 'Show rivalry record' : 'Hide rivalry record'}</button>
      {dismissed ? <p className="se-muted" role="status">Rivalry record hidden on this device. This only changes presentation.</p> : null}
      {!dismissed && items === null ? <p className="se-muted" role="status">Loading verified rivalry history...</p> : !dismissed && !items?.length ? (
        <p className="se-muted">No verified rivalries yet. Conflict only appears here after a settled, participated action.</p>
      ) : !dismissed ? (
        <div className="se-rivalry-timeline__list">
          {items?.map((item) => <article key={item.relationshipId} className="se-rivalry-timeline__item">
            <div className="se-rivalry-timeline__head">
              <strong>{statusLabel[item.status]}</strong>
              <span className="se-muted">{item.mutuality === 'MUTUAL' ? 'Mutual conflict' : item.mutuality === 'ONE_SIDED' ? 'One-sided record' : 'Verified record'}</span>
            </div>
            <p className="se-rivalry-timeline__score">Score {item.score}</p>
            <ul>
              {item.history.slice(0, 5).map((source) => <li key={source.id}>{source.sourceKind.replace('_', ' ')} · {source.outcome.replace('_', ' ')} · {formatWhen(source.settledAt)}</li>)}
            </ul>
          </article>)}
        </div>
      ) : null}
    </Panel>
  );
}
