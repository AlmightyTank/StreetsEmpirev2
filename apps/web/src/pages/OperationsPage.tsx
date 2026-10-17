import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CitiesDto, OperationCatalogCardDto, OperationDto, OperationsPageDto, TurfBlockDto } from '@streets/shared';
import { formatCentsExact } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { EmptyState, GamePageHeader, StatusBadge } from '../components/GameUI.js';
import { GameLayout } from '../layouts/GameLayout.js';

const DISTRICTS: Array<{ value: TurfBlockDto['district']; label: string }> = [
  { value: 'CASINO', label: 'Casino Strip' },
  { value: 'NIGHTCLUB', label: 'Nightclub District' },
  { value: 'LOW_RENT', label: 'Low Rent' },
  { value: 'URBAN_GHETTO', label: 'Urban Ghetto' },
  { value: 'WINO_SLUMS', label: 'Wino Slums' },
];

function errorMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : 'The operation could not be updated.';
}

function roleLabel(role: string): string {
  if (role === 'driver') return 'Driver';
  if (role === 'enforcer') return 'Enforcer';
  if (role === 'intel') return 'Intel contact';
  if (role === 'runner') return 'Runner';
  if (role === 'escort') return 'Escort';
  if (role === 'defender') return 'Defender';
  return role;
}

function OperationCard({ operation, busy, act }: {
  operation: OperationDto;
  busy: boolean;
  act: (path: string, body: unknown) => Promise<void>;
}) {
  const [inviteIds, setInviteIds] = useState<Record<string, string>>({});
  const reported = operation.status === 'REPORTED' && operation.report;
  const seats = operation.seats.length
    ? operation.seats
    : (['driver', 'enforcer', 'intel'] as const).map((role) => ({ role, ...operation.roles[role] }));

  return (
    <article className="se-operation">
      <header className="se-operation__head">
        <div>
          <span className="se-eyebrow">{operation.label} · {operation.cityName}</span>
          <h3>{DISTRICTS.find((district) => district.value === operation.district)?.label ?? operation.district ?? operation.label}</h3>
        </div>
        <StatusBadge tone={operation.status === 'READY' ? 'good' : operation.status === 'REPORTED' ? 'accent' : 'neutral'}>{operation.status.replace('_', ' ')}</StatusBadge>
      </header>

      {operation.countdownEndsAt && operation.status !== 'REPORTED' ? (
        <p className="se-operation__invite"><span>Clock runs out {new Date(operation.countdownEndsAt).toLocaleString()}.</span></p>
      ) : null}

      {operation.checklist.length ? (
        <div className="se-operation__checklist">
          {operation.checklist.map((item) => <span key={item.key} className={item.done ? 'is-done' : ''}>{item.done ? 'Ready' : 'Need'} {item.label}</span>)}
        </div>
      ) : null}

      {operation.myInvite ? (
        <div className="se-operation__invite">
          <strong>You were called in as {roleLabel(operation.myInvite.role)}.</strong>
          <span>Answer before {operation.myInvite.expiresAt ? new Date(operation.myInvite.expiresAt).toLocaleString() : 'it expires'}.</span>
          <div className="se-operation__actions">
            <button className="se-btn" type="button" disabled={busy} onClick={() => void act('/game/operation/answer', { operationId: operation.id, accept: true })}>Accept</button>
            <button className="se-btn se-btn--ghost" type="button" disabled={busy} onClick={() => void act('/game/operation/answer', { operationId: operation.id, accept: false })}>Decline</button>
          </div>
        </div>
      ) : null}

      <div className="se-operation__roles">
        {seats.map((seat) => (
          <section key={seat.role} className={`se-operation__role${seat.status === 'OPEN' ? ' se-operation__role--open' : ''}`} data-role={seat.role}>
            <span className="se-eyebrow">{roleLabel(seat.role)}</span>
            <strong>{seat.displayName ?? 'Open seat'}</strong>
            <small>{seat.status === 'OPEN' ? 'Ready to fill' : seat.status.toLowerCase()}</small>
            {seat.status === 'OPEN' && operation.status === 'CREW_LOCK' ? (
              <div className="se-operation__role-actions">
                <button className="se-btn se-btn--sm" type="button" disabled={busy} onClick={() => void act('/game/operation/lock', { operationId: operation.id, role: seat.role })}>Take role</button>
                {operation.isLeader ? (
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    const targetPublicPimpId = Number(inviteIds[seat.role]);
                    if (!Number.isInteger(targetPublicPimpId) || targetPublicPimpId < 1) return;
                    void act('/game/operation/invite', { operationId: operation.id, role: seat.role, targetPublicPimpId });
                  }}>
                    <input className="se-input" inputMode="numeric" min="1" type="number" aria-label={`Pimp number for ${roleLabel(seat.role)}`} placeholder="Pimp #" value={inviteIds[seat.role] ?? ''} onChange={(event) => setInviteIds((current) => ({ ...current, [seat.role]: event.target.value }))} />
                    <button className="se-btn se-btn--ghost se-btn--sm" type="submit" disabled={busy || !inviteIds[seat.role]}>Invite</button>
                  </form>
                ) : null}
              </div>
            ) : null}
            {(seat.status === 'LOCKED' || seat.status === 'ACCEPTED') && operation.status !== 'REPORTED' && operation.status !== 'CANCELLED' && operation.status !== 'EXPIRED' ? (
              <button className="se-btn se-btn--ghost se-btn--sm" type="button" disabled={busy} onClick={() => void act('/game/operation/release', { operationId: operation.id, role: seat.role })}>Release</button>
            ) : null}
          </section>
        ))}
      </div>

      {operation.status === 'READY' && operation.isLeader ? (
        <div className="se-operation__launch">
          <div><strong>The crew is locked.</strong><span>Run it once. The outcome is final.</span></div>
          <button className="se-btn" type="button" disabled={busy} onClick={() => void act('/game/operation/execute', { operationId: operation.id })}>Execute operation</button>
        </div>
      ) : null}

      {operation.isLeader && operation.status !== 'REPORTED' && operation.status !== 'CANCELLED' && operation.status !== 'EXPIRED' ? (
        <div className="se-operation__actions">
          <button className="se-btn se-btn--ghost" type="button" disabled={busy} onClick={() => void act('/game/operation/cancel', { operationId: operation.id })}>Cancel operation</button>
        </div>
      ) : null}

      {reported ? (
        <section className={`se-operation__report se-operation__report--${reported.success ? 'success' : 'failed'}`}>
          <header>
            <div>
              <span className="se-eyebrow">Outcome report</span>
              <h4>{operation.bands && reported.band ? operation.bands[reported.band].label : reported.success ? 'The corner is yours' : 'The job went sideways'}</h4>
            </div>
            <strong>{reported.success || reported.band === 'partial' ? `${formatCentsExact(reported.payoutCents)} each` : 'No payout'}</strong>
          </header>
          <ol>{reported.stages.map((stage, index) => <li key={`${stage.stage}-${index}`} className={stage.wentWrong ? 'se-bad' : ''}><b>{stage.stage}</b><span>{stage.detail}</span></li>)}</ol>
        </section>
      ) : null}
    </article>
  );
}

function OfferForm({ offer, citySlug, busy, act }: { offer: OperationCatalogCardDto; citySlug: string; busy: boolean; act: (path: string, body: unknown) => Promise<void> }) {
  const [supplyStockId, setSupplyStockId] = useState('');
  const [runId, setRunId] = useState('');
  const [escort, setEscort] = useState('1');
  const [routeRisk, setRouteRisk] = useState<'LOW' | 'BALANCED' | 'HIGH'>('BALANCED');
  const [threatKind, setThreatKind] = useState<'block-war' | 'turf-push'>('block-war');
  const [threatId, setThreatId] = useState('');
  if (offer.key === 'CORNER_TAKEOVER') return null;
  return (
    <form className="se-operation-offer" onSubmit={(event) => {
      event.preventDefault();
      if (!citySlug) return;
      void act('/game/operation/start', {
        citySlug,
        template: offer.key,
        ...(offer.key === 'STASH_RECOVERY' ? { supplyStockId } : {}),
        ...(offer.key === 'CONVOY_PROTECTION' ? { runId, escort: Number(escort), routeRisk } : {}),
        ...(offer.key === 'BLOCK_DEFENSE' ? { threatKind, threatId } : {}),
      });
    }}>
      <strong>{offer.label}</strong>
      <p>
        {offer.unavailableReason ?? `Stake ${formatCentsExact(offer.startCostCents)}. Deadline ${offer.deadlineHours ?? 0}h.`}
        {offer.bands ? ` Success ${formatCentsExact(offer.bands.success.payoutCents)}, partial ${formatCentsExact(offer.bands.partial.payoutCents)}, failure ${offer.bands.failure.label}.` : ''}
      </p>
      {offer.key === 'STASH_RECOVERY' ? <input className="se-input" aria-label="Stash id" placeholder="Stash id" value={supplyStockId} onChange={(event) => setSupplyStockId(event.target.value)} /> : null}
      {offer.key === 'CONVOY_PROTECTION' ? (
        <>
          <input className="se-input" aria-label="Shipment id" placeholder="Shipment id" value={runId} onChange={(event) => setRunId(event.target.value)} />
          <input className="se-input" aria-label="Escort count" inputMode="numeric" type="number" min="0" value={escort} onChange={(event) => setEscort(event.target.value)} />
          <select className="se-input" aria-label="Route risk" value={routeRisk} onChange={(event) => setRouteRisk(event.target.value as 'LOW' | 'BALANCED' | 'HIGH')}>
            <option value="LOW">Low risk</option>
            <option value="BALANCED">Balanced risk</option>
            <option value="HIGH">High risk</option>
          </select>
        </>
      ) : null}
      {offer.key === 'BLOCK_DEFENSE' ? (
        <>
          <select className="se-input" aria-label="Threat kind" value={threatKind} onChange={(event) => setThreatKind(event.target.value as 'block-war' | 'turf-push')}>
            <option value="block-war">Block war</option>
            <option value="turf-push">Turf push</option>
          </select>
          <input className="se-input" aria-label="Threat id" placeholder="Threat id" value={threatId} onChange={(event) => setThreatId(event.target.value)} />
        </>
      ) : null}
      <button className="se-btn" type="submit" disabled={busy || !offer.available}>Confirm {offer.label}</button>
    </form>
  );
}

export function OperationsPage() {
  const [page, setPage] = useState<OperationsPageDto | null>(null);
  const [cities, setCities] = useState<CitiesDto | null>(null);
  const [citySlug, setCitySlug] = useState('');
  const [district, setDistrict] = useState<TurfBlockDto['district']>('LOW_RENT');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextPage, nextCities] = await Promise.all([
        api.get<OperationsPageDto>('/game/operations'),
        api.get<CitiesDto>('/game/cities'),
      ]);
      setPage(nextPage);
      setCities(nextCities);
      setCitySlug((current) => current || nextCities.homeCity || nextCities.cities[0]?.slug || '');
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remember = useCallback((operation: OperationDto) => {
    setPage((current) => {
      if (!current) return current;
      const exists = current.operations.some((row) => row.id === operation.id);
      return {
        ...current,
        operations: exists
          ? current.operations.map((row) => row.id === operation.id ? operation : row)
          : [operation, ...current.operations],
      };
    });
  }, []);

  const act = useCallback(async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      remember(await api.post<OperationDto>(path, body));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [remember]);

  const active = useMemo(() => page?.operations.filter((operation) => operation.status !== 'REPORTED' && operation.status !== 'CANCELLED' && operation.status !== 'EXPIRED') ?? [], [page]);
  const history = useMemo(() => page?.operations.filter((operation) => operation.status === 'REPORTED' || operation.status === 'CANCELLED' || operation.status === 'EXPIRED') ?? [], [page]);

  return (
    <GameLayout>
      <div className="se-operations">
        <GamePageHeader eyebrow="Intel · crew · execution · consequences" title="Operations" description="Case a district, lock the seats, then run the job. One receipt settles the crew." />

        {error ? <Alert>{error}</Alert> : null}

        <Panel title="Plan a corner takeover" aside={`${page?.leaderCooldownHours ?? 24}h leader cooldown`}>
          <form className="se-operation-start" onSubmit={(event) => {
            event.preventDefault();
            if (citySlug) void act('/game/operation/start', { citySlug, district, template: 'CORNER_TAKEOVER' });
          }}>
            <label>City<select className="se-input" value={citySlug} onChange={(event) => setCitySlug(event.target.value)} disabled={busy || loading}>
              {(cities?.cities ?? []).map((city) => <option key={city.slug} value={city.slug}>{city.name}{city.isHome ? ' · home' : ''}</option>)}
            </select></label>
            <label>Target district<select className="se-input" value={district} onChange={(event) => setDistrict(event.target.value as TurfBlockDto['district'])} disabled={busy || loading}>
              {DISTRICTS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select></label>
            <button className="se-btn" type="submit" disabled={busy || loading || !citySlug}>Start operation</button>
          </form>
          {(page?.catalog ?? []).map((offer) => (
            <OfferForm key={offer.key} offer={offer} citySlug={citySlug} busy={busy || loading} act={act} />
          ))}
        </Panel>

        <Panel title="Open operations" aside={loading ? 'Checking the streets…' : `${active.length} active`}>
          {active.length ? <div className="se-operation-list">{active.map((operation) => <OperationCard key={operation.id} operation={operation} busy={busy} act={act} />)}</div> : <EmptyState title="No live operation" description="Pick a city and target above to assemble a crew." />}
        </Panel>

        {history.length ? <Panel title="Outcome reports" aside={`${history.length} recent`}><div className="se-operation-list">{history.map((operation) => <OperationCard key={operation.id} operation={operation} busy={busy} act={act} />)}</div></Panel> : null}
      </div>
    </GameLayout>
  );
}
