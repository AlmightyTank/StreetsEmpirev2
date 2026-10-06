import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminExploitFlagDto, AdminExploitFlagsDto, AdminRoundBattlesDto, ExploitFlagResolution } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const kindText: Record<AdminExploitFlagDto['kind'], string> = {
  STATE_GUARD: 'Database guard',
  INVARIANT: 'Broken invariant',
  LINKED_ATTACK: 'Linked-account hit',
  ACTION_REPLAY: 'Replayed request',
  API_ABUSE: 'Rate-limit abuse',
  SIGNUP_ABUSE: 'Sign-up flood',
};

const severityTone: Record<AdminExploitFlagDto['severity'], string> = { info: '', warning: ' se-tag--warn', critical: ' se-tag--bad' };

/** One flag, with a review that needs a note: dismissed (false alarm, known bug) or actioned. */
function FlagRow({ flag, onReviewed }: { flag: AdminExploitFlagDto; onReviewed: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function review(resolution: ExploitFlagResolution) {
    setBusy(true);
    setError(null);
    try {
      await adminApi.reviewFlag(flag.id, resolution, note.trim());
      onReviewed();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not review that flag.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="se-admin-audit__entry">
      <div className="se-admin-audit__head">
        <span className="se-admin-tags">
          <span className={`se-tag${severityTone[flag.severity]}`}>{kindText[flag.kind]}</span>
          {flag.occurrences > 1 ? <span className="se-tag">×{formatNumber(flag.occurrences)}</span> : null}
        </span>
        <span className="se-muted">{adminWhen(flag.lastSeenAt)}</span>
      </div>
      <p>{flag.message}</p>
      <p className="se-hint">
        {flag.account ? <Link to={`/game/admin/accounts/${flag.account.id}`}>{flag.account.username}</Link> : 'Signed out'}
        {flag.route ? ` · ${flag.route}` : ''}
        {flag.review ? ` · ${flag.review.resolution} by ${flag.review.byUsername ?? 'an admin'}${flag.review.note ? `: ${flag.review.note}` : ''}` : ''}
      </p>
      {flag.review ? null : (
        <div className="se-admin-inline">
          <input className="se-input" value={note} placeholder="What you found" aria-label="Review note" maxLength={500} onChange={(event) => setNote(event.target.value)} />
          <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void review('dismissed')} disabledReason={busy ? 'Working...' : note.trim().length < 5 ? 'Write what you found first, at least 5 characters.' : null}>Dismiss</Button>
          <Button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => void review('actioned')} disabledReason={busy ? 'Working...' : note.trim().length < 5 ? 'Write what you did first, at least 5 characters.' : null}>Actioned</Button>
        </div>
      )}
      {error ? <Alert>{error}</Alert> : null}
    </li>
  );
}

/** 1.0.0-E. Exploit flags to review, and every recent fight in a season. */
export function AdminCombatPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [status, setStatus] = useState<'open' | 'reviewed' | 'all'>('open');
  const [flags, setFlags] = useState<AdminExploitFlagsDto | null>(null);
  const [battles, setBattles] = useState<AdminRoundBattlesDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFlags = useCallback(() => {
    adminApi.exploitFlags(status)
      .then(setFlags)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load exploit flags.'));
  }, [status]);

  useEffect(() => { loadFlags(); }, [loadFlags]);
  useEffect(() => {
    if (!roundId) return;
    adminApi.roundBattles(roundId)
      .then(setBattles)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load battles.'));
  }, [roundId]);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Combat and Exploits</h1>
          <p className="se-eyebrow">Admin · exploit flags and battle reports</p>
        </div>
        <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
      </div>
      {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}

      <Panel title="Exploit flags" aside={flags ? `${formatNumber(flags.open)} open · ${formatNumber(flags.openCritical)} critical` : undefined} className="se-mb">
        <p className="se-hint">
          Refusals that look like an exploit or a bug: the database refusing negative stock, a broken invariant, a hit between linked accounts,
          a replayed request, or a flood of rate-limited requests. The same thing from one account on one day folds into one flag.
        </p>
        <div className="se-admin-tabs se-mb">
          {(['open', 'reviewed', 'all'] as const).map((value) => (
            <button key={value} type="button" className={`se-btn se-btn--sm ${value === status ? 'se-btn--primary' : 'se-btn--ghost'}`} onClick={() => setStatus(value)}>{value}</button>
          ))}
        </div>
        {!flags ? <p className="se-muted">Loading flags...</p> : flags.flags.length === 0 ? (
          <p className="se-muted">{status === 'open' ? 'Nothing to review.' : 'No flags here.'}</p>
        ) : (
          <ol className="se-admin-audit">
            {flags.flags.map((flag) => <FlagRow key={flag.id} flag={flag} onReviewed={loadFlags} />)}
          </ol>
        )}
      </Panel>

      <Panel title="Recent fights" aside="Void a broken result from the attacker's player page" flush>
        {!battles ? <p className="se-muted se-admin-pad">Loading battles...</p> : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead><tr><th>Fight</th><th>Kind</th><th>Winner</th><th className="se-table__number">Loot</th><th>When</th></tr></thead>
              <tbody>
                {battles.battles.length === 0 ? (
                  <tr><td colSpan={5} className="se-muted">No fights in this season yet.</td></tr>
                ) : battles.battles.map((row) => (
                  <tr key={row.id}>
                    <td className="se-td--title">
                      <Link to={`/game/admin/players/${row.attacker.id}`}>{row.attacker.displayName}</Link> → <Link to={`/game/admin/players/${row.defender.id}`}>{row.defender.displayName}</Link>
                      {row.voided ? <span className="se-tag" title={row.voided.reason ?? undefined}> Voided by {row.voided.byUsername ?? 'an admin'}</span> : null}
                    </td>
                    <td data-label="Kind">{row.kind.replace('_', ' ').toLowerCase()}</td>
                    <td data-label="Winner">{row.winner === 'ATTACKER' ? 'attacker' : row.winner === 'DEFENDER' ? 'defender' : '-'}</td>
                    <td className="se-table__number se-num" data-label="Loot">{formatCents(row.lootCents)}</td>
                    <td data-label="When">{adminWhen(row.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {battles.tails.length ? (
              <ul className="se-admin-list se-admin-pad">
                {battles.tails.map((row) => <li key={row.id}>{row.attacker} tailed {row.owner}&rsquo;s run · {row.status.toLowerCase()} · {adminWhen(row.startedAt)}{row.voided ? ' · voided' : ''}</li>)}
              </ul>
            ) : null}
          </div>
        )}
      </Panel>
    </GameLayout>
  );
}
