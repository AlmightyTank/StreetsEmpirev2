import { useCallback, useEffect, useState } from 'react';
import type { WorkSupplyDto, WorkSupplyPlanDto, WorkSupplyPolicyDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

function turnsText(turns: number): string {
  const rounded = Math.round(turns * 10) / 10;
  return `${Number.isInteger(rounded) ? formatNumber(rounded) : rounded.toFixed(1)} turn${rounded === 1 ? '' : 's'}`;
}

/** One line per slice: "14 turns Ecstasy → 3 turns Cocaine → 3 turns dry". */
export function supplySummary(plan: WorkSupplyPlanDto): string {
  if (plan.need === 0) return 'Nobody to supply on this trip.';
  return plan.slices.map((slice) => `${turnsText(slice.turns)} ${slice.productName ?? 'dry'}`).join(' → ');
}

/** Receipt lines for a trip's supply, shared by Scout and Produce results. */
export function supplyReceiptLines(plan: WorkSupplyPlanDto | undefined): Array<{ label: string; value: string }> {
  if (!plan || plan.need === 0) return [];
  return [
    { label: 'Supply', value: supplySummary(plan) },
    ...plan.slices.filter((slice) => slice.product && slice.product !== 'CRACK').map((slice) => ({ label: `${slice.productName} used`, value: formatNumber(slice.units) })),
  ];
}

function status(plan: WorkSupplyPlanDto): { tone: 'good' | 'warn' | 'bad'; text: string } {
  const dry = plan.slices.find((slice) => slice.state === 'dry');
  const primaryName = plan.slices.find((slice) => slice.product === plan.policy.primary)?.productName ?? plan.policy.primary;
  if (plan.need === 0) return { tone: 'good', text: 'Nobody working, nothing burned.' };
  if (dry && dry.share >= 1) return { tone: 'bad', text: 'No allowed product on hand: the whole trip runs dry.' };
  if (dry) return { tone: 'bad', text: `Runs dry for the last ${turnsText(dry.turns)}.` };
  if (plan.switchesAtTurn === 0) return { tone: 'warn', text: `No ${primaryName} left: the trip starts on a substitute.` };
  if (plan.switchesAtTurn !== null) return { tone: 'warn', text: `${primaryName} runs low: switches after ${turnsText(plan.switchesAtTurn)}.` };
  return { tone: 'good', text: `Fully supplied with ${primaryName}.` };
}

/**
 * 0.4.0-B. The product policy for one job and what the next trip will burn.
 * The preview runs the same plan as the action, so it matches the receipt as
 * long as stock and crew do not change in between. Hidden on rounds without work supply.
 */
export function WorkSupplyPanel({ job, jobLabel, turns, refreshKey }: { job: string; jobLabel: string; turns: number | ''; refreshKey?: unknown }) {
  const [overview, setOverview] = useState<WorkSupplyDto | null>(null);
  const [draft, setDraft] = useState<WorkSupplyPolicyDto | null>(null);
  const [plan, setPlan] = useState<WorkSupplyPlanDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get<WorkSupplyDto>('/game/work-supply').then(setOverview).catch(() => setOverview(null));
  }, []);
  useEffect(load, [load, refreshKey]);

  const saved = overview?.jobs.find((row) => row.key === job)?.policy ?? null;
  useEffect(() => { setDraft(saved); }, [saved?.primary, saved?.fallback, saved?.emergency, saved?.strict, job]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!overview?.enabled || !job || typeof turns !== 'number' || turns < 1) { setPlan(null); return; }
    const timer = window.setTimeout(() => {
      api.get<WorkSupplyPlanDto>(`/game/work-supply/preview?job=${encodeURIComponent(job)}&turns=${turns}`)
        .then((next) => { setPlan(next); setError(null); })
        .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not preview supply.'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [overview, job, turns, refreshKey]);

  if (!overview?.enabled || !draft) return null;

  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const options = overview.products;
  const stock = (key: string | null) => options.find((product) => product.key === key)?.quantity ?? 0;

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      setOverview(await api.post<WorkSupplyDto>('/game/work-supply/policy', { job, ...draft }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the supply policy.');
    } finally {
      setSaving(false);
    }
  }

  const select = (field: 'primary' | 'fallback' | 'emergency', label: string, allowNone: boolean, disabled = false) => (
    <div className="se-field">
      <label className="se-label" htmlFor={`supply-${job}-${field}`}>{label}</label>
      <select id={`supply-${job}-${field}`} className="se-input" disabled={disabled} value={draft[field] ?? ''}
        onChange={(event) => setDraft({ ...draft, [field]: event.target.value || null, ...(field === 'fallback' && !event.target.value ? { emergency: null } : {}) })}>
        {allowNone ? <option value="">None</option> : null}
        {options.map((product) => <option key={product.key} value={product.key}>{product.name} ({formatNumber(product.quantity)})</option>)}
      </select>
    </div>
  );

  const current = plan && !changed ? status(plan) : null;

  return (
    <Panel title="Product supply" aside={jobLabel}>
      <div className="se-supply__policy">
        {select('primary', 'Primary', false)}
        {select('fallback', 'Fallback', true, draft.strict)}
        {select('emergency', 'Emergency', true, draft.strict || !draft.fallback)}
      </div>
      <label className="se-checkrow se-checkrow--inline">
        <input type="checkbox" checked={draft.strict} onChange={(event) => setDraft({ ...draft, strict: event.target.checked })} />
        <span>Strict supply: only ever burn the primary</span>
      </label>
      {changed ? (
        <Button type="button" className="se-btn se-btn--primary se-btn--sm se-mt" disabledReason={saving ? 'Saving...' : null} onClick={() => void save()}>
          Save supply for {jobLabel}
        </Button>
      ) : null}

      {error ? <p className="se-error">{error}</p> : null}
      {changed ? <p className="se-hint se-mt">Save the policy to preview the trip with it.</p> : null}
      {current && plan ? (
        <div className={`se-supply__status se-supply__status--${current.tone}`}>
          <strong>{current.text}</strong>
          <span>{supplySummary(plan)}</span>
          <span className="se-muted">
            Burns about {formatNumber(Math.round(plan.perTurn * 10) / 10)} a turn · {formatNumber(plan.need)} for this trip
            {plan.policy.primary ? ` · ${formatNumber(stock(plan.policy.primary))} ${options.find((product) => product.key === plan.policy.primary)?.name ?? ''} on hand` : ''}
          </span>
        </div>
      ) : null}
    </Panel>
  );
}
