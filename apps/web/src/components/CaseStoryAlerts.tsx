import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CriminalCaseFileDto } from '@streets/shared';
import { caseFilesApi } from '../api/caseFiles.js';
import { caseFileHref } from '../utils/caseFiles.js';
import { caseStorySignals, type CaseStorySignal } from '../utils/caseStoryAlertsPolicy.js';
import { useSession } from '../stores/session.js';
import { GameDialog } from './GameUI.js';

/**
 * React only to a confirmed action receipt (the same event sent by
 * useGameAction). Initial page hydration is silent: stale cases must not
 * replay popup dialogs after every refresh or login.
 */
export function CaseStoryAlerts() {
  const playerId = useSession((s) => s.me?.id ?? null);
  const rulesetId = useSession((s) => s.round?.rulesetId ?? '');
  const [queue, setQueue] = useState<CaseStorySignal[]>([]);
  const cache = useRef<Map<string, CriminalCaseFileDto>>(new Map());
  const initialized = useRef(false);
  const inFlight = useRef(false);
  const enabled = /^classic-og-v3\.0-[e-z]$/.test(rulesetId);

  useEffect(() => {
    cache.current.clear();
    initialized.current = false;
    setQueue([]);
    if (!playerId || !enabled) return;
    let mounted = true;
    const check = (notify: boolean) => {
      if (inFlight.current || document.hidden) return;
      inFlight.current = true;
      void caseFilesApi.page(1, 1, 30).then((response) => {
        if (!mounted) return;
        const files = [...response.active, ...response.archived];
        if (initialized.current && notify) {
          const changes = caseStorySignals(cache.current, files);
          if (changes.length) setQueue((before) => [...before, ...changes]);
        }
        cache.current = new Map(files.map((file) => [file.id, file]));
        initialized.current = true;
      }).catch(() => { /* A failed read never invents a case popup. */ })
        .finally(() => { inFlight.current = false; });
    };
    check(false);
    const onCompletedAction = () => check(true);
    window.addEventListener('streets:quests-changed', onCompletedAction);
    return () => { mounted = false; window.removeEventListener('streets:quests-changed', onCompletedAction); };
  }, [playerId, enabled]);

  const current = queue[0] ?? null;
  const close = () => setQueue((items) => items.slice(1));
  return (
    <GameDialog open={Boolean(current)}
      title={current?.kind === 'solved' ? 'Investigation solved' :
        current?.kind === 'clue' ? 'New evidence confirmed' : 'A new street story'}
      description={current ? (current.kind === 'solved'
        ? `All evidence for ${current.file.title} is verified. Choose a final conclusion when you're ready.`
        : current.kind === 'clue'
          ? `${current.file.title}: ${current.file.cluesFound} of ${current.file.cluesRequired} clues verified.`
          : `${current.file.title} has appeared in your Black Book. Taking the case is optional.`) : undefined}
      onClose={close}
      actions={<>
        <button className="se-btn se-btn--ghost" type="button" onClick={close}>Later</button>
        {current ? <Link className="se-btn se-btn--primary" to={caseFileHref(current.file.id)} onClick={close}>View Case File</Link> : null}
      </>}
    />
  );
}
