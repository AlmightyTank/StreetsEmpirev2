import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BELL_CATEGORY_BY_ACTIVITY, type ActivityDto } from '@streets/shared';
import { useSession } from '../stores/session.js';
import { gameEventToastFor } from './GameEventToasts.js';

export type EncounterAlertKind = 'driveby' | 'raid' | 'turf' | 'convoy' | 'encounter';
export type EncounterAlertOutcome = 'incoming' | 'victory' | 'defeat' | 'warning';

export interface EncounterAlert {
  kind: EncounterAlertKind;
  outcome: EncounterAlertOutcome;
  title: string;
  description: string;
  location?: string;
  opponent?: string;
  href?: string;
  preview?: boolean;
}

type QueuedEncounterAlert = EncounterAlert & { id: string };
const PREVIEW_EVENT = 'streets:encounter-alert-preview';
const MAX_QUEUE = 5;
let previewSequence = 0;

/** QA-only visual dispatch. This event never calls a game API or mutates gameplay. */
export function previewEncounterAlert(alert: EncounterAlert): void {
  window.dispatchEvent(new CustomEvent<EncounterAlert>(PREVIEW_EVENT, {
    detail: { ...alert, preview: true },
  }));
}

function stringField(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof payload[key] === 'string' && payload[key]) return payload[key] as string;
  }
  return '';
}

const TITLES: Record<EncounterAlertKind, string> = {
  driveby: 'Drive-by', raid: 'Crew raid', turf: 'Turf war',
  convoy: 'Convoy ambush', encounter: 'Street encounter',
};

const STATUS: Record<EncounterAlertOutcome, { label: string; symbol: string }> = {
  incoming: { label: 'INCOMING THREAT', symbol: '!' },
  victory: { label: 'CREW VICTORY', symbol: '★' },
  defeat: { label: 'CREW UNDER ATTACK', symbol: '!' },
  warning: { label: 'STREET INTELLIGENCE', symbol: '◆' },
};

/** Reuse the existing activity/toast copy so this cannot contradict the combat report. */
export function encounterAlertForActivity(activity: ActivityDto): EncounterAlert | null {
  const p = activity.payload;
  let kind: EncounterAlertKind;
  let outcome: EncounterAlertOutcome;

  switch (activity.type) {
    case 'DRIVE_BY_ATTACK':
    case 'DRIVE_BY_DEFENSE':
      kind = 'driveby';
      outcome = p.won === true ? 'victory' : 'defeat';
      break;
    case 'RAID_ATTACK':
    case 'RAID_DEFENSE':
      kind = 'raid';
      outcome = p.won === true ? 'victory' : 'defeat';
      break;
    case 'TURF_PUSH_INCOMING':
      kind = 'turf';
      outcome = 'incoming';
      break;
    case 'TURF_PUSH_ATTACK':
    case 'TURF_PUSH_DEFENSE':
      kind = 'turf';
      outcome = p.stale === true ? 'warning' : p.won === true || p.held === true ? 'victory' : 'defeat';
      break;
    case 'CONVOY_TAILED':
      kind = 'convoy';
      outcome = 'incoming';
      break;
    case 'CONVOY_DEFENSE':
      kind = 'convoy';
      outcome = p.held === true || p.escaped === true ? 'victory' : 'defeat';
      break;
    default:
      return null;
  }

  const existing = gameEventToastFor(activity, 'product');
  return {
    kind,
    outcome,
    title: existing?.title ?? (outcome === 'victory' ? TITLES[kind] + ' won' : TITLES[kind] + ' report'),
    description: existing?.detail || (outcome === 'incoming'
      ? 'Your lookouts have spotted an approaching threat.'
      : outcome === 'victory' ? 'Your crew came out on top.' : 'Your crew has a new combat report.'),
    opponent: stringField(p, 'opponent', 'attacker', 'defender', 'target'),
    location: stringField(p, 'districtName', 'cityName', 'district', 'city'),
    href: existing?.href ?? (kind === 'turf' ? '/game/turf' : '/game/console'),
  };
}

/**
 * One modal per newly arrived combat activity, FIFO. Hydration is intentionally
 * quiet: historical fights must not replay on refresh/sign-in.
 */
export function CinematicEncounterAlerts() {
  const playerId = useSession((s) => s.me?.id ?? null);
  const activity = useSession((s) => s.recentActivity);
  const hydrated = useSession((s) => s.activityHydratedForPlayerId);
  const bellMuted = useSession((s) => s.bellMuted);
  const reducedMotion = useSession((s) => s.profileSettings.reducedMotion);
  const [queue, setQueue] = useState<QueuedEncounterAlert[]>([]);
  const seededPlayer = useRef<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const closeButton = useRef<HTMLButtonElement>(null);
  const active = queue[0] ?? null;

  useEffect(() => {
    if (!playerId) {
      seededPlayer.current = null;
      seen.current.clear();
      setQueue([]);
      return;
    }
    if (hydrated !== playerId) return;
    if (seededPlayer.current !== playerId) {
      seededPlayer.current = playerId;
      seen.current = new Set(activity.map((entry) => entry.id));
      setQueue([]);
      return;
    }

    const fresh = activity.slice().reverse().filter((entry) => !seen.current.has(entry.id));
    for (const entry of fresh) seen.current.add(entry.id);
    const muted = new Set<string>(bellMuted);
    const next: QueuedEncounterAlert[] = fresh.flatMap((entry) => {
      const category = BELL_CATEGORY_BY_ACTIVITY[entry.type];
      if (category && muted.has(category)) return [];
      const alert = encounterAlertForActivity(entry);
      return alert ? [{ ...alert, id: entry.id }] : [];
    });
    if (next.length) setQueue((current) => [...current, ...next].slice(0, MAX_QUEUE));
  }, [activity, bellMuted, hydrated, playerId]);

  useEffect(() => {
    const onPreview = (event: Event) => {
      const item = (event as CustomEvent<EncounterAlert>).detail;
      if (!item || !item.title || !item.description) return;
      previewSequence += 1;
      setQueue((current) => [...current, {
        ...item, preview: true, id: 'qa-preview-' + previewSequence,
      }].slice(0, MAX_QUEUE));
    };
    window.addEventListener(PREVIEW_EVENT, onPreview);
    return () => window.removeEventListener(PREVIEW_EVENT, onPreview);
  }, []);

  useEffect(() => {
    if (!active) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setQueue((current) => current.slice(1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      before?.focus();
    };
  }, [active?.id]);

  if (!active) return null;
  const status = STATUS[active.outcome];
  const dismiss = () => setQueue((current) => current.slice(1));

  return (
    <div className={'se-encounter-cinema se-encounter-cinema--' + active.outcome + (reducedMotion ? ' se-encounter-cinema--still' : '')}
      role="presentation">
      <div className="se-encounter-cinema__backdrop" />
      <section className="se-encounter-cinema__dialog" role="alertdialog" aria-modal="true"
        aria-labelledby="se-encounter-cinema-title" aria-describedby="se-encounter-cinema-description">
        <div className="se-encounter-cinema__lightbar" aria-hidden="true" />
        <div className="se-encounter-cinema__visual" aria-hidden="true">
          <div className="se-encounter-cinema__skyline" />
          <div className="se-encounter-cinema__flare se-encounter-cinema__flare--left" />
          <div className="se-encounter-cinema__flare se-encounter-cinema__flare--right" />
          <div className="se-encounter-cinema__road" />
          <div className="se-encounter-cinema__emblem">{status.symbol}</div>
        </div>
        <div className="se-encounter-cinema__content">
          <div className="se-encounter-cinema__eyebrow">
            <span className="se-encounter-cinema__pulse" aria-hidden="true" />
            {status.label}
            {active.preview ? <span className="se-encounter-cinema__test">ADMIN PREVIEW · NO GAME CHANGES</span> : null}
          </div>
          <p className="se-encounter-cinema__category">{TITLES[active.kind]}</p>
          <h2 id="se-encounter-cinema-title">{active.title}</h2>
          <p id="se-encounter-cinema-description" className="se-encounter-cinema__description">{active.description}</p>
          {active.location || active.opponent ? (
            <div className="se-encounter-cinema__intel">
              {active.location ? <span><small>LOCATION</small><strong>{active.location}</strong></span> : null}
              {active.opponent ? <span><small>OPPOSING CREW</small><strong>{active.opponent}</strong></span> : null}
            </div>
          ) : null}
          <div className="se-encounter-cinema__actions">
            {!active.preview && active.href ? (
              <Link to={active.href} className="se-btn se-btn--primary" onClick={dismiss}>
                {active.outcome === 'incoming' ? 'Respond now' : 'See the report'}
              </Link>
            ) : null}
            <button ref={closeButton} className="se-btn se-btn--secondary" type="button" onClick={dismiss}>
              {active.preview ? 'Close preview' : 'Dismiss'}
            </button>
            {queue.length > 1 ? <span className="se-encounter-cinema__queued">{queue.length - 1} more alerts</span> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
