import { useCallback, useEffect, useState } from 'react';
import type { WorkSupplyDto, WorkSupplyPlanDto, WorkSupplyPolicyDto, WorkSupplyPreviewDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
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
  // A fight is one moment, not turns: show how much of the squad each product covered.
  if (plan.role === 'fighters') return plan.slices.map((slice) => `${Math.round(slice.share * 100)}% ${slice.productName ?? 'without'}`).join(' · ');
  return plan.slices.map((slice) => `${turnsText(slice.turns)} ${slice.productName ?? 'dry'}`).join(' → ');
}

/** Receipt lines for a trip's supply, shared by Scout and Produce results. */
export function supplyReceiptLines(plan: WorkSupplyPlanDto | undefined, prefix = ''): Array<{ label: string; value: string }> {
  if (!plan || plan.need === 0) return [];
  return [
    { label: `${prefix}Supply`, value: supplySummary(plan) },
    ...plan.slices.filter((slice) => slice.product && slice.product !== 'CRACK').map((slice) => ({ label: `${slice.productName} used`, value: formatNumber(slice.units) })),
    ...(plan.role ? [{ label: 'Supply effects', value: supplyEffects(plan) }] : []),
  ];
}

const times = (value: number) => `×${(Math.round(value * 100) / 100).toFixed(2)}`;

/** 0.4.0-C. What the plan's products do, in one line. Only what differs from plain crack-era work is shown. */
export function supplyEffects(plan: WorkSupplyPlanDto): string {
  const parts = [
    `${plan.role === 'fighters' ? (plan.job === 'DEFENSE' ? 'Defense' : 'Attack') : plan.role === 'thugs' ? 'Output' : 'Take'} ${times(plan.takeMultiplier)}`,
    plan.role === 'fighters' && Math.abs(plan.woundMultiplier - 1) > 0.005 ? `wounds ${times(plan.woundMultiplier)}` : null,
    plan.role === 'hoes' && Math.abs(plan.recruitmentMultiplier - 1) > 0.005 ? `recruits ${times(plan.recruitmentMultiplier)}` : null,
    Math.abs(plan.departureMultiplier - 1) > 0.005 ? `walkouts ${times(plan.departureMultiplier)}` : null,
    plan.morale > 0.5 ? `morale +${Math.round(plan.morale)}` : null,
    plan.heat > 0 ? `+${Math.round(plan.heat)} Heat` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

const WORKERS: Record<WorkSupplyPlanDto['role'], string> = { hoes: 'whores', thugs: 'cooks', fighters: 'thugs' };

/**
 * 0.4.0-E. The warning a supply screen leads with: fully supplied and for how long,
 * running low and when it switches, or short with how many go without and what it costs.
 */
export function supplyStatus(plan: WorkSupplyPreviewDto): { tone: 'good' | 'warn' | 'bad'; text: string; detail: string | null } {
  const dry = plan.slices.find((slice) => slice.state === 'dry');
  const primaryName = plan.slices.find((slice) => slice.product === plan.policy.primary)?.productName ?? plan.policy.primary;
  const fight = plan.role === 'fighters';
  const supplyTurns = plan.status.turnsOfSupply;
  const lasts = supplyTurns === null ? null
    : fight ? `${formatNumber(plan.need > 0 ? Math.floor((supplyTurns * plan.perTurn) / plan.need) : 0)} fights of supply on hand`
      : `${turnsText(Math.floor(supplyTurns))} of supply on hand`;
  if (plan.need === 0) return { tone: 'good', text: 'Nobody working, nothing burned.', detail: null };
  // Cooks and fighters without product work as they always have, so running out is a missed boost, not a loss.
  const dryTone = plan.role === 'hoes' ? 'bad' : 'warn';
  if (dry) {
    const who = `${formatNumber(plan.status.shortWorkers)} ${WORKERS[plan.role]}`;
    const cost = plan.status.estimatedLossCents ? ` · about ${formatCents(plan.status.estimatedLossCents)} less take` : '';
    const text = dry.share >= 1
      ? fight ? 'No allowed product on hand: they fight without.' : plan.role === 'thugs' ? 'No allowed product on hand: the cooks work without.' : 'No allowed product on hand: the whole trip runs dry.'
      : fight ? `Short: ${who} go in without.` : `Short: runs dry for the last ${turnsText(dry.turns)}.`;
    return { tone: dryTone, text, detail: `${who} without product${cost}` };
  }
  if (plan.switchesAtTurn === 0) return { tone: 'warn', text: `No ${primaryName} left: ${fight ? 'the squad' : 'the trip'} starts on a substitute.`, detail: lasts };
  if (plan.switchesAtTurn !== null) return { tone: 'warn', text: `${primaryName} runs low: switches after ${turnsText(plan.switchesAtTurn)}.`, detail: lasts };
  return { tone: 'good', text: `Fully supplied with ${primaryName}.`, detail: lasts };
}

/**
 * 0.4.0-B. The product policy for one job and what the next trip will burn.
 * The preview runs the same plan as the action, so it matches the receipt as
 * long as stock and crew do not change in between. Hidden on rounds without work supply.
 */
export function WorkSupplyPanel({ job, jobLabel, turns, refreshKey, title = 'Product supply' }: { job: string; jobLabel: string; turns: number | ''; refreshKey?: unknown; title?: string }) {
  const [overview, setOverview] = useState<WorkSupplyDto | null>(null);
  const [draft, setDraft] = useState<WorkSupplyPolicyDto | null>(null);
  const [plan, setPlan] = useState<WorkSupplyPreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get<WorkSupplyDto>('/game/work-supply').then(setOverview).catch(() => setOverview(null));
  }, []);
  useEffect(load, [load, refreshKey]);

  const row = overview?.jobs.find((candidate) => candidate.key === job) ?? null;
  const saved = row?.policy ?? null;
  // 0.4.0-E: a fight job burns nothing until its policy is saved.
  const inactive = Boolean(row && !row.active);
  useEffect(() => { setDraft(saved); }, [saved?.primary, saved?.fallback, saved?.emergency, saved?.strict, job]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!overview?.enabled || !job || typeof turns !== 'number' || turns < 1) { setPlan(null); return; }
    const timer = window.setTimeout(() => {
      api.get<WorkSupplyPreviewDto>(`/game/work-supply/preview?job=${encodeURIComponent(job)}&turns=${turns}`)
        .then((next) => { setPlan(next); setError(null); })
        .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not preview supply.'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [overview, job, turns, refreshKey]);

  if (!overview?.enabled || !draft) return null;

  const changed = inactive || JSON.stringify(draft) !== JSON.stringify(saved);
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

  async function clear() {
    setSaving(true);
    setError(null);
    try {
      setOverview(await api.post<WorkSupplyDto>('/game/work-supply/policy/clear', { job }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not clear the supply policy.');
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

  const current = plan && !changed ? supplyStatus(plan) : null;

  return (
    <Panel title={title} aside={jobLabel}>
      {inactive ? <p className="se-hint">Not supplied: nothing goes in with {jobLabel} and nothing is burned. Pick a product and start supplying them.</p> : null}
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
          {inactive ? 'Start supplying' : 'Save supply for'} {jobLabel}
        </Button>
      ) : null}
      {row && !row.isDefault && !changed ? (
        <Button type="button" className="se-btn se-btn--ghost se-btn--sm se-mt" disabledReason={saving ? 'Saving...' : null} onClick={() => void clear()}>
          {row.optIn ? 'Stop supplying' : 'Back to crack only'}
        </Button>
      ) : null}

      {error ? <p className="se-error">{error}</p> : null}
      {changed && !inactive ? <p className="se-hint se-mt">Save the policy to preview the trip with it.</p> : null}
      {current && plan ? (
        <div className={`se-supply__status se-supply__status--${current.tone}`}>
          <strong>{current.text}</strong>
          {current.detail ? <span>{current.detail}</span> : null}
          {plan.role !== 'fighters' ? <span>{supplySummary(plan)}</span> : null}
          <span className="se-muted">
            {plan.role === 'fighters' ? `Burns ${formatNumber(plan.need)} a fight` : `Burns about ${formatNumber(Math.round(plan.perTurn * 10) / 10)} a turn · ${formatNumber(plan.need)} for this trip`}
            {plan.policy.primary ? ` · ${formatNumber(stock(plan.policy.primary))} ${options.find((product) => product.key === plan.policy.primary)?.name ?? ''} on hand` : ''}
          </span>
          {plan.role ? <span className="se-muted">{supplyEffects(plan)}</span> : null}
        </div>
      ) : null}
    </Panel>
  );
}
