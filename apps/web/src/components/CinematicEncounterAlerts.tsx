import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BELL_CATEGORY_BY_ACTIVITY, STATUE_ENCOUNTER_KEY, formatCents, formatNumber, type ActivityDto, type RandomEncounterDto, type RandomEncounterChoiceResult } from '@streets/shared';
import { actionsApi } from '../api/actions.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { EncounterEggNote, StatueWatch } from './EasterEggs.js';
import { useSession } from '../stores/session.js';
import { gameEventToastFor } from './GameEventToasts.js';
import { describeActivity } from './ActivityFeed.js';
import { isCinematicEncounterActivity } from './encounterAlertPolicy.js';

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
  /** Random encounter from the authoritative action receipt. */
  encounter?: RandomEncounterDto;
}

export type QueuedEncounterAlert = EncounterAlert & { id: string };
export const RANDOM_ENCOUNTER_EVENT = 'streets:random-encounter';
const PREVIEW_EVENT = 'streets:encounter-alert-preview';
let previewSequence = 0;

/** FIFO queue without silent overflow: every acknowledged fresh activity gets displayed. */
export function appendEncounterAlertQueue(
  current: QueuedEncounterAlert[],
  incoming: QueuedEncounterAlert[],
): QueuedEncounterAlert[] {
  const ids = new Set(current.map((item) => item.id));
  const unique = incoming.filter((item) => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
  return unique.length ? [...current, ...unique] : current;
}

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
  defeat: { label: 'CREW TOOK A HIT', symbol: '!' },
  warning: { label: 'STREET INTELLIGENCE', symbol: '◆' },
};

/** Reuse the existing activity/toast copy so this cannot contradict the combat report. */
export function encounterAlertForActivity(activity: ActivityDto): EncounterAlert | null {
  if (!isCinematicEncounterActivity(activity.type)) return null;
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
  const described = describeActivity(activity, 'product');
  const outboundTitle = activity.type === 'RAID_ATTACK'
    ? p.won === true ? 'Your raid succeeded' : 'Your raid failed'
    : activity.type === 'DRIVE_BY_ATTACK'
      ? p.won === true ? 'Drive-by landed' : 'Drive-by repelled'
      : null;
  return {
    kind,
    outcome,
    title: existing?.title ?? outboundTitle ?? (outcome === 'victory' ? TITLES[kind] + ' won' : TITLES[kind] + ' report'),
    description: existing?.detail || [described.text, described.detail].filter(Boolean).join(' ') || (outcome === 'incoming'
      ? 'Your lookouts have spotted an approaching threat.'
      : outcome === 'victory' ? 'Your crew came out on top.' : 'Your crew has a new combat report.'),
    opponent: stringField(p, 'opponent', 'attacker', 'defender', 'target'),
    location: stringField(p, 'districtName', 'cityName', 'district', 'city'),
    href: existing?.href ?? (kind === 'turf' ? '/game/turf' : kind === 'convoy' ? '/game/travel' : '/game/console?view=attacks'),
  };
}


/** Read both legacy and first-class activity payload shapes. Never roll rewards in the UI. */
function validEncounter(value: unknown): value is RandomEncounterDto {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RandomEncounterDto>;
  return typeof item.key === 'string' && typeof item.title === 'string'
    && typeof item.text === 'string' && typeof item.tone === 'string'
    && !!item.effects && typeof item.effects === 'object';
}

export function randomEncounterFromActivity(activity: ActivityDto): RandomEncounterDto | null {
  const payload = activity.payload as Record<string, unknown>;
  if (validEncounter(payload.randomEncounter)) return payload.randomEncounter;
  if (validEncounter(payload.encounter)) return payload.encounter;
  return null;
}

export function alertForRandomEncounter(encounter: RandomEncounterDto): EncounterAlert {
  return {
    kind: 'encounter',
    outcome: encounter.tone === 'good' ? 'victory' : encounter.tone === 'bad' ? 'defeat' : 'warning',
    title: encounter.title,
    description: encounter.text,
    encounter,
  };
}

function encounterEffectSummary(effects: RandomEncounterDto['effects']): string {
  const amount = (value: number, name: string) =>
    (value > 0 ? '+' : '-') + formatNumber(Math.abs(value)) + ' ' + name;
  return [
    effects.cashCents ? (effects.cashCents > 0 ? '+' : '-') + formatCents(Math.abs(effects.cashCents)) + ' cash' : null,
    effects.heat ? amount(effects.heat, 'Heat') : null,
    effects.turns ? amount(effects.turns, 'Turns') : null,
    effects.thugs ? amount(effects.thugs, 'Thugs') : null,
    effects.woundedThugs ? amount(effects.woundedThugs, 'Wounded thugs') : null,
    effects.whores ? amount(effects.whores, 'Crew') : null,
    effects.lowRiders ? amount(effects.lowRiders, 'Vehicles') : null,
    effects.condoms ? amount(effects.condoms, 'Condoms') : null,
    effects.medicine ? amount(effects.medicine, 'Medicine') : null,
    effects.crack ? amount(effects.crack, 'Product') : null,
    effects.beer ? amount(effects.beer, 'Beer') : null,
  ].filter(Boolean).join(' · ');
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
  const [previewChoice, setPreviewChoice] = useState<string | null>(null);
  const choiceAction = useGameAction<RandomEncounterChoiceResult>();
  const seenEncounters = useRef<Set<string>>(new Set());
  const dialog = useRef<HTMLElement>(null);
  const seededPlayer = useRef<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const closeButton = useRef<HTMLButtonElement>(null);
  const active = queue[0] ?? null;

  useEffect(() => {
    if (!playerId) {
      seededPlayer.current = null;
      seen.current.clear();
      seenEncounters.current.clear();
      setQueue([]);
      return;
    }
    if (hydrated !== playerId) return;
    if (seededPlayer.current !== playerId) {
      seededPlayer.current = playerId;
      seen.current = new Set(activity.map((entry) => entry.id));
      // Seed historical encounters silently on sign-in/refresh.
      seenEncounters.current = new Set(activity.flatMap((entry) => {
        const found = randomEncounterFromActivity(entry);
        return found?.id ? ['random:' + found.id] : [];
      }));
      setQueue([]);
      return;
    }

    const fresh = activity.slice().reverse().filter((entry) => !seen.current.has(entry.id));
    for (const entry of fresh) seen.current.add(entry.id);
    const muted = new Set<string>(bellMuted);
    const next: QueuedEncounterAlert[] = [];
    for (const entry of fresh) {
      const category = BELL_CATEGORY_BY_ACTIVITY[entry.type];
      const combatAlert = encounterAlertForActivity(entry);
      if (combatAlert && !(category && muted.has(category))) {
        next.push({ ...combatAlert, id: entry.id });
      }
      const encounter = randomEncounterFromActivity(entry);
      if (encounter) {
        const id = encounter.id ? 'random:' + encounter.id : 'random:activity:' + entry.id + ':' + encounter.key;
        if (!seenEncounters.current.has(id)) {
          seenEncounters.current.add(id);
          next.push({ ...alertForRandomEncounter(encounter), id });
        }
      }
    }
    if (next.length) setQueue((current) => appendEncounterAlertQueue(current, next));
  }, [activity, bellMuted, hydrated, playerId]);

  // Immediate action receipts cover pages that do not log activity (and avoid polling delay).
  useEffect(() => {
    const onEncounter = (event: Event) => {
      const encounter = (event as CustomEvent<RandomEncounterDto>).detail;
      if (!validEncounter(encounter)) return;
      const id = encounter.id ? 'random:' + encounter.id : 'random:direct:' + encounter.key + ':' + Date.now();
      if (seenEncounters.current.has(id)) return;
      seenEncounters.current.add(id);
      setQueue((current) => appendEncounterAlertQueue(current, [{
        ...alertForRandomEncounter(encounter), id,
      }]));
    };
    window.addEventListener(RANDOM_ENCOUNTER_EVENT, onEncounter);
    return () => window.removeEventListener(RANDOM_ENCOUNTER_EVENT, onEncounter);
  }, []);

  useEffect(() => {
    choiceAction.clear();
    setPreviewChoice(null);
  }, [active?.id, choiceAction.clear]);

  async function resolveEncounter(choice: string) {
    if (!active?.encounter?.id || choiceAction.busy || choiceAction.result) return;
    await choiceAction.run((actionId) => actionsApi.resolveEncounter(active.encounter!.id!, { choice, actionId }));
  }

  useEffect(() => {
    const onPreview = (event: Event) => {
      const item = (event as CustomEvent<EncounterAlert>).detail;
      if (!item || !item.title || !item.description) return;
      previewSequence += 1;
      setQueue((current) => appendEncounterAlertQueue(current, [{
        ...item, preview: true, id: 'qa-preview-' + previewSequence,
      }]));
    };
    window.addEventListener(PREVIEW_EVENT, onPreview);
    return () => window.removeEventListener(PREVIEW_EVENT, onPreview);
  }, []);

  useEffect(() => {
    if (!active) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !choiceAction.busy) {
        event.preventDefault();
        setQueue((current) => current.slice(1));
      }
      // Keyboard focus must stay within the current modal.
      if (event.key === 'Tab' && dialog.current) {
        const controls = [...dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (first && last && event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (first && last && !event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
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
  const dismiss = () => {
    if (!choiceAction.busy) setQueue((current) => current.slice(1));
  };
  const choices = active.encounter?.choices ?? [];
  const choiceReceipt = choiceAction.result;
  const choiceResult = choiceReceipt && choiceReceipt.result.encounterId === active.encounter?.id
    ? choiceReceipt.result : null;
  const effectsText = active.encounter ? encounterEffectSummary(active.encounter.effects) : '';

  return (
    <div className={'se-encounter-cinema se-encounter-cinema--' + active.outcome + (reducedMotion ? ' se-encounter-cinema--still' : '')}
      role="presentation">
      <div className="se-encounter-cinema__backdrop" />
      <section ref={dialog} className="se-encounter-cinema__dialog" role={choices.length ? 'dialog' : 'alertdialog'} aria-modal="true"
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
          {active.encounter && choices.length === 0 && effectsText ? (
            <p className="se-encounter-cinema__effects"><strong>OUTCOME</strong> {effectsText}</p>
          ) : null}
          {choices.length > 0 ? (
            <div className="se-encounter-cinema__decision">
              {choiceResult ? (
                <div className="se-encounter-cinema__resolution" role="status">
                  <strong>{choiceResult.choiceLabel}</strong>
                  <p>{choiceResult.text}</p>
                  {encounterEffectSummary(choiceResult.effects) ? <em>{encounterEffectSummary(choiceResult.effects)}</em> : null}
                  <EncounterEggNote egg={choiceResult.easterEgg} />
                </div>
              ) : (
                <>
                  <p className="se-encounter-cinema__question">What do you do?</p>
                  {active.encounter?.key === STATUE_ENCOUNTER_KEY && !active.preview ? (
                    <StatueWatch active={!choiceAction.busy} onReached={() => void resolveEncounter('run')} />
                  ) : null}
                  <div className="se-encounter-cinema__choices">
                    {choices.map((choice) => (
                      <button key={choice.key} type="button" className="se-encounter-cinema__choice"
                        disabled={choiceAction.busy || Boolean(previewChoice)}
                        onClick={() => {
                          if (active.preview) setPreviewChoice(choice.key);
                          else void resolveEncounter(choice.key);
                        }}>
                        <strong>{choice.label}</strong>
                        {choice.text ? <span>{choice.text}</span> : null}
                        {encounterEffectSummary(choice.effects) ? <small>{encounterEffectSummary(choice.effects)}</small> : null}
                      </button>
                    ))}
                  </div>
                  {active.preview && previewChoice ? (
                    <p className="se-encounter-cinema__effects" role="status">Visual preview only — no game action or reward was applied.</p>
                  ) : null}
                  {choiceAction.error ? <p className="se-encounter-cinema__error" role="alert">{choiceAction.error} You can retry your choice.</p> : null}
                </>
              )}
            </div>
          ) : null}
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
            <button ref={closeButton} className="se-btn se-btn--secondary" type="button"
              disabled={choiceAction.busy} onClick={dismiss}>
              {active.preview ? 'Close preview' : choiceResult ? 'Continue' : choices.length ? 'Decide later' : 'Continue'}
            </button>
            {queue.length > 1 ? <span className="se-encounter-cinema__queued">{queue.length - 1} more alerts</span> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
