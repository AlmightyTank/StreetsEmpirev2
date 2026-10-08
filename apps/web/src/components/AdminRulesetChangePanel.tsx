import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AdminRulesetChangeDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

type Props = { roundId: string; onChanged: () => Promise<void> };

/** Move an unfinished round onto another ruleset, with what could break listed first. */
export function AdminRulesetChangePanel({ roundId, onChanged }: Props) {
  const [change, setChange] = useState<AdminRulesetChangeDto | null>(null);
  const [rulesetId, setRulesetId] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setConfirm(false);
    adminApi.rulesetChange(roundId, rulesetId || undefined)
      .then((result) => {
        if (!cancelled) setChange(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : 'Could not check that ruleset.');
      });
    return () => {
      cancelled = true;
    };
  }, [roundId, rulesetId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { round } = await adminApi.changeRuleset(roundId, { rulesetId, reason: reason.trim(), confirm });
      setNotice(`The round now plays ${round.rulesetVersion}.`);
      setRulesetId('');
      setReason('');
      await onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not change the ruleset.');
    } finally {
      setBusy(false);
    }
  }

  if (!change) return null;
  const target = change.target;
  const warnings = target?.warnings ?? [];
  const current = change.rulesets.find((option) => option.id === change.current.id && option.version === change.current.version);

  return (
    <Panel title="Change ruleset" aside={`${change.current.version}${change.current.available ? '' : ' · missing'}`} className="se-mt">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}
      {!change.editable ? (
        <p className="se-hint">This round has finished, so its ruleset is frozen.</p>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="se-hint">Moves this round onto another ruleset without starting a new one. Older rounds keep theirs.</p>
          <div className="se-field">
            <label className="se-label" htmlFor="admin-round-ruleset">New ruleset</label>
            <select id="admin-round-ruleset" className="se-input" value={rulesetId} onChange={(event) => setRulesetId(event.target.value)}>
              <option value="">Choose a ruleset</option>
              {change.rulesets.filter((option) => option !== current).map((option) => (
                <option key={option.id} value={option.id}>{option.version} · {option.name}</option>
              ))}
            </select>
          </div>
          {target ? (
            <>
              <p className="se-hint">
                {target.changedCount === null
                  ? 'The current ruleset is missing, so the numbers could not be compared.'
                  : `${formatNumber(target.changedCount)} values differ from ${change.current.version}.`}
                {' '}<Link to="/game/admin/rulesets">Compare rulesets</Link>
              </p>
              {warnings.length ? (
                <>
                  <Alert tone="warning">
                    <ul>
                      {warnings.map((warning) => <li key={`${warning.code}:${warning.message}`}>{warning.message}</li>)}
                    </ul>
                  </Alert>
                  <label className="se-checkrow se-checkrow--inline">
                    <input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />
                    <span>
                      <strong>Change it anyway</strong>
                      <small>I have read the warnings above.</small>
                    </span>
                  </label>
                </>
              ) : <p className="se-hint">Nothing this round holds is missing from {target.ruleset.version}.</p>}
            </>
          ) : null}
          <div className="se-field">
            <label className="se-label" htmlFor="admin-round-ruleset-reason">Reason</label>
            <textarea id="admin-round-ruleset-reason" className="se-input se-admin-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            <p className="se-hint">Saved to the audit log with the round before and after. At least 5 characters.</p>
          </div>
          <Button className="se-btn se-btn--primary se-btn--block"
            disabledReason={busy ? 'The last admin action is still going through.'
              : !target ? 'Choose the ruleset to move to.'
                : reason.trim().length < 5 ? 'The audit log needs a reason of at least 5 characters.'
                  : warnings.length && !confirm ? 'Tick the box above to confirm the warnings.'
                    : null}>
            {busy ? 'Changing...' : 'Change ruleset'}
          </Button>
        </form>
      )}
    </Panel>
  );
}
