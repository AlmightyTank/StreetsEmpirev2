import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminPlayerDto, AdminUnlockDto } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { adminWhen } from '../utils/admin.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Field } from './Field.js';
import { Panel } from './Panel.js';

function sourceText(unlock: AdminUnlockDto): string {
  if (!unlock.held) return unlock.grantedBy ? `Opens with “${unlock.grantedBy.title}”` : 'No job grants it';
  return `${unlock.sourceLabel ?? 'System'} · ${adminWhen(unlock.awardedAt)}`;
}

/**
 * Quest Recipe Unlocks E. A player's recipe access and every other permanent unlock in their
 * round, with what granted each, and an audited grant or revoke for support.
 */
export function AdminUnlocksPanel({ player, onUpdated }: {
  player: AdminPlayerDto;
  onUpdated: (updated: AdminPlayerDto, message: string) => void;
}) {
  const catalog = player.unlocks.catalog ?? [];
  const [key, setKey] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!catalog.length) return null;

  const recipes = catalog.filter((unlock) => unlock.recipe).sort((a, b) => (a.recipe!.step ?? 99) - (b.recipe!.step ?? 99));
  const others = catalog.filter((unlock) => !unlock.recipe);
  const selected = catalog.find((unlock) => unlock.key === key) ?? null;
  const reasonReady = reason.trim().length >= 5;
  const block = !player.live
    ? 'This round has finished, so unlocks are frozen.'
    : busy
      ? 'Saving the last change.'
      : !selected
        ? 'Choose an unlock.'
        : !reasonReady
          ? 'Write a support reason of at least 5 characters.'
          : null;

  async function apply() {
    if (!selected || block) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await adminApi.setUnlock(player.roundPlayerId, selected.key, !selected.held, reason.trim());
      setReason('');
      onUpdated(updated, `${selected.name} ${selected.held ? 'revoked' : 'granted'} and recorded in the admin audit log.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That unlock change did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Recipe access & unlocks" aside={<Link to="/game/admin/audit?targetType=player-unlock">Audit log</Link>} className="se-mb">
      {recipes.length ? (
        <div className="se-tablewrap">
          <table className="se-table se-table--cards">
            <thead>
              <tr>
                <th>Step</th>
                <th>Recipe</th>
                <th>Access</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((unlock) => (
                <tr key={unlock.key}>
                  <td data-label="Step">{unlock.recipe!.step ?? '-'}</td>
                  <td data-label="Recipe">{unlock.recipe!.productName}</td>
                  <td data-label="Access" className={unlock.held ? 'se-good' : 'se-warn'}>{unlock.held ? 'Open' : 'Locked'}</td>
                  <td data-label="Source">{sourceText(unlock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="se-hint">This round's ruleset gates no recipes.</p>}

      {others.length ? (
        <p className="se-hint">
          Other unlocks: {others.map((unlock) => `${unlock.name} (${unlock.held ? sourceText(unlock) : 'locked'})`).join(' · ')}
        </p>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}
      <div className="se-grid se-grid--2 se-mt">
        <div>
          <label className="se-label" htmlFor="admin-unlock-key">Grant or revoke an unlock</label>
          <select id="admin-unlock-key" className="se-input" value={key} onChange={(event) => setKey(event.target.value)}>
            <option value="">Choose an unlock</option>
            {catalog.map((unlock) => (
              <option key={unlock.key} value={unlock.key}>
                {unlock.held ? 'Revoke' : 'Grant'}: {unlock.name}{unlock.recipe?.step ? ` (step ${unlock.recipe.step})` : ''}
              </option>
            ))}
          </select>
          <p className="se-hint">
            A grant is recorded as a support grant, not as the job; the job still pays normally if the player finishes it.
          </p>
        </div>
        <Field
          id="admin-unlock-reason"
          label="Support reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="Recorded in the admin audit log with the before and after."
        />
      </div>
      <Button type="button" className="se-btn se-btn--primary" onClick={() => void apply()} disabledReason={block}>
        {selected ? `${selected.held ? 'Revoke' : 'Grant'} ${selected.name}` : 'Apply unlock change'}
      </Button>
    </Panel>
  );
}
