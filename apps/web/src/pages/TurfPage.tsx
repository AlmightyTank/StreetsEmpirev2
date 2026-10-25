import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { CitiesDto, CityCharacterDto, RankingsDto, TravelDto, TurfBlockDto } from '@streets/shared';
import { formatCentsExact, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { api, ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { Panel } from '../components/Panel.js';
import { OutpostStopPanel } from '../components/RunPanels.js';
import { TurfActions } from '../components/TurfActions.js';
import { BusinessCollect, BusinessLots } from '../components/BusinessLots.js';
import { BlockWarPanel } from '../components/BlockWarPanel.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatClockTime, formatWhen } from '../utils/time.js';
import { CityDistrictMap, type CityDistrictMapEntry } from '../components/CityDistrictMap.js';
import { EmpireAreaLegend, EmpireInspector, EmpireManagementLayout, EmpireRosterCard } from '../components/EmpireManagement.js';

const ORDER: Record<TurfBlockDto['district'], number> = {
  CASINO: 0,
  NIGHTCLUB: 1,
  LOW_RENT: 2,
  URBAN_GHETTO: 3,
  WINO_SLUMS: 4,
};

function durationFrom(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function turfTime(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m`;
  const hours = seconds / 3600;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function describeCityMemoryEvent(event: { kind: string; summary: unknown }): string {
  const summary = (event.summary ?? {}) as Record<string, unknown>;
  if (event.kind === 'takeover') return 'an alliance seized city control';
  if (event.kind === 'war_win') {
    const reason = typeof summary.reason === 'string' ? summary.reason.toLowerCase() : 'settled';
    const district = typeof summary.district === 'string' ? ` in ${summary.district}` : '';
    return `a block war ${reason}${district}`;
  }
  if (event.kind === 'business_flip') return 'a business changed hands';
  if (event.kind === 'crackdown') return 'a federal crackdown swept the streets';
  if (event.kind === 'operation_complete') return 'a criminal operation went down';
  return 'the streets shifted';
}

function pulse(city: CityCharacterDto) {
  const blocks = city.turf?.blocks ?? [];
  const held = blocks.filter((block) => block.holder);
  const vacant = blocks.filter((block) => !block.holder && block.localsReclaimAt);
  const locals = blocks.filter((block) => !block.holder && !block.localsReclaimAt);
  const ages = held.flatMap((block) => block.heldSince ? [Date.now() - new Date(block.heldSince).getTime()] : []);
  return {
    held: held.length,
    mine: held.filter((block) => block.isMine).length,
    locals: locals.length,
    vacant: vacant.length,
    postedThugs: held.reduce((sum, block) => sum + block.cornerThugs, 0),
    guns: held.reduce((sum, block) => sum + block.cornerGuns.total, 0),
    visiblePushes: blocks.filter((block) => block.push).length,
    averageHold: ages.length ? ages.reduce((sum, value) => sum + value, 0) / ages.length : 0,
  };
}

function CityBlocksMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'warn' | 'accent';
}) {
  return (
    <div className={`se-cityblocks-metric${tone ? ` se-cityblocks-metric--${tone}` : ''}`}>
      <span className="se-cityblocks-metric__label">{label}</span>
      <strong className="se-cityblocks-metric__value">{value}</strong>
      {detail ? <span className="se-cityblocks-metric__detail">{detail}</span> : null}
    </div>
  );
}

function holder(block: TurfBlockDto) {
  if (!block.holder) {
    return block.localsReclaimAt
      ? <span className="se-muted">Vacant · locals rebuilding</span>
      : <span className="se-muted">Locals</span>;
  }
  return (
    <span className="se-turfboard__owner">
      <AllianceTag alliance={block.holder.alliance} />
      <Link to={`/game/players/${block.holder.publicPimpId}`} className="se-playerlink">{block.holder.displayName}</Link>
      {block.isMine ? <span className="se-you">YOU</span> : null}
    </span>
  );
}

function CityBlockBoard({ city, onChanged, onSelect, selectedDistrict }: { city: CityCharacterDto; onChanged: () => void; onSelect: (district: TurfBlockDto['district']) => void; selectedDistrict: TurfBlockDto['district'] | null }) {
  const turf = city.turf;
  if (!turf) return <p className="se-muted">Turf is not enabled in this round.</p>;
  const blocks = [...turf.blocks].sort((a, b) => ORDER[a.district] - ORDER[b.district]);
  const block = blocks.find((entry) => entry.district === selectedDistrict) ?? blocks[0] ?? null;
  if (!block) return <p className="se-muted">No districts are available in this city.</p>;
  const status = block.isMine ? 'mine' : block.holder ? 'held' : block.localsReclaimAt ? 'vacant' : 'locals';

  return (
    <>
      {turf.business && city.isHome && blocks.some((block) => block.isMine) ? <BusinessCollect business={turf.business} onChanged={onChanged} /> : null}
      <EmpireManagementLayout
        listLabel={`${city.name} districts`}
        list={blocks.map((entry) => {
          const entryStatus = entry.isMine ? 'Your crew' : entry.holder ? 'Player-held' : entry.localsReclaimAt ? 'Rebuilding' : 'Locals';
          const entryTone = entry.isMine ? 'accent' : entry.push || entry.war ? 'warn' : 'muted';
          return <EmpireRosterCard key={entry.district} eyebrow="District" title={entry.districtName} detail={entry.holder?.displayName ?? (entry.localsReclaimAt ? 'Vacant · locals rebuilding' : 'Local control')} status={entry.push || entry.war ? 'Conflict' : entryStatus} statusTone={entryTone} meta={[entry.holder ? `${formatNumber(entry.cornerThugs)} posted` : `${formatNumber(entry.localsThugs)} locals`, `${Math.floor(entry.presenceTurns)} presence`]} selected={entry.district === block.district} onSelect={() => onSelect(entry.district)} selectLabel={`Manage ${entry.districtName} turf`} />;
        })}
        inspector={
          <EmpireInspector eyebrow={`District · ${city.name}`} title={block.districtName} status={block.push || block.war ? 'Active conflict' : block.isMine ? 'Your crew' : block.holder ? 'Player-held' : block.localsReclaimAt ? 'Rebuilding' : 'Local control'} statusTone={block.push || block.war ? 'warn' : block.isMine ? 'accent' : 'muted'} label={`${block.districtName} turf actions`}>
            <article id={`turf-block-${block.district}`} className={`se-turfboard__block se-turfboard__block--${status} se-turfboard__block--selected`}>
              <div className="se-turfboard__head">
                <div>
                  <div className="se-turfboard__holder">{holder(block)}</div>
                </div>
                <span className="se-turfboard__age" title={block.heldSince ? `Held since ${formatWhen(block.heldSince)}` : undefined}>
                  {block.holder ? `held ${durationFrom(block.heldSince)}` : block.localsReclaimAt ? 'open' : 'locals'}
                </span>
              </div>

              {block.districtAccess?.unlocked === false ? (
                <p className="se-hint se-bad">{block.districtAccess.unlockName} required. {block.districtAccess.unlockQuest ? <Link to={'/game/quests?focus=' + encodeURIComponent(block.districtAccess.unlockQuest.key)}>Complete {block.districtAccess.unlockQuest.title} to open this district.</Link> : block.districtAccess.unlockDescription}</p>
              ) : null}
              <div className="se-turfboard__stats">
                {block.holder ? (
                  <>
                    <span><b className="se-num">{formatNumber(block.cornerThugs)}</b><small>posted</small></span>
                    <span><b className="se-num">{formatNumber(block.cornerGuns.total)}</b><small>guns</small></span>
                  </>
                ) : (
                  <>
                    <span><b className="se-num">{formatNumber(block.localsThugs)}</b><small>locals</small></span>
                    <span><b className="se-num">{formatNumber(block.localsFullThugs)}</b><small>full strength</small></span>
                  </>
                )}
                <span><b className="se-num">{Math.floor(block.presenceTurns)}</b><small>your presence</small></span>
              </div>
              {block.fatigue && block.fatigue.percent > 0 ? (
                <span className="se-hint se-turfboard__fatigue" title="War fatigue: businesses here earn this much less until it heals.">
                  Fatigue {block.fatigue.percent}% · output {100 - block.fatigue.percent}%
                  {block.fatigue.recoveryHours > 0 ? ` · healed in ~${block.fatigue.recoveryHours}h` : block.war ? ' · rising while the war is on' : ''}
                  {block.fatigue.scarred ? ' · scarred, heals slowly' : ''}
                </span>
              ) : null}
              {block.dormant ? (
                <span className="se-hint">
                  Dormant under the locals since {formatWhen(block.dormant.since)}
                  {block.dormant.levelsLostAt ? ` · next level lost ${formatWhen(block.dormant.levelsLostAt)}` : ''}
                </span>
              ) : null}

              {block.businesses && block.districtAccess?.unlocked !== false ? <BusinessLots block={block} business={turf.business} onChanged={onChanged} /> : null}
              {turf.business?.wars && block.districtAccess?.unlocked !== false ? <BlockWarPanel block={block} wars={turf.business.wars} isHome={city.isHome} onChanged={onChanged} /> : null}

              {block.districtAccess?.unlocked !== false ? (
                <Link className="se-turfboard__scout-link" to={`/game/scout?district=${encodeURIComponent(block.district)}`}>
                  {city.isHome ? 'Scout this district' : 'Scout this district type at home'} <span aria-hidden="true">↗</span>
                </Link>
              ) : null}

              {block.outpost ? <span className="se-turfboard__outpost">Your outpost</span> : null}
              {block.revengeAvailable && block.revengeUntil ? (
                <span className="se-hint se-good">
                  Revenge active until {formatClockTime(block.revengeUntil)} · no presence required.
                </span>
              ) : null}
              {block.districtAccess?.unlocked !== false ? <TurfActions
                block={block}
                isHome={city.isHome}
                holdingEnabled={turf.holdingEnabled}
                // 1.1.0-D: a player's block is taken by a block war, declared above.
                warsEnabled={turf.warsEnabled && !turf.business?.wars}
                onChanged={onChanged}
              /> : null}
            </article>
          </EmpireInspector>
        }
      />
    </>
  );
}

function CityTurfMap({
  city,
  onSelect,
  selectedDistrict,
}: {
  city: CityCharacterDto;
  onSelect: (district: TurfBlockDto['district']) => void;
  selectedDistrict: TurfBlockDto['district'] | null;
}) {
  const blocks = [...(city.turf?.blocks ?? [])].sort((a, b) => ORDER[a.district] - ORDER[b.district]);
  const mapDistricts = blocks.map((block): CityDistrictMapEntry => {
    const locked = block.districtAccess?.unlocked === false;
    const activePush = Boolean(block.push || block.war);
    const status = locked ? 'locked' : activePush ? 'pressure' : block.isMine ? 'mine' : block.holder ? 'held' : block.localsReclaimAt ? 'vacant' : 'locals';
    const owner = locked
      ? `Unlock with ${block.districtAccess?.unlockName ?? 'a quest'}`
      : block.holder
        ? `${block.holder.alliance ? `[${block.holder.alliance.tag}] ` : ''}${block.holder.displayName}`
        : block.localsReclaimAt ? 'Vacant · locals rebuilding' : 'Locals hold this block';
    return {
      district: block.district,
      name: block.districtName,
      status,
      statusText: locked ? 'Locked' : activePush ? 'Conflict' : block.isMine ? 'Your crew' : block.holder ? 'Player-held' : block.localsReclaimAt ? 'Rebuilding' : 'Local control',
      detail: owner,
      tag: !locked && !block.isMine ? block.holder?.alliance?.tag ?? null : null,
      lots: locked ? undefined : block.businesses?.map((lot) => lot.level > 0),
    };
  });

  return (
    <details className="se-cityblocks-mapdetails" open>
      <summary>
        <span><span className="se-eyebrow">City overview · {city.name}</span><strong>District map</strong></span>
        <span>{selectedDistrict ? `Focused: ${blocks.find((block) => block.district === selectedDistrict)?.districtName ?? 'district'}` : 'Five districts · select to focus'}</span>
      </summary>
      <div className="se-citymap-layout">
        <CityDistrictMap citySlug={city.slug} cityName={city.name} districts={mapDistricts} selectedDistrict={selectedDistrict} onSelect={(district) => onSelect(district as TurfBlockDto['district'])} />

        <aside className="se-citymap-brief" aria-label="District map key">
          <EmpireAreaLegend label="Turf map legend" items={[
            { key: 'mine', label: 'Your crew', tone: 'mine' }, { key: 'held', label: 'Other crew', tone: 'held' },
            { key: 'locals', label: 'Locals', tone: 'locals' }, { key: 'vacant', label: 'Rebuilding', tone: 'vacant' },
            { key: 'pressure', label: 'Active conflict', tone: 'pressure' }, { key: 'locked', label: 'Locked', tone: 'locked' },
          ]} />
          {selectedDistrict ? (
            <Link className="se-citymap-brief__action" to={`/game/turf?city=${encodeURIComponent(city.slug)}&district=${encodeURIComponent(selectedDistrict)}#turf-block-${encodeURIComponent(selectedDistrict)}`}>
              Jump to district actions <span aria-hidden="true">↓</span>
            </Link>
          ) : null}
          <p>Select a district to open its controls.</p>
        </aside>
      </div>
    </details>
  );
}

function turfName(player: { displayName: string; allianceTag: string | null }): string {
  return player.allianceTag ? `[${player.allianceTag}] ${player.displayName}` : player.displayName;
}

function TurfReports({ city }: { city: CityCharacterDto }) {
  const reports = city.turf?.reports ?? [];
  if (!reports.length) return <p className="se-muted">No recent Turf fights in this city.</p>;
  return (
    <ul className="se-turfblocks">
      {reports.slice(0, 5).map((report) => {
        const opponent = report.role === 'attacker' ? report.defender : report.attacker;
        const result = report.stale
          ? 'Corner changed before the push landed'
          : report.role === 'attacker'
            ? report.captured ? 'You took the block' : 'The corner held'
            : report.captured ? 'The block was lost' : 'Your side held';
        return (
          <li key={report.id} className="se-turfblocks__block">
            <span><strong>{report.districtName}</strong><span className="se-muted"> · {result}</span></span>
            <span className="se-hint">
              vs {turfName(opponent)} · {formatNumber(report.attackers)} attackers · {formatNumber(report.defenders.corner + report.defenders.ownerBackup + report.defenders.allyShowed)} defenders
            </span>
            <span className="se-hint">
              Wounds: {formatNumber(report.yourWounds)} yours / {formatNumber(report.opponentWounds)} theirs
              {report.role === 'ally' ? report.showedUp ? ' · your backup showed' : ' · your backup did not arrive' : ''}
            </span>
            {report.revengeUntil && new Date(report.revengeUntil).getTime() > Date.now() ? (
              <span className="se-hint">
                Revenge open until {formatClockTime(report.revengeUntil)}. It waives presence, not the hold shield.
              </span>
            ) : null}
            {report.outpostLoot ? (
              <span className="se-hint">
                Outpost loot: {formatCentsExact(report.outpostLoot.cashCents)}
                {report.outpostLoot.beer ? ` · ${formatNumber(report.outpostLoot.beer)} beer` : ''}
                {Object.entries(report.outpostLoot.products).map(([key, quantity]) => ` · ${formatNumber(quantity)} ${key.toLowerCase()}`).join('')}
              </span>
            ) : null}
            {report.territoryCacheRaidReceipt ? (
              <span className="se-hint">
                Territory cache exposed to the incoming alliance ({report.territoryCacheRaidReceipt.retainedBasisPoints / 100}% retained): {formatCentsExact(report.territoryCacheRaidReceipt.cashCents + report.territoryCacheRaidReceipt.tollCents)} cash/tolls
                {Object.entries(report.territoryCacheRaidReceipt.goods).map(([key, quantity]) => ` · ${formatNumber(quantity)} ${key.toLowerCase()}`).join('')}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TurfPage() {
  const me = useSession((s) => s.me);
  const [cities, setCities] = useState<CitiesDto | null>(null);
  const [rankings, setRankings] = useState<RankingsDto | null>(null);
  const [travel, setTravel] = useState<TravelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  const load = useCallback(() => {
    Promise.all([
      api.get<CitiesDto>('/game/cities'),
      communityApi.rankings(),
      api.get<TravelDto>('/game/travel'),
    ]).then(([cityData, rankingData, travelData]) => {
      setCities(cityData);
      setRankings(rankingData);
      setTravel(travelData);
      setError(null);
    }).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load turf.');
    });
  }, []);

  useEffect(load, [load, me?.id]);

  const turfCities = useMemo(() => cities?.cities.filter((city) => city.turf) ?? [], [cities]);
  const selected = turfCities.find((city) => city.slug === params.get('city'))
    ?? turfCities.find((city) => city.isHome)
    ?? turfCities[0]
    ?? null;
  const requestedDistrict = params.get('district');
  const selectedDistrict = selected?.turf?.blocks.some((block) => block.district === requestedDistrict)
    ? requestedDistrict as TurfBlockDto['district']
    : selected?.turf?.blocks[0]?.district ?? null;
  const selectedPulse = selected ? pulse(selected) : null;
  const activeRuns = travel?.runs ?? (travel?.run ? [travel.run] : []);
  const nextRunDeadline = activeRuns.reduce<string | null>((next, run) => {
    if (!next) return run.position.until;
    return new Date(run.position.until).getTime() < new Date(next).getTime() ? run.position.until : next;
  }, null);
  useCountdown(nextRunDeadline, load);

  const runsHere = selected
    ? activeRuns.filter((run) => run.position.phase === 'town' && run.position.city === selected.slug)
    : [];

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-cityblocks">
        <header className="se-cityblocks-hero">
          <div className="se-cityblocks-hero__copy">
            <span className="se-eyebrow">Turf · {selected?.name ?? me.city.name}</span>
            <h1>City Control</h1>
            <p>Read who owns the street, where pressure is building, and where your crew can claim, reinforce, defend, or push next.</p>
          </div>

          <div className="se-cityblocks-hero__side">
            {selected ? (
              <Link className="se-btn se-btn--ghost se-btn--sm" to={`/game/travel?city=${encodeURIComponent(selected.slug)}`}>
                Travel / roads
              </Link>
            ) : null}
          </div>
          {selected && selectedPulse ? (
            <div className="se-cityblocks-hero__metrics" aria-label={`${selected.name} turf status`}>
              <CityBlocksMetric label="Player-held" value={`${formatNumber(selectedPulse.held)} / 5`} detail="blocks with player crews" />
              <CityBlocksMetric label="Your blocks" value={formatNumber(selectedPulse.mine)} detail="currently under your control" tone={selectedPulse.mine > 0 ? 'accent' : undefined} />
              <CityBlocksMetric label="Open ground" value={formatNumber(selectedPulse.locals + selectedPulse.vacant)} detail="outside player control" tone={selectedPulse.locals + selectedPulse.vacant > 0 ? 'good' : undefined} />
              <CityBlocksMetric label="Active fronts" value={formatNumber(selectedPulse.visiblePushes)} detail={selectedPulse.visiblePushes ? 'districts under pressure' : 'no visible conflict'} tone={selectedPulse.visiblePushes > 0 ? 'warn' : 'good'} />
            </div>
          ) : null}
        </header>

        {error ? <Alert>{error}</Alert> : null}
        {!cities && !error ? <div className="se-cityblocks-loading" role="status">Checking turf...</div> : null}

        {cities && !turfCities.length ? (
          <Panel title="No Turf this round" className="se-cityblocks-panel">
            <p className="se-dim">Turf comes alive on Turf rulesets. This round does not have holdable districts.</p>
          </Panel>
        ) : null}

        {turfCities.length ? (
          <>
            <section className="se-cityblocks-cities" aria-label="Choose a city">
              <div className="se-turfcitystrip" role="tablist" aria-label="Cities">
                {turfCities.map((city) => {
                  const stats = pulse(city);
                  const active = city.slug === selected?.slug;
                  return (
                    <button
                      key={city.slug}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`se-turfcitystrip__city${active ? ' se-turfcitystrip__city--on' : ''}`}
                      onClick={() => {
                        setParams({ city: city.slug }, { replace: true, preventScrollReset: true });
                      }}
                    >
                      <strong>{city.name}</strong>
                      <span>{city.turf?.control ? `[${city.turf.control.alliance.tag}] controls` : 'No city controller'}</span>
                      <span className="se-num">{stats.held}/5 player-held · {stats.mine} yours</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {selected && selectedPulse ? (
              <>
                {selected.turf?.latestEvent ? (
                  <p className="se-cityblocks-event" role="status">
                    <span className="se-eyebrow">Street report</span>
                    Last shook the city: {describeCityMemoryEvent(selected.turf.latestEvent)} · {new Date(selected.turf.latestEvent.happenedAt).toLocaleString()}
                  </p>
                ) : null}

                <div className="se-cityblocks-command">
                <CityTurfMap
                  city={selected}
                  selectedDistrict={selectedDistrict}
                  onSelect={(district) => {
                    const next = new URLSearchParams(params);
                    next.set('city', selected.slug);
                    next.set('district', district);
                    setParams(next, { replace: true, preventScrollReset: true });
                  }}
                />

                <section className="se-cityblocks-section">
                  <div className="se-cityblocks-sectionhead">
                    <div>
                      <span className="se-eyebrow">District operations</span>
                      <h2>Choose a district</h2>
                    </div>
                    <span className="se-cityblocks-sectionhead__meta">Actions open on the right</span>
                  </div>

                  {selected.turf?.upkeepDiscount ? (
                    <p className="se-hint se-good">
                      {selected.turf.upkeepDiscount.factionName} perk — your corners burn {selected.turf.upkeepDiscount.percent}% less beer and product.
                    </p>
                  ) : null}
                  <div className="se-cityblocks-boardwrap">
                    <CityBlockBoard
                      city={selected}
                      onChanged={load}
                      selectedDistrict={selectedDistrict}
                      onSelect={(district) => {
                        const next = new URLSearchParams(params);
                        next.set('city', selected.slug);
                        next.set('district', district);
                        setParams(next, { replace: true, preventScrollReset: true });
                      }}
                    />
                  </div>
                </section>
                </div>

                <section className="se-cityblocks-ops">
                  <div className="se-cityblocks-stack">
                    {!selected.isHome && travel?.rules.outposts ? (
                      <Panel
                        title="Away corners & outposts"
                        aside={runsHere.length ? `${runsHere.length} run${runsHere.length === 1 ? '' : 's'} in town` : 'Run required'}
                        className="se-cityblocks-panel"
                      >
                        {runsHere.length ? (
                          <div className="se-cityblocks-outposts">
                            {runsHere.map((run) => <OutpostStopPanel key={run.id} run={run} data={travel} onDone={load} />)}
                          </div>
                        ) : (
                          <p className="se-hint">
                            Establishing or servicing an away corner requires one of your runs to be physically in {selected.name}.{' '}
                            <Link to={`/game/travel?city=${encodeURIComponent(selected.slug)}`}>Send or move a run from Travel.</Link>
                          </p>
                        )}
                      </Panel>
                    ) : null}

                    <Panel title="Recent Turf fights" aside={selected.name} className="se-cityblocks-panel">
                      <TurfReports city={selected} />
                    </Panel>

                    {rankings?.territory ? (
                      <div className="se-cityblocks-rankings">
                        <Panel title="Top crews · round" aside="block-time" className="se-cityblocks-panel">
                          {rankings.territory.crews.length ? (
                            <ol className="se-turfleaders">
                              {rankings.territory.crews.slice(0, 5).map((row) => (
                                <li key={row.publicPimpId} className={row.isYou ? 'se-turfleaders__you' : undefined}>
                                  <span>
                                    <b className="se-num">#{row.rank}</b>{' '}
                                    <AllianceTag alliance={row.alliance} />
                                    <Link className="se-playerlink" to={`/game/players/${row.publicPimpId}`}>{row.displayName}</Link>
                                  </span>
                                  <span className="se-num">{turfTime(row.heldSeconds)} · {row.currentBlocks} now</span>
                                </li>
                              ))}
                            </ol>
                          ) : <p className="se-muted">No crew has banked block-time yet.</p>}
                        </Panel>

                        <Panel title="Top alliances · round" aside="block-time" className="se-cityblocks-panel">
                          {rankings.territory.alliances.length ? (
                            <ol className="se-turfleaders">
                              {rankings.territory.alliances.slice(0, 5).map((row) => (
                                <li key={row.tag} className={row.isYours ? 'se-turfleaders__you' : undefined}>
                                  <span>
                                    <b className="se-num">#{row.rank}</b>{' '}
                                    <Link className="se-playerlink" to={`/game/alliances/${encodeURIComponent(row.tag)}`}>[{row.tag}] {row.name}</Link>
                                  </span>
                                  <span className="se-num">{turfTime(row.heldSeconds)} · {row.currentBlocks} now</span>
                                </li>
                              ))}
                            </ol>
                          ) : <p className="se-muted">No alliance has banked block-time yet.</p>}
                        </Panel>
                      </div>
                    ) : null}
                  </div>

                </section>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
