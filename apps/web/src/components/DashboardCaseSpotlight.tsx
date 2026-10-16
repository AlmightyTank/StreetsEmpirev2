import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CriminalCaseFileDto } from '@streets/shared';
import { caseFilesApi } from '../api/caseFiles.js';
import { CASE_ACTION_LINKS, caseFileHref, caseProgress, nextCaseLead } from '../utils/caseFiles.js';
import { useSession } from '../stores/session.js';

export function DashboardCaseSpotlight() {
  const playerId = useSession((s) => s.me?.id ?? null);
  const rulesetId = useSession((s) => s.round?.rulesetId ?? '');
  const activityHead = useSession((s) => s.recentActivity[0]?.id ?? null);
  const [caseFile, setCaseFile] = useState<CriminalCaseFileDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [count, setCount] = useState(0);
  const storiesEnabled = /^classic-og-v3\.0-[e-z]$/.test(rulesetId);
  useEffect(() => {
    if (!playerId || !storiesEnabled) return;
    let mounted = true;
    const load = () => {
      void caseFilesApi.page(1, 1, 20).then((data) => {
        if (!mounted) return;
        setCaseFile(nextCaseLead(data.active.concat(data.archived.filter((c) => c.status === 'SOLVED'))));
        setCount(data.active.length);
        setLoaded(true);
      }).catch(() => { if (mounted) setLoaded(true); });
    };
    load();
    window.addEventListener('streets:case-files-changed', load);
    window.addEventListener('streets:quests-changed', load);
    return () => {
      mounted = false;
      window.removeEventListener('streets:case-files-changed', load);
      window.removeEventListener('streets:quests-changed', load);
    };
  }, [playerId, storiesEnabled, activityHead]);

  if (!playerId || !storiesEnabled || !loaded) return null;
  const next = caseFile?.nextAction ? CASE_ACTION_LINKS[caseFile.nextAction] : null;
  return (
    <section className="se-dashboard-case" aria-labelledby="dashboard-case-title">
      <div className="se-dashboard-case__heading">
        <div><span className="se-eyebrow">Living Streets</span><h2 id="dashboard-case-title">Criminal Case Files</h2></div>
        <span className="se-dashboard-case__count">{count} open</span>
      </div>
      {caseFile ? <>
        <div className="se-dashboard-case__meta"><span>{caseFile.status === 'SOLVED' ? 'Ready for your decision' : caseFile.status === 'AVAILABLE' ? 'Fresh lead' : 'Under investigation'}</span>
          <span>{caseFile.cluesFound}/{caseFile.cluesRequired} clues</span></div>
        <h3>{caseFile.title}</h3>
        <div className="se-casefile__meter" role="progressbar" aria-label="Case clue progress"
          aria-valuemin={0} aria-valuemax={caseFile.cluesRequired} aria-valuenow={caseFile.cluesFound}>
          <span style={{ width: `${caseProgress(caseFile)}%` }} />
        </div>
        <p>{caseFile.status === 'SOLVED' ? 'All clues verified. Choose how your case ends.' :
          caseFile.status === 'AVAILABLE' ? 'A street story has surfaced. Decide whether to open the file.' :
          next?.detail ?? 'Keep following the evidence.'}</p>
        <div className="se-dashboard-case__actions">
          <Link className="se-btn se-btn--primary se-btn--sm" to={caseFileHref(caseFile.id)}>
            {caseFile.status === 'SOLVED' ? 'Make the call' : caseFile.status === 'AVAILABLE' ? 'Open case' : 'View evidence'}
          </Link>
          {caseFile.status === 'ACTIVE' && next ? <Link to={next.to} className="se-btn se-btn--ghost se-btn--sm">{next.label}</Link> : null}
        </div>
      </> : <>
        <p>Your crew has no active investigations. Confirmed street events can uncover new case files.</p>
        <Link to="/game/black-book?tab=cases" className="se-btn se-btn--ghost se-btn--sm">Check the Black Book</Link>
      </>}
    </section>
  );
}
