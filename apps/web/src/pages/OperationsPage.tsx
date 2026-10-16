import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CitiesDto, OperationDto, OperationsPageDto, TurfBlockDto } from '@streets/shared';
import { formatCentsExact } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { EmptyState, GamePageHeader, StatusBadge } from '../components/GameUI.js';
import { GameLayout } from '../layouts/GameLayout.js';

const ROLES = ['driver', 'enforcer', 'intel'] as const;
type Role = (typeof ROLES)[number];
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

function roleLabel(role: Role): string {
  if (role === 'driver') return 'Driver';
  if (role === 'enforcer') return 'Enforcer';
  return 'Intel contact';
}

function OperationCard({ operation, busy, act }: {
  operation: OperationDto;
  busy: boolean;
  act: (path: string, body: unknown) => Promise<void>;
}) {
  const [inviteIds, setInviteIds] = useState<Record<Role, string>>({ driver: '', enforcer: '', intel: '' });
  const reported = operation.status === 'REPORTED' && operation.report;

  return (
    <article className="se-operation">
      <header className="se-operation__head">
        <div>
          <span className="se-eyebrow">Corner takeover · {operation.cityName}</span>
          <h3>{DISTRICTS.find((district) => district.value === operation.district)?.label ?? operation.district ?? 'Unknown district'}</h3>
        </div>
        <StatusBadge tone={operation.status === 'READY' ? 'good' : operation.status === 'REPORTED' ? 'accent' : 'neutral'}>{operation.status.replace('_', ' ')}</StatusBadge>
      </header>

      {operation.myInvite ? (
        <div className="se-operation__invite">
          <strong>You were called in as {roleLabel(operation.myInvite.role)}.</strong>
          <span>Answer before {new Date(operation.myInvite.expiresAt ?? '').toLocaleString()}.</span>
          <div className="se-operation__actions">
            <button className="se-btn" type="button" disabled={busy} onClick={() => void act('/game/operation/answer', { operationId: operation.id, accept: true })}>Accept</button>
            <button className="se-btn se-btn--ghost" type="button" disabled={busy} onClick={() => void act('/game/operation/answer', { operationId: operation.id, accept: false })}>Decline</button>
          </div>
        </div>
      ) : null}

      <div className="se-operation__roles">
        {ROLES.map((role) => {
          const seat = operation.roles[role];
          return (
            <section key={role} className={`se-operation__role${seat.status === 'OPEN' ? ' se-operation__role--open' : ''}`}>
              <span className="se-eyebrow">{roleLabel(role)}</span>
              <strong>{seat.displayName ?? 'Open seat'}</strong>
              <small>{seat.status === 'OPEN' ? 'Ready to fill' : seat.status.toLowerCase()}</small>
              {seat.status === 'OPEN' && operation.status === 'CREW_LOCK' ? (
                <div className="se-operation__role-actions">
                  <button className="se-btn se-btn--sm" type="button" disabled={busy} onClick={() => void act('/game/operation/lock', { operationId: operation.id, role })}>Take role</button>
                  {operation.isLeader ? (
                    <form onSubmit={(event) => {
                      event.preventDefault();
                      const targetPublicPimpId = Number(inviteIds[role]);
                      if (!Number.isInteger(targetPublicPimpId) || targetPublicPimpId < 1) return;
                      void act('/game/operation/invite', { operationId: operation.id, role, targetPublicPimpId });
                    }}>
                      <input className="se-input" inputMode="numeric" min="1" type="number" aria-label={`Pimp number for ${roleLabel(role)}`} placeholder="Pimp #" value={inviteIds[role]} onChange={(event) => setInviteIds((current) => ({ ...current, [role]: event.target.value }))} />
                      <button className="se-btn se-btn--ghost se-btn--sm" type="submit" disabled={busy || !inviteIds[role]}>Invite</button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {operation.status === 'READY' && operation.isLeader ? (
        <div className="se-operation__launch">
          <div><strong>The crew is locked.</strong><span>Run it once. The outcome is final.</span></div>
          <button className="se-btn" type="button" disabled={busy} onClick={() => void act('/game/operation/execute', { operationId: operation.id })}>Execute operation</button>
        </div>
      ) : null}

      {reported ? (
        <section className={`se-operation__report se-operation__report--${reported.success ? 'success' : 'failed'}`}>
          <header>
            <div><span className="se-eyebrow">Outcome report</span><h4>{reported.success ? 'The corner is yours' : 'The job went sideways'}</h4></div>
            <strong>{reported.success ? `${formatCentsExact(reported.payoutCents)} each` : 'No payout'}</strong>
          </header>
          <ol>{reported.stages.map((stage, index) => <li key={`${stage.stage}-${index}`} className={stage.wentWrong ? 'se-bad' : ''}><b>{stage.stage}</b><span>{stage.detail}</span></li>)}</ol>
        </section>
      ) : null}
    </article>
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

  const act = useCallback(async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await api.post<OperationDto>(path, body);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const active = useMemo(() => page?.operations.filter((operation) => operation.status !== 'REPORTED') ?? [], [page]);
  const history = useMemo(() => page?.operations.filter((operation) => operation.status === 'REPORTED') ?? [], [page]);

  return (
    <GameLayout>
      <div className="se-operations">
        <GamePageHeader eyebrow="Intel · crew · execution · consequences" title="Operations" description="Case a district, lock three specialists, then run the job. Victories hit the Street Daily; failures stay with the crew." />

        {error ? <Alert>{error}</Alert> : null}

        <Panel title="Plan a corner takeover" aside={`${page?.leaderCooldownHours ?? 24}h leader cooldown`}>
          <form className="se-operation-start" onSubmit={(event) => {
            event.preventDefault();
            if (citySlug) void act('/game/operation/start', { citySlug, district });
          }}>
            <label>City<select className="se-input" value={citySlug} onChange={(event) => setCitySlug(event.target.value)} disabled={busy || loading}>
              {(cities?.cities ?? []).map((city) => <option key={city.slug} value={city.slug}>{city.name}{city.isHome ? ' · home' : ''}</option>)}
            </select></label>
            <label>Target district<select className="se-input" value={district} onChange={(event) => setDistrict(event.target.value as TurfBlockDto['district'])} disabled={busy || loading}>
              {DISTRICTS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select></label>
            <button className="se-btn" type="submit" disabled={busy || loading || !citySlug}>Start operation</button>
          </form>
        </Panel>

        <Panel title="Open operations" aside={loading ? 'Checking the streets…' : `${active.length} active`}>
          {active.length ? <div className="se-operation-list">{active.map((operation) => <OperationCard key={operation.id} operation={operation} busy={busy} act={act} />)}</div> : <EmptyState title="No live operation" description="Pick a city and target above to assemble a crew." />}
        </Panel>

        {history.length ? <Panel title="Outcome reports" aside={`${history.length} recent`}><div className="se-operation-list">{history.map((operation) => <OperationCard key={operation.id} operation={operation} busy={busy} act={act} />)}</div></Panel> : null}
      </div>
    </GameLayout>
  );
}
