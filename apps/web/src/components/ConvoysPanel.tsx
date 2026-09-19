import { useCallback, useEffect, useState } from 'react';
import type { ConvoyBackupResult, ConvoyReconResult, ConvoyReportDto, ConvoyTailDto, ConvoyTailResult, ConvoyTargetDto, ConvoysDto, GameActionResult, TravelDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { formatDuration } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

type Products = TravelDto['products'];
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const nameOf = (products: Products, key: string) => products.find((product) => product.key === key)?.name ?? key;

const KIND_WORDS: Record<ConvoyTargetDto['kinds'][number], string> = { arriving: 'coming in', town: 'in town', passing: 'driving through', leaving: 'leaving' };
const CASH_WORDS = { light: 'light wallet', loaded: 'carrying cash', heavy: 'heavy wallet' } as const;
const CARGO_WORDS = { empty: 'empty trunk', light: 'light trunk', half: 'half a trunk', full: 'full trunk' } as const;
const ESCORT_WORDS = { none: 'no escort', light: 'light escort', armed: 'armed escort', heavy: 'heavy escort' } as const;

function whole(value: string): number | '' {
  if (value === '') return '';
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
}

function Countdown({ until, onDone, prefix }: { until: string; onDone?: () => void; prefix: string }) {
  const { msRemaining } = useCountdown(until, onDone);
  return <span className="se-num">{msRemaining > 0 ? `${prefix} ${formatDuration(msRemaining)}` : 'landing...'}</span>;
}

/** What a landed tail did, from your side. */
function reportText(report: ConvoyReportDto, tail: ConvoyTailDto, products: Products): string {
  if (report.escaped) {
    return tail.role === 'attacker' ? `${tail.owner.displayName}'s run got away before the hit. Your squad came home.` : `The run got away before ${tail.attacker.displayName} could hit it.`;
  }
  const cargo = Object.entries(report.cargo).filter(([, units]) => units !== 0).map(([key, units]) => `${formatNumber(Math.abs(units))} ${nameOf(products, key)}`);
  const haul = [report.cashCents !== 0 ? formatCents(Math.abs(report.cashCents)) : '', ...cargo, report.lowRider ? `${Math.abs(report.lowRider)} Low-Rider` : ''].filter(Boolean).join(', ');
  const defenders = report.defenders.escorts + report.defenders.homeBackup + report.defenders.sentBackup + report.defenders.allyBackup;
  const sides = `${formatNumber(report.attackers)} against ${formatNumber(defenders)}`;
  if (tail.role === 'attacker') {
    return report.won ? `Hit ${tail.owner.displayName}'s run (${sides}) and took ${haul || 'nothing worth carrying'}. ${report.yourWounds} of yours wounded.`
      : `${tail.owner.displayName}'s crew held (${sides}). ${report.yourWounds} of yours wounded.`;
  }
  return report.won ? `Held off ${tail.attacker.displayName} (${sides}). ${report.yourWounds} wounded.`
    : `${tail.attacker.displayName} hit the run (${sides}) and took ${haul || 'nothing'}. ${report.yourWounds} wounded.`;
}

/** Send thugs to a tailed run's fight: the owner from home, or an ally who was called. */
function SendHelp({ tail, onDone }: { tail: ConvoyTailDto; onDone: () => void }) {
  const send = useGameAction<ConvoyBackupResult>();
  const [thugs, setThugs] = useState<number | ''>('');
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const limit = tail.sendBackup ?? tail.answer;
  const count = typeof thugs === 'number' ? thugs : 0;
  const block = send.busy ? 'Rounding them up.' : limit?.reason ?? (count < 1 || count > (limit?.max ?? 0) ? `Send 1 to ${formatNumber(limit?.max ?? 0)}.` : null);

  async function callAllies() {
    setCalling(true);
    setCallError(null);
    try {
      await api.post('/game/convoys/call', { tailId: tail.id });
      onDone();
    } catch (caught) {
      setCallError(caught instanceof ApiError ? caught.message : 'Could not reach your allies.');
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="se-convoys__help">
      {limit ? (
        <div className="se-launch__with-all">
          <input className="se-input" type="number" inputMode="numeric" min={1} max={limit.max} value={thugs} placeholder="Thugs" aria-label="Thugs to send"
            disabled={Boolean(limit.reason)} onChange={(event) => setThugs(whole(event.target.value))} />
          <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={block}
            onClick={async () => {
              await send.run((actionId): Promise<GameActionResult<ConvoyBackupResult>> => api.post('/game/convoys/backup', { tailId: tail.id, thugs: count, actionId }));
              setThugs('');
              onDone();
            }}>
            Send
          </Button>
        </div>
      ) : null}
      {tail.sendBackup && tail.sendBackup.minutes > 0 && !tail.sendBackup.reason ? <p className="se-hint">{tail.sendBackup.minutes} minutes from home: they get there before the hit.</p> : null}
      {limit?.reason ? <p className="se-hint">{limit.reason}</p> : null}
      {tail.role === 'owner' ? (
        tail.alliesCalled
          ? <p className="se-hint">Your allies in {tail.cityName} have been called.</p>
          : <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={calling ? 'Calling...' : null} onClick={callAllies}>Call allies in {tail.cityName}</Button>
      ) : null}
      {send.error ? <Alert>{send.error}</Alert> : null}
      {callError ? <Alert>{callError}</Alert> : null}
    </div>
  );
}

function TailRow({ tail, products, onDone }: { tail: ConvoyTailDto; products: Products; onDone: () => void }) {
  const pending = tail.status === 'PENDING';
  const headline = tail.role === 'attacker'
    ? `Your squad of ${formatNumber(tail.squad)} is on ${tail.owner.displayName}'s run near ${tail.cityName}`
    : tail.role === 'owner'
      ? `${tail.attacker.displayName} is tailing your run near ${tail.cityName}`
      : `${tail.owner.displayName} needs backup in ${tail.cityName}: ${tail.attacker.displayName} is on their run`;
  return (
    <li className={`se-convoys__tail${pending && tail.role !== 'attacker' ? ' se-convoys__tail--alert' : ''}`}>
      {pending ? (
        <>
          <p className="se-convoys__line">
            <span>{headline}</span>
            <Countdown until={tail.landsAt} onDone={onDone} prefix="hits in" />
          </p>
          {tail.backup.owner + tail.backup.allies > 0 ? <p className="se-hint">Backup on the way: {formatNumber(tail.backup.owner + tail.backup.allies)}.</p> : null}
          {tail.role !== 'attacker' ? <SendHelp tail={tail} onDone={onDone} /> : <p className="se-hint">It lands at {clock(tail.landsAt)} if the run is still near {tail.cityName}.</p>}
        </>
      ) : tail.report ? (
        <p className={`se-convoys__line ${tail.report.won ? 'se-good' : tail.report.escaped ? '' : 'se-bad'}`}>
          <span>{reportText(tail.report, tail, products)}{tail.voided ? ' (voided by an admin)' : ''}</span>
          <span className="se-muted se-num">{clock(tail.landsAt)}</span>
        </p>
      ) : null}
    </li>
  );
}

function TargetRow({ target, data, squadFit, onDone }: { target: ConvoyTargetDto; data: ConvoysDto; squadFit: number; onDone: () => void }) {
  const tail = useGameAction<ConvoyTailResult>();
  // The recon's times are fixed; whether it is in reach is now.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const nowMs = Date.now();
  const inReachNow = new Date(target.inReachFrom).getTime() <= nowMs && nowMs < new Date(target.inReachUntil).getTime();
  const gone = new Date(target.inReachUntil).getTime() <= nowMs;
  const max = target.source === 'RUN' ? data.run?.escorts ?? 0 : squadFit;
  const [squad, setSquad] = useState<number | ''>(max > 0 ? max : '');
  const count = typeof squad === 'number' ? squad : 0;
  const block = tail.busy ? 'Getting on it.'
    : gone ? 'Gone by now.'
      : !inReachNow ? 'Not in reach yet.'
        : target.blockedReason && target.blockedReason !== 'Not in reach yet.' && target.blockedReason !== 'Gone by now.' ? target.blockedReason
          : count < 1 || count > max ? `Send 1 to ${formatNumber(max)}.` : null;
  const around = [target.routeHere.fromName, target.cityName, target.routeHere.toName].filter(Boolean).join(' → ');
  return (
    <li className="se-convoys__target">
      <p className="se-convoys__line">
        <span><strong>{target.owner.displayName}</strong>{target.owner.allianceTag ? ` [${target.owner.allianceTag}]` : ''}: {target.kinds.map((kind) => KIND_WORDS[kind]).join(', ')} {target.cityName}</span>
        {inReachNow
          ? <Countdown until={target.inReachUntil} onDone={onDone} prefix="in reach for" />
          : <span className="se-muted se-num">{gone ? `gone ${clock(target.inReachUntil)}` : `from ${clock(target.inReachFrom)}`}</span>}
      </p>
      <p className="se-hint se-num">{around}</p>
      <div className="se-meter se-convoys__meter" aria-label={`${Math.round(target.position.progress * 100)}% of its leg`}>
        <div className="se-meter__fill" style={{ width: `${Math.round(target.position.progress * 100)}%` }} />
      </div>
      {target.bands ? <p className="se-hint">{CASH_WORDS[target.bands.cash]} · {CARGO_WORDS[target.bands.cargo]} · {ESCORT_WORDS[target.bands.escort]}</p> : null}
      {inReachNow ? (
        <div className="se-launch__with-all">
          <input className="se-input" type="number" inputMode="numeric" min={1} max={max} value={squad} aria-label="Squad"
            onChange={(event) => setSquad(whole(event.target.value))} />
          <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={block}
            onClick={async () => {
              await tail.run((actionId): Promise<GameActionResult<ConvoyTailResult>> => api.post('/game/convoys/tail', { runId: target.runId, squad: count, actionId }));
              onDone();
            }}>
            {target.source === 'RUN' ? 'Tail with your escorts' : 'Tail it'}
          </Button>
        </div>
      ) : null}
      {inReachNow && block && !tail.busy ? <p className="se-hint">{block}</p> : null}
      {tail.error ? <Alert>{tail.error}</Alert> : null}
    </li>
  );
}

/** Recon the area for turns: a snapshot of runs coming near, in town or leaving. */
function ReconButton({ data, onDone }: { data: ConvoysDto; onDone: () => void }) {
  const recon = useGameAction<ConvoyReconResult>();
  const rules = data.rules!;
  const block = recon.busy ? 'Asking around.' : data.squad.turns < rules.reconTurnCost ? `Recon costs ${rules.reconTurnCost} turns.` : null;
  return (
    <>
      <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={block}
        onClick={async () => {
          await recon.run((actionId): Promise<GameActionResult<ConvoyReconResult>> => api.post('/game/convoys/recon', { actionId }));
          onDone();
        }}>
        Recon the area · {rules.reconTurnCost} turns
      </Button>
      {recon.error ? <Alert>{recon.error}</Alert> : null}
    </>
  );
}

/**
 * 0.5.0-E. Convoys: what your last recon of the area found (runs coming near, in town or
 * leaving where you live, and near your own run), and every tail you are part of. Nobody
 * is alerted: a tail on your run shows only once your lookouts spot it.
 */
export function ConvoysPanel({ products, refreshKey }: { products: Products; refreshKey?: unknown }) {
  const [data, setData] = useState<ConvoysDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.get<ConvoysDto>('/game/convoys')
      .then((next) => { setData(next); setError(null); })
      .catch(() => setError('Could not see the road. Try again.'));
  }, []);
  useEffect(load, [load, refreshKey]);
  useEffect(() => {
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error) return <Panel title="Convoys"><Alert>{error}</Alert></Panel>;
  if (!data?.enabled || !data.rules) return null;
  const alerts = data.tails.filter((tail) => tail.status === 'PENDING' && tail.role !== 'attacker');
  const others = data.tails.filter((tail) => !alerts.includes(tail));

  return (
    <Panel title="Convoys" aside={`${data.rules.turnCost} turns a tail`}>
      {alerts.length ? <ul className="se-convoys__list">{alerts.map((tail) => <TailRow key={tail.id} tail={tail} products={products} onDone={load} />)}</ul> : null}
      <p className="se-dim">
        Recon {data.squad.cityName}{data.run ? ` and around your run in ${data.run.cityName}` : ''} to find runs coming in, in town, driving through or leaving,
        up to {data.rules.lookaheadMinutes} minutes ahead. A tail commits your squad and lands in {data.rules.warningMinutes} minutes if the run is still in reach.
        Nobody is warned: an owner only spots a tail if their lookouts do.
      </p>
      <div className="se-convoys__recon">
        <ReconButton data={data} onDone={load} />
        {data.recon ? <span className="se-hint">Last recon {clock(data.recon.seenAt)}, good until {clock(data.recon.expiresAt)}.</span> : null}
      </div>
      {data.recon
        ? data.targets.length
          ? <ul className="se-convoys__list">{data.targets.map((target) => <TargetRow key={target.runId} target={target} data={data} squadFit={data.squad.fit} onDone={load} />)}</ul>
          : <p className="se-hint">Your recon found nothing coming near.</p>
        : null}
      <p className="se-hint">
        {data.rules.headsUpMinutes > 0
          ? `Your lookouts spot a tail on your own run about ${formatDuration(data.rules.headsUpMinutes * 60_000)} before it hits.`
          : 'Without lookouts at your hideout, you only find out a run was hit when it lands.'}
      </p>
      {others.length ? (
        <>
          <h3 className="se-city__heading">Tails</h3>
          <ul className="se-convoys__list">{others.map((tail) => <TailRow key={tail.id} tail={tail} products={products} onDone={load} />)}</ul>
        </>
      ) : null}
    </Panel>
  );
}
