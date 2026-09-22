import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ActivityDto, RoundDto, RoundPlayerDto } from '@streets/shared';
import { describeActivity } from './ActivityFeed.js';
import { notificationsApi } from '../api/notifications.js';
import { useSession } from '../stores/session.js';

type ToastTone = 'info' | 'good' | 'warn' | 'bad';

export interface GameEventToast {
  id: string;
  title: string;
  detail: string;
  tone: ToastTone;
  href?: string;
  /** Activity-backed toasts use this to acknowledge the durable bell item. */
  notificationId?: string;
}

type GameEventToastInput = Omit<GameEventToast, 'id'> & { id?: string };

declare global {
  interface WindowEventMap {
    'streets:test-popup': CustomEvent<GameEventToastInput>;
  }
}

const MAX_VISIBLE_TOASTS = 4;
const TOAST_TTL_MS = 9_000;
let manualToastId = 0;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function questHref(payload: Record<string, unknown>, tab: 'available' | 'active' | 'completed' = 'active'): string {
  const key = str(payload.questKey);
  return `/game/quests?tab=${tab}${key ? `#quest-${encodeURIComponent(key)}` : ''}`;
}

function questCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function validTone(value: unknown): ToastTone {
  return value === 'good' || value === 'warn' || value === 'bad' || value === 'info' ? value : 'info';
}

function formatMinutes(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

function snapshotEventSignals(round: RoundDto | null, player: RoundPlayerDto | null): Array<{ key: string; toast: Omit<GameEventToast, 'id'> }> {
  if (!player) return [];
  const signals: Array<{ key: string; toast: Omit<GameEventToast, 'id'> }> = [];

  if (player.turns.turnCap > 0 && player.turns.turns >= player.turns.turnCap) {
    signals.push({
      key: `turns-capped:${player.id}`,
      toast: {
        title: 'Turns capped',
        detail: `You are holding ${player.turns.turns} / ${player.turns.turnCap} turns. Spend some before the next tick.`,
        tone: 'info',
        href: '/game/scout',
      },
    });
  }

  if (player.heat) {
    const heat = player.heat;
    const band = heat.lockedUntil ? 'locked'
      : heat.arrest && heat.heat >= heat.arrest.startsAt ? 'arrest'
        : heat.heat >= heat.bustStartsAt ? 'bust'
          : heat.heat >= heat.dragStartsAt ? 'drag'
            : null;
    if (band) {
      signals.push({
        key: `heat:${player.id}:${band}`,
        toast: {
          title: band === 'locked' ? 'Crew locked up' : 'Heat is dangerous',
          detail: band === 'locked'
            ? `Police have you locked down until ${new Date(heat.lockedUntil ?? '').toLocaleTimeString()}.`
            : `Heat is ${heat.heat} / ${heat.max}. Bribe, wait, or keep the next job small.`,
          tone: band === 'drag' ? 'warn' : 'bad',
          href: '/game/status',
        },
      });
    }
  }

  if (player.convoyAlert) {
    const alert = player.convoyAlert;
    signals.push({
      key: `convoy:${player.id}:${alert.kind}:${alert.cityName}:${alert.landsAt}`,
      toast: {
        title: alert.kind === 'tailed' ? 'Convoy tail detected' : 'Ally needs convoy backup',
        detail: alert.kind === 'tailed'
          ? `Someone is tailing your run near ${alert.cityName}.`
          : `An ally called for help near ${alert.cityName}.`,
        tone: 'warn',
        href: '/game/travel',
      },
    });
  }

  if (round && round.msRemaining > 0 && round.msRemaining <= 60 * 60_000) {
    signals.push({
      key: `round-ending:${round.id}`,
      toast: {
        title: 'Round ending soon',
        detail: `${round.name} ends in ${formatMinutes(round.msRemaining)}.`,
        tone: 'warn',
        href: '/game/status',
      },
    });
  }

  return signals;
}

function testPopupForKey(key: string): Omit<GameEventToast, 'id'> | null {
  switch (key) {
    case 'driveby':
      return {
        title: 'Drive-by hit your block',
        detail: 'Rival rolled past and your crew took wounds. Tap to open Activity.',
        tone: 'bad',
        href: '/game/activity',
      };
    case 'quest':
      return {
        title: 'Quest ready to turn in',
        detail: 'First Night Out is complete. Return to Quests to collect payment.',
        tone: 'good',
        href: '/game/quests?tab=active#quest-FIRST_NIGHT_OUT',
      };
    default:
      return null;
  }
}

export function gameEventToastFor(activity: ActivityDto, crackWord: string): Omit<GameEventToast, 'id'> | null {
  const p = activity.payload;
  const described = describeActivity(activity, crackWord);
  const detail = [described.text, described.detail].filter(Boolean).join(' ');

  switch (activity.type) {
    case 'QUEST_OBJECTIVE_COMPLETE':
      return {
        title: p.bonus ? 'Bonus objective complete' : 'Quest objective complete',
        detail,
        tone: 'good',
        href: questHref(p),
      };

    case 'QUEST_READY':
      return {
        title: 'Quest ready to turn in',
        detail,
        tone: 'good',
        href: questHref(p),
      };

    case 'QUEST_CLAIMED': {
      const count = questCount(p.newlyAvailable);
      if (count <= 0) return null;
      return {
        title: count === 1 ? 'New quest available' : `${count} new quests available`,
        detail: str(p.title) ? `After ${str(p.title)}, new work opened up.` : 'New work opened up.',
        tone: 'info',
        href: '/game/quests?tab=available',
      };
    }

    case 'AWAY_BONUS':
      return {
        title: 'Away bonus received',
        detail,
        tone: 'good',
        href: '/game/activity',
      };

    case 'ADMIN_GRANT':
      return {
        title: 'Admin compensation received',
        detail,
        tone: 'good',
        href: '/game/activity',
      };

    case 'BATTLE_VOIDED':
      return {
        title: 'Battle voided',
        detail,
        tone: 'info',
        href: '/game/activity',
      };

    case 'RAID_DEFENSE': {
      const kind = str(p.kind);
      const title = kind === 'DRUG_HOES' || num(p.whoresDrugged) > 0
        ? 'Someone drugged your hoes'
        : kind === 'STEAL_RIDE' || num(p.lowRidersStolen) > 0
          ? 'Someone stole your ride'
          : kind === 'LURE_CREW' || num(p.whoresLured) + num(p.thugsLured) > 0
            ? 'Someone lured your crew away'
            : p.won ? 'Raid defended' : 'You were raided';
      return {
        title,
        detail,
        tone: p.won ? 'warn' : 'bad',
        href: '/game/activity',
      };
    }

    case 'DRIVE_BY_DEFENSE':
      return {
        title: p.won ? 'Drive-by stopped' : 'Drive-by hit your block',
        detail,
        tone: p.won ? 'warn' : 'bad',
        href: '/game/activity',
      };

    case 'CONVOY_DEFENSE':
      return {
        title: p.held || p.escaped ? 'Run defended' : 'Your run was hit',
        detail,
        tone: p.held || p.escaped ? 'warn' : 'bad',
        href: '/game/activity',
      };

    case 'TURF_PUSH_DEFENSE':
      return {
        title: p.stale ? 'Turf push fizzled' : p.held ? 'Block defended' : 'Block lost',
        detail,
        tone: p.held || p.stale ? 'warn' : 'bad',
        href: '/game/activity',
      };

    case 'RUN_RETURNED':
      return {
        title: 'Run returned',
        detail,
        tone: 'good',
        href: '/game/travel',
      };

    case 'RUN_INCIDENT':
      return {
        title: 'Police trouble',
        detail,
        tone: 'warn',
        href: '/game/activity',
      };

    case 'CONVOY_BACKUP':
      return {
        title: 'Convoy backup returned',
        detail,
        tone: 'info',
        href: '/game/activity',
      };

    case 'TURF_CLAIM':
      return {
        title: p.won ? 'Block captured' : 'Block claim failed',
        detail,
        tone: p.won ? 'good' : 'warn',
        href: '/game/turf',
      };

    case 'TURF_PUSH_ATTACK':
      return {
        title: p.won ? 'Block captured' : 'Turf push failed',
        detail,
        tone: p.won ? 'good' : 'warn',
        href: '/game/turf',
      };

    case 'TURF_PUSH_BACKUP':
      return {
        title: 'Turf backup returned',
        detail,
        tone: num(p.thugsWounded) || num(p.wounds) ? 'warn' : 'info',
        href: '/game/activity',
      };

    case 'SCOUT':
    case 'PRODUCE_CRACK':
      if (p.busted !== true) return null;
      return {
        title: 'Police bust',
        detail,
        tone: 'warn',
        href: '/game/activity',
      };

    default:
      return null;
  }
}

export function GameEventToasts() {
  const playerId = useSession((s) => s.me?.id ?? null);
  const player = useSession((s) => s.me ?? null);
  const round = useSession((s) => s.round ?? null);
  const activity = useSession((s) => s.recentActivity);
  const activityHydratedForPlayerId = useSession((s) => s.activityHydratedForPlayerId);
  const crackWord = useSession((s) => s.me?.products) ? 'crack' : 'product';
  const reducedMotion = useSession((s) => s.profileSettings.reducedMotion);
  const seen = useRef<Set<string>>(new Set());
  const seededFor = useRef<string | null>(null);
  const snapshotSeen = useRef<Set<string>>(new Set());
  const snapshotsSeededFor = useRef<string | null>(null);
  const [toasts, setToasts] = useState<GameEventToast[]>([]);

  useEffect(() => {
    if (!playerId) {
      seen.current = new Set();
      seededFor.current = null;
      snapshotSeen.current = new Set();
      snapshotsSeededFor.current = null;
      setToasts([]);
      return;
    }

    // refreshRound can identify the player before /game/me has loaded activity.
    // Do not seed from that temporary empty list or the first real snapshot will
    // replay historical notifications as if they happened live.
    if (activityHydratedForPlayerId !== playerId) return;

    if (seededFor.current !== playerId) {
      seen.current = new Set(activity.map((entry) => entry.id));
      seededFor.current = playerId;
      setToasts([]);
      return;
    }

    const fresh = activity
      .slice()
      .reverse()
      .filter((entry) => !seen.current.has(entry.id));
    for (const entry of fresh) seen.current.add(entry.id);

    const next = fresh.flatMap((entry) => {
      const toast = gameEventToastFor(entry, crackWord);
      return toast ? [{ ...toast, id: entry.id, notificationId: entry.id }] : [];
    });
    if (!next.length) return;

    setToasts((current) => [...current, ...next].slice(-MAX_VISIBLE_TOASTS));
  }, [activity, activityHydratedForPlayerId, crackWord, playerId]);

  useEffect(() => {
    if (!playerId) return;
    const signals = snapshotEventSignals(round, player);
    const activeKeys = new Set(signals.map((signal) => signal.key));

    if (snapshotsSeededFor.current !== playerId) {
      snapshotSeen.current = activeKeys;
      snapshotsSeededFor.current = playerId;
      return;
    }

    const next = signals
      .filter((signal) => !snapshotSeen.current.has(signal.key))
      .map((signal) => ({ ...signal.toast, id: `snapshot:${signal.key}` }));
    snapshotSeen.current = activeKeys;

    if (!next.length) return;
    setToasts((current) => [...current, ...next].slice(-MAX_VISIBLE_TOASTS));
  }, [playerId, player, round]);

  useEffect(() => {
    const handleTestPopup = (event: WindowEventMap['streets:test-popup']) => {
      const detail = event.detail;
      if (!detail?.title || !detail.detail) return;
      manualToastId += 1;
      const id = detail.id ?? `manual:${Date.now()}:${manualToastId}`;
      setToasts((current) => [
        ...current.filter((toast) => toast.id !== id),
        {
          id,
          title: detail.title,
          detail: detail.detail,
          tone: validTone(detail.tone),
          href: detail.href,
        },
      ].slice(-MAX_VISIBLE_TOASTS));
    };

    window.addEventListener('streets:test-popup', handleTestPopup);
    return () => window.removeEventListener('streets:test-popup', handleTestPopup);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const key = new URLSearchParams(window.location.search).get('testPopup');
    if (!key) return;
    const toast = testPopupForKey(key);
    if (!toast) return;
    const id = `test-popup:${key}`;
    setToasts((current) => [
      ...current.filter((entry) => entry.id !== id),
      { ...toast, id },
    ].slice(-MAX_VISIBLE_TOASTS));
  }, []);

  useEffect(() => {
    if (reducedMotion || !toasts.length) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((entry) => entry.id !== toast.id));
      }, TOAST_TTL_MS),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reducedMotion, toasts]);

  function acknowledge(toast: GameEventToast) {
    if (!toast.notificationId) return;
    void notificationsApi.read(toast.notificationId)
      .then(() => window.dispatchEvent(new Event('streets:notifications-changed')))
      .catch(() => undefined);
  }

  const rendered = useMemo(() => toasts.slice().reverse(), [toasts]);
  if (!rendered.length) return null;

  return (
    <div className="se-eventtoasts" aria-live="polite" aria-label="Game events">
      {rendered.map((toast) => {
        const body = (
          <>
            <span className="se-eventtoast__title">{toast.title}</span>
            <span className="se-eventtoast__detail">{toast.detail}</span>
          </>
        );
        return (
          <div className={`se-eventtoast se-eventtoast--${toast.tone}`} key={toast.id}>
            {toast.href ? <Link className="se-eventtoast__body" to={toast.href} onClick={() => acknowledge(toast)}>{body}</Link> : <span className="se-eventtoast__body">{body}</span>}
            <button
              type="button"
              className="se-eventtoast__close"
              aria-label="Dismiss event"
              onClick={() => {
                acknowledge(toast);
                setToasts((current) => current.filter((entry) => entry.id !== toast.id));
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
