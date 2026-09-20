import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { WorkSupplyDto, WorkSupplyPlanDto, WorkSupplyPolicyDto, WorkSupplyPreviewDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { Button } from './Button.js';
import { Panel, Row } from './Panel.js';

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
export function supplyReceiptLines(plan: WorkSupplyPlanDto | undefined, prefix = ''): Array<{ label: string; value: ReactNode }> {
  if (!plan || plan.need === 0) return [];
  const ranDry = plan.slices.some((slice) => slice.state === 'dry');
  return [
    { label: `${prefix}Supply`, value: supplySummary(plan) },
    ...plan.slices.filter((slice) => slice.product && slice.product !== 'CRACK').map((slice) => ({ label: `${prefix}${slice.productName} used`, value: formatNumber(slice.units) })),
    ...(plan.role ? [{ label: `${prefix}Supply effects`, value: supplyEffects(plan) }] : []),
    ...(ranDry ? [{ label: `${prefix}Restock`, value: <Link className="se-golink" to="/game/stores/pip">Pip&rsquo;s</Link> }] : []),
  ];
}

const times = (value: number) => `×${(Math.round(value * 100) / 100).toFixed(2)}`;

/** 0.4.0-C. What the plan's products do, in one line. Only what differs from plain crack-era work is shown. */
export function supplyEffects(plan: WorkSupplyPlanDto): string {
  const parts = [
    // Only what moves: a neutral ×1.00 says nothing.
    Math.abs(plan.takeMultiplier - 1) > 0.005 ? `${plan.role === 'fighters' ? (plan.job === 'DEFENSE' ? 'Defense' : 'Attack') : plan.role === 'thugs' ? 'Output' : 'Take'} ${times(plan.takeMultiplier)}` : null,
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
export function supplyStatus(plan: WorkSupplyPreviewDto, nameOf: (key: string) => string | undefined = () => undefined): { tone: 'good' | 'warn' | 'bad'; text: string; detail: string | null } {
  const dry = plan.slices.find((slice) => slice.state === 'dry');
  // A primary with no stock has no slice of its own, so its name comes from the catalog.
  const primaryName = plan.slices.find((slice) => slice.product === plan.policy.primary)?.productName ?? nameOf(plan.policy.primary) ?? plan.policy.primary;
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
    const cost = plan.status.estimatedLossCents ? ` · about ${formatCents(plan.status.estimatedLossCents)} less take than a full ${primaryName} trip` : '';
    const text = dry.share >= 1
      ? fight ? 'No allowed product on hand: they fight without.' : plan.role === 'thugs' ? 'No allowed product on hand: the cooks work without.' : 'No allowed product on hand: the whole trip runs dry.'
      : fight ? `Short: ${who} go in without.` : `Short: runs dry for the last ${turnsText(dry.turns)}.`;
    return { tone: dryTone, text, detail: `${who} without product${cost}` };
  }
  if (plan.switchesAtTurn === 0) return { tone: 'warn', text: `No ${primaryName} left: ${fight ? 'the squad' : 'the trip'} starts on a substitute.`, detail: lasts };
  if (plan.switchesAtTurn !== null) return { tone: 'warn', text: `${primaryName} runs low: switches after ${turnsText(plan.switchesAtTurn)}.`, detail: lasts };
  return { tone: 'good', text: `Fully supplied with ${primaryName}.`, detail: lasts };
}

/** "Cocaine → Ecstasy → Crack", or "Cocaine only" when strict. */
function policyLine(policy: WorkSupplyPolicyDto, nameOf: (key: string) => string): string {
  if (policy.strict) return `${nameOf(policy.primary)} only`;
  return [policy.primary, policy.fallback, policy.emergency].filter((key): key is string => Boolean(key)).map(nameOf).join(' → ');
}

type JobRow = WorkSupplyDto['jobs'][number];

const policyProducts = (policy: WorkSupplyPolicyDto) => (
  [policy.primary, policy.fallback, policy.emergency]
    .filter((key): key is string => Boolean(key))
    .filter((key, index, keys) => keys.indexOf(key) === index)
);

function fuelLine(row: JobRow, products: WorkSupplyDto['products']): string {
  if (!row.active) return 'Not supplied';
  const choices = policyProducts(row.policy).map((key) => {
    const product = products.find((entry) => entry.key === key);
    return `${product?.name ?? key} ${formatNumber(product?.quantity ?? 0)}`;
  });
  return `${choices.join(row.policy.strict ? ', ' : ' -> ')}${row.policy.strict ? ' only' : ''}`;
}

/** Stock rows for the drugs the selected jobs are configured to burn. */
export function WorkSupplyStockRows({ jobs, refreshKey }: {
  jobs: Array<{ job: string; label: string }>; refreshKey?: unknown;
}) {
  const [overview, setOverview] = useState<WorkSupplyDto | null>(null);
  const load = useCallback(() => {
    api.get<WorkSupplyDto>('/game/work-supply').then(setOverview).catch(() => setOverview(null));
  }, []);
  useEffect(load, [load, refreshKey]);

  if (!overview?.enabled) return null;
  const rows = jobs.map((entry) => ({ ...entry, row: overview.jobs.find((candidate) => candidate.key === entry.job) })).filter((entry) => entry.row);
  if (!rows.length) return null;

  return (
    <>
      {rows.map(({ job, label, row }) => (
        <Row key={job} label={`${label} fuel`} value={fuelLine(row!, overview.products)} />
      ))}
    </>
  );
}

/**
 * One job's supply, compact: the policy on one line, what the next trip does on
 * another, and the editor only when asked for. The preview runs the same plan as
 * the action, so it matches the receipt as long as stock and crew do not change.
 */
function SupplyRow({ overview, row, jobLabel, turns, refreshKey, onOverview }: {
  overview: WorkSupplyDto; row: JobRow; jobLabel: string; turns: number | ''; refreshKey?: unknown; onOverview: (next: WorkSupplyDto) => void;
}) {
  const job = row.key;
  const { pathname } = useLocation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkSupplyPolicyDto>(row.policy);
  const [plan, setPlan] = useState<WorkSupplyPreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const options = overview.products;
  const nameOf = (key: string) => options.find((product) => product.key === key)?.name ?? key;

  useEffect(() => { setDraft(row.policy); }, [row.policy.primary, row.policy.fallback, row.policy.emergency, row.policy.strict]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!row.active || typeof turns !== 'number' || turns < 1) { setPlan(null); return; }
    const timer = window.setTimeout(() => {
      api.get<WorkSupplyPreviewDto>(`/game/work-supply/preview?job=${encodeURIComponent(job)}&turns=${turns}`)
        .then((next) => { setPlan(next); setError(null); })
        .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not preview supply.'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [row.active, row.policy, job, turns, refreshKey]);

  async function send(path: string, body: object, failure: string) {
    setSaving(true);
    setError(null);
    try {
      onOverview(await api.post<WorkSupplyDto>(path, body));
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : failure);
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
        {/* Names only: counts do not fit a sidebar, and stock shows in the status line. */}
        {options.map((product) => <option key={product.key} value={product.key}>{product.name}</option>)}
      </select>
    </div>
  );

  const current = plan ? supplyStatus(plan, nameOf) : null;
  const busy = saving ? 'Saving...' : null;
  // Where more of the primary comes from, when the status says it is needed.
  const primary = options.find((product) => product.key === row.policy.primary);
  const restock = current && current.tone !== 'good' && primary ? [
    primary.pip ? <Link key="pip" className="se-golink" to="/game/stores/pip">Buy {primary.name} at Pip&rsquo;s</Link> : null,
    primary.cookable && pathname !== '/game/produce' ? <Link key="cook" className="se-golink" to="/game/produce">Cook {primary.name}</Link> : null,
  ].filter(Boolean) : [];

  return (
    <div className="se-supply">
      <div className="se-supply__head">
        <span className="se-supply__job">{jobLabel}</span>
        <span className="se-supply__line">{row.active ? policyLine(row.policy, nameOf) : 'Not supplied'}</span>
        {!editing ? (
          <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setEditing(true)}>
            {row.active ? 'Change' : 'Supply'}
          </Button>
        ) : null}
      </div>

      {current && plan && !editing ? (
        <div className={`se-supply__status se-supply__status--${current.tone}`}>
          <strong>{current.text}</strong>
          <span className="se-muted">
            {[current.detail, plan.role === 'fighters' ? `${formatNumber(plan.need)} a fight` : `${formatNumber(plan.need)} this trip`, supplyEffects(plan)].filter(Boolean).join(' · ')}
          </span>
          {restock.length ? <span className="se-golinks">{restock}</span> : null}
        </div>
      ) : null}
      {!row.active && !editing ? <p className="se-hint">They go in with nothing, and nothing is burned.</p> : null}

      {editing ? (
        <div className="se-supply__editor">
          <div className="se-supply__policy">
            {select('primary', 'Primary', false)}
            {select('fallback', 'Fallback', true, draft.strict)}
            {select('emergency', 'Emergency', true, draft.strict || !draft.fallback)}
          </div>
          <label className="se-checkrow se-checkrow--inline">
            <input type="checkbox" checked={draft.strict} onChange={(event) => setDraft({ ...draft, strict: event.target.checked })} />
            <span>Strict: only ever burn the primary</span>
          </label>
          <div className="se-actions-row">
            <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={busy}
              onClick={() => void send('/game/work-supply/policy', { job, ...draft }, 'Could not save the supply policy.')}>
              Save
            </Button>
            <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={busy} onClick={() => { setDraft(row.policy); setEditing(false); }}>
              Cancel
            </Button>
            {!row.isDefault ? (
              <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={busy}
                onClick={() => void send('/game/work-supply/policy/clear', { job }, 'Could not clear the supply policy.')}>
                {row.optIn ? 'Stop supplying' : 'Back to crack only'}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? <p className="se-error">{error}</p> : null}
    </div>
  );
}

/**
 * 0.4.0-B. Product supply for one or more jobs, in one panel: the Scout district,
 * the Produce shift and its cooks, or a crew's squads and defenders. Hidden on
 * rounds without work supply, and any job the round does not have is left out.
 */
export function WorkSupplyPanel({ jobs, turns, refreshKey, title = 'Product supply' }: {
  jobs: Array<{ job: string; label: string }>; turns: number | ''; refreshKey?: unknown; title?: string;
}) {
  const [overview, setOverview] = useState<WorkSupplyDto | null>(null);
  const load = useCallback(() => {
    api.get<WorkSupplyDto>('/game/work-supply').then(setOverview).catch(() => setOverview(null));
  }, []);
  useEffect(load, [load, refreshKey]);

  if (!overview?.enabled) return null;
  const rows = jobs.map((entry) => ({ ...entry, row: overview.jobs.find((candidate) => candidate.key === entry.job) })).filter((entry) => entry.row);
  if (!rows.length) return null;

  return (
    <Panel title={title}>
      <div className="se-supply__list">
        {rows.map(({ job, label, row }) => (
          <SupplyRow key={job} overview={overview} row={row!} jobLabel={label} turns={turns} refreshKey={refreshKey} onOverview={setOverview} />
        ))}
      </div>
    </Panel>
  );
}
