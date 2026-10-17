import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CriminalCaseFileDto } from '@streets/shared';
import { livingStoryCatalogForRuleset, rulesets } from '@streets/rulesets';
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
  const activityHead = useSession((s) => s.recentActivity[0]?.id ?? null);
  const [queue, setQueue] = useState<CaseStorySignal[]>([]);
  const refreshRef = useRef<(notify: boolean) => void>(() => {});
  const ruleset = rulesets[rulesetId];
  const enabled = ruleset !== undefined && Object.keys(livingStoryCatalogForRuleset(ruleset)).length > 0;

  useEffect(() => {
    let mounted = true;
    let initialized = false;
    let fetching = false;
    let pending = false;
    let cache = new Map<string, CriminalCaseFileDto>();

    const check = (notify: boolean) => {
      if (notify) pending = true;
      if (fetching || document.hidden) return;
      const shouldNotify = pending;
      pending = false;
      fetching = true;
      void caseFilesApi.page(1, 1, 30).then(({ active, archived }) => {
        if (!mounted) return;
        if (document.hidden) {
          // Do not consume a story notification while the player cannot see it.
          if (shouldNotify) pending = true;
          return;
        }
        // An action may arrive while a silent read is in flight. Do not
        // absorb its updated state into the baseline before the queued
        // notification can compare it against the last known case snapshot.
        if (initialized && pending && !shouldNotify) return;
        const files = [...active, ...archived];
        if (initialized && shouldNotify) {
          const changes = caseStorySignals(cache, files);
          if (changes.length) setQueue((current) => [...current, ...changes]);
        }
        cache = new Map(files.map((file) => [file.id, file]));
        initialized = true;
      }).catch(() => {
        // Uncertain network errors never generate dialogs. The next activity
        // update or visibility event retries against the authoritative API.
      }).finally(() => {
        fetching = false;
        if (mounted && pending && !document.hidden) check(false);
      });
    };

    setQueue([]);
    refreshRef.current = check;
    if (!playerId || !enabled) return () => { mounted = false; refreshRef.current = () => {}; };
    check(false); // silent baseline on mount/login
    const onCompletedAction = () => check(true);
    const onVisible = () => { if (!document.hidden) check(initialized || pending); };
    window.addEventListener('streets:quests-changed', onCompletedAction);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted = false;
      refreshRef.current = () => {};
      window.removeEventListener('streets:quests-changed', onCompletedAction);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [playerId, enabled]);

  // Asynchronous RUN_RETURNED and settlement activities can land without a
  // foreground action event; the existing dashboard poll refreshes this ID.
  useEffect(() => {
    if (activityHead) refreshRef.current(true);
  }, [activityHead]);

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
