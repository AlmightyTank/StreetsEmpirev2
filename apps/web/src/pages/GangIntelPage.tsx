import { useCallback, useEffect, useState } from 'react';
import type { GangInvestigationDto } from '@streets/shared';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { gangIntelApi } from '../api/gang-intel.js';
import { ApiError } from '../api/client.js';

export function GangIntelPage() {
  const [investigations, setInvestigations] = useState<GangInvestigationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvestigations((await gangIntelApi.page()).investigations);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Gang intel is unavailable right now.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function advance(investigation: GangInvestigationDto) {
    setBusy(investigation.id);
    try {
      const result = await gangIntelApi.advance(investigation.id, crypto.randomUUID());
      setInvestigations((current) => current.map((item) => item.id === investigation.id ? result.result.investigation : item));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The trail went cold.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <GameLayout>
      <Panel title="Gang intel" subtitle="Follow observable leads before you plan a hit.">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {!investigations.length ? <p className="se-muted">No active gang leads. Scout a district to find a trail.</p> : (
          <div className="se-stack">
            {investigations.map((investigation) => (
              <article key={investigation.id} className="se-card">
                <strong>{investigation.gang.crewName}</strong>
                <span className="se-muted">{investigation.gang.bossName} · {investigation.city.name} · {investigation.district}</span>
                <p>{investigation.clue}</p>
                <span className="se-muted">{investigation.status} · {investigation.targetLocation} · confidence {investigation.confidence}/4</span>
                <Button disabled={busy === investigation.id} onClick={() => void advance(investigation)}>
                  {investigation.status === 'CONFIRMED' ? 'Stake out safehouse' : 'Follow lead'}
                </Button>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </GameLayout>
  );
}
