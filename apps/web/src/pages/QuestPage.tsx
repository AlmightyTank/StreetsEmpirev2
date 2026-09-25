import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  formatCents,
  formatNumber,
  type PlayerQuestDto,
  type QuestPageDto,
} from '@streets/shared';
import { ApiError } from '../api/client.js';
import { questsApi } from '../api/quests.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { serverAdjustedNowMs, serverClockOffsetMs } from '../utils/time.js';

type Tab = 'available' | 'active' | 'ready' | 'tracked' | 'daily' | 'weekly' | 'city' | 'alliance' | 'events' | 'completed';

function tabFromSearch(search: string): Tab {
  const requested = new URLSearchParams(search).get('tab');
  return requested === 'daily'
    || requested === 'weekly'
    || requested === 'city'
    || requested === 'alliance'
    || requested === 'events'
    || requested === 'active'
    || requested === 'ready'
    || requested === 'tracked'
    || requested === 'completed'
    || requested === 'available'
    ? requested
    : 'available';
}


function focusedQuestKey(search: string, hash: string): string | null {
  const fromSearch = new URLSearchParams(search).get('focus');
  if (fromSearch) return fromSearch;
  if (!hash.startsWith('#quest-')) return null;
  try {
    return decodeURIComponent(hash.slice('#quest-'.length));
  } catch {
    return hash.slice('#quest-'.length);
  }
}

function tabForQuest(quest: PlayerQuestDto): Tab {
  if (quest.status === 'READY_TO_TURN_IN') return 'ready';
  if (quest.status === 'ACTIVE') return 'active';
  if (quest.status === 'COMPLETED' || quest.status === 'FAILED' || quest.status === 'EXPIRED') return 'completed';
  if (quest.type === 'DAILY') return 'daily';
  if (quest.type === 'WEEKLY') return 'weekly';
  if (quest.category === 'CITY_CONTRACT') return 'city';
  if (quest.type === 'ALLIANCE') return 'alliance';
  if (quest.type === 'EVENT') return 'events';
  return 'available';
}

function statusLabel(quest: PlayerQuestDto): string {
  switch (quest.status) {
    case 'READY_TO_TURN_IN': return 'Ready to collect';
    case 'ACTIVE': return 'In progress';
    case 'AVAILABLE': return 'Available';
    case 'LOCKED': return 'Locked';
    case 'COMPLETED': return 'Completed';
    case 'EXPIRED': return 'Expired';
    case 'FAILED': return 'Failed';
  }
}

function questKindLabel(quest: PlayerQuestDto): string {
  if (quest.category === 'CITY_CONTRACT') return 'City contract';
  if (quest.type === 'ALLIANCE') return 'Alliance contract';
  if (quest.type === 'EVENT') return 'Community event';
  if (quest.type === 'DAILY') return 'Daily contract';
  if (quest.type === 'WEEKLY') return 'Weekly contract';
  if (quest.type === 'SECRET') return 'Secret job';
  if (quest.type === 'SIDE') return 'Side job';
  if (quest.type === 'STORY') return 'Story';
  return quest.type;
}

function statusTone(status: PlayerQuestDto['status']): string {
  switch (status) {
    case 'READY_TO_TURN_IN': return 'ready';
    case 'ACTIVE': return 'active';
    case 'AVAILABLE': return 'available';
    case 'COMPLETED': return 'completed';
    case 'FAILED': return 'failed';
    case 'EXPIRED': return 'expired';
    case 'LOCKED': return 'locked';
  }
}

function formatProgress(current: number, target: number, format: 'NUMBER' | 'CURRENCY'): string {
  return format === 'CURRENCY'
    ? formatCents(current) + ' / ' + formatCents(target)
    : formatNumber(current) + ' / ' + formatNumber(target);
}

function timeRemaining(expiresAt: string, nowMs: number): string {
  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - nowMs);
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes <= 1) return 'less than a minute left';
  if (minutes < 60) return minutes + ' min left';
  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;
  if (hours < 24) return hours + 'h ' + leftoverMinutes + 'm left';
  const days = Math.floor(hours / 24);
  const leftoverHours = hours % 24;
  return days + 'd ' + leftoverHours + 'h left';
}

function QuestMetric({
  label,
  value,
  detail,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'warn' | 'accent';
  onClick?: () => void;
}) {
  const className = `se-quests-metric${tone ? ` se-quests-metric--${tone}` : ''}${onClick ? ' se-quests-metric--button' : ''}`;
  const body = (
    <>
      <span className="se-quests-metric__label">{label}</span>
      <strong className="se-quests-metric__value">{value}</strong>
      {detail ? <span className="se-quests-metric__detail">{detail}</span> : null}
    </>
  );

  return onClick ? (
    <button type="button" className={className} onClick={onClick}>{body}</button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function ProgressLine({
  label,
  current,
  target,
  format = 'NUMBER',
  completed = false,
  bonus = false,
}: {
  label: string;
  current: number;
  target: number;
  format?: 'NUMBER' | 'CURRENCY';
  completed?: boolean;
  bonus?: boolean;
}) {
  const percent = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;
  return (
    <div className={'se-quest-progress' + (completed ? ' se-quest-progress--complete' : '')}>
      <div className="se-quest-progress__head">
        <span className="se-quest-progress__label">{bonus ? 'Bonus · ' : ''}{label}</span>
        <span className="se-quest-progress__value">
          {completed ? 'Complete · ' : ''}{formatProgress(current, target, format)}
        </span>
      </div>
      <div
        className="se-quest-progress__meter"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(current, target)}
      >
        <span style={{ width: percent + '%' }} />
      </div>
    </div>
  );
}

function QuestCard({
  quest,
  page,
  busy,
  onAccept,
  onClaim,
  onTrack,
  onAbandon,
  nowMs,
}: {
  quest: PlayerQuestDto;
  page: QuestPageDto;
  busy: string | null;
  nowMs: number;
  onAccept: (key: string) => void;
  onClaim: (key: string, branchKey?: string, branchTitle?: string) => void;
  onTrack: (key: string, tracked: boolean) => void;
  onAbandon: (key: string) => void;
}) {
  const active = quest.status === 'ACTIVE' || quest.status === 'READY_TO_TURN_IN';
  const trackedCount = page.quests.filter((item) => item.isTracked).length;

  return (
    <Panel
      id={`quest-${quest.key}`}
      className={'se-quest-card'
        + (quest.status === 'READY_TO_TURN_IN' ? ' se-quest-card--ready' : '')
        + (quest.isTracked ? ' se-quest-card--tracked' : '')}
      title={quest.title}
      aside={(
        <div className="se-quest-card__meta">
          <span className="se-quest-kind">{quest.contactName ?? 'StreetsEmpire'} · {questKindLabel(quest)}</span>
          {quest.isTracked ? <span className="se-quest-status se-quest-status--tracked">Tracked</span> : null}
          <span className={'se-quest-status se-quest-status--' + statusTone(quest.status)}>{statusLabel(quest)}</span>
        </div>
      )}
    >
      <p className="se-hint se-quest-card__desc">{quest.description}</p>
      {quest.seasonalEvent ? (
        <div className="se-quest-seasonal">
          <span className="se-eyebrow">{quest.seasonalEvent.label ?? 'Seasonal event'}</span>
          <span className="se-hint">
            {new Date(quest.seasonalEvent.startsAt).toLocaleDateString(undefined, { timeZone: 'UTC' })} – {new Date(new Date(quest.seasonalEvent.endsAt).getTime() - 86_400_000).toLocaleDateString(undefined, { timeZone: 'UTC' })}
          </span>
        </div>
      ) : null}
      {quest.allianceContract ? (
        <div className="se-quest-objectives">
          <ProgressLine
            label={'Your contribution · ' + quest.allianceContract.contributionLabel}
            current={quest.allianceContract.contributionCurrent}
            target={quest.allianceContract.contributionTarget}
            format={quest.allianceContract.contributionFormat}
            completed={quest.allianceContract.contributionCompleted}
          />
        </div>
      ) : null}
      {quest.communityEvent ? (
        <div className="se-quest-objectives">
          <ProgressLine
            label={'Your contribution · ' + quest.communityEvent.contributionLabel}
            current={quest.communityEvent.contributionCurrent}
            target={quest.communityEvent.contributionTarget}
            format={quest.communityEvent.contributionFormat}
            completed={quest.communityEvent.contributionCurrent >= quest.communityEvent.contributionTarget}
          />
        </div>
      ) : null}
      <div className="se-quest-objectives">
        {quest.objectives.map((objective) => (
          <ProgressLine
            key={objective.id}
            label={objective.description}
            current={objective.current}
            target={objective.target}
            format={objective.kind === 'EARN_CASH' || objective.format === 'CURRENCY' ? 'CURRENCY' : 'NUMBER'}
            completed={objective.completed}
            bonus={objective.bonus}
          />
        ))}
      </div>

      {quest.rewards.length ? (
        <div className="se-quest-reward-block">
          <p className="se-eyebrow">{quest.branchChoices.length ? 'Shared rewards' : 'Rewards'}</p>
          <div className="se-quest-rewards">
            {quest.rewards.map((reward, index) => (
              <span className="se-quest-reward" key={reward.kind + ':' + (reward.key ?? index)}>{reward.label}</span>
            ))}
          </div>
        </div>
      ) : null}

      {quest.status === 'READY_TO_TURN_IN' && quest.branchChoices.length ? (
        <div className="se-quest-reward-block">
          <p className="se-eyebrow">Choose a side · permanent for this round</p>
          {quest.branchChoices.map((choice) => (
            <div key={choice.key} className="se-mb">
              <Row label={choice.title} value={choice.description} strong />
              <div className="se-quest-rewards">
                {choice.rewards.map((reward, index) => (
                  <span className="se-quest-reward" key={choice.key + ':' + reward.kind + ':' + (reward.key ?? index)}>
                    {reward.label}
                  </span>
                ))}
                {choice.reputationDeltas.map((delta) => (
                  <span className="se-quest-reward" key={choice.key + ':rep:' + delta.contactKey}>
                    {delta.label}
                  </span>
                ))}
              </div>
              <Button
                className="se-btn se-btn--primary"
                disabledReason={busy}
                onClick={() => onClaim(quest.key, choice.key, choice.title)}
              >
                {choice.title}
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {quest.chosenBranch ? (
        <p className="se-hint">
          Choice locked: {quest.branchChoices.find((choice) => choice.key === quest.chosenBranch)?.title ?? quest.chosenBranch}.
        </p>
      ) : null}

      <div className="se-actions se-quest-actions">
        {quest.status === 'AVAILABLE' ? (
          <Button
            className="se-btn se-btn--primary"
            disabledReason={busy ?? (!['ALLIANCE', 'EVENT'].includes(quest.type) && page.counts.active >= page.activeLimit
              ? 'You already have ' + page.activeLimit + ' active jobs.'
              : null)}
            onClick={() => onAccept(quest.key)}
          >
            Accept job
          </Button>
        ) : null}

        {quest.status === 'READY_TO_TURN_IN' && !quest.branchChoices.length ? (
          <Button className="se-btn se-btn--primary" disabledReason={busy} onClick={() => onClaim(quest.key)}>
            Collect payment
          </Button>
        ) : null}

        {active ? (
          <>
            <Button
              className="se-btn"
              disabledReason={busy ?? (!quest.isTracked && trackedCount >= page.trackedLimit
                ? 'You can only track ' + page.trackedLimit + ' jobs.'
                : null)}
              onClick={() => onTrack(quest.key, !quest.isTracked)}
            >
              {quest.isTracked ? 'Stop tracking' : 'Track job'}
            </Button>
            {!['ALLIANCE', 'EVENT'].includes(quest.type) ? (
              <Button className="se-btn se-btn--ghost" disabledReason={busy} onClick={() => onAbandon(quest.key)}>
                Abandon
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {quest.expiresAt ? (
        <p className="se-hint se-quest-expiry">
          {quest.category === 'CITY_CONTRACT' ? 'City board refreshes ' : quest.type === 'ALLIANCE' ? 'Alliance board resets ' : quest.type === 'EVENT' ? (quest.seasonalEvent ? 'Job expires ' : 'Event ends ') : quest.type === 'DAILY' ? 'Daily board resets ' : quest.type === 'WEEKLY' ? 'Weekly board resets ' : 'Expires '}
          {new Date(quest.expiresAt).toLocaleString()} · {timeRemaining(quest.expiresAt, nowMs)}.
        </p>
      ) : null}
    </Panel>
  );
}

export function QuestPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useSession((state) => state.me);
  const refreshSnapshot = useSession((state) => state.refreshSnapshot);
  const [page, setPage] = useState<QuestPageDto | null>(null);
  const [tab, setTab] = useState<Tab>(() => tabFromSearch(location.search));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const applyPage = useCallback((
    next: QuestPageDto,
    requestStartedAtMs: number,
    responseReceivedAtMs: number,
  ) => {
    const offset = serverClockOffsetMs(next.serverTime, requestStartedAtMs, responseReceivedAtMs);
    setClockOffsetMs(offset);
    setNowMs(serverAdjustedNowMs(responseReceivedAtMs, offset));
    setPage(next);
  }, []);

  const load = useCallback(async () => {
    const requestStartedAtMs = Date.now();
    try {
      const next = await questsApi.page();
      const responseReceivedAtMs = Date.now();
      applyPage(next, requestStartedAtMs, responseReceivedAtMs);
      setError(null);
    } catch {
      setError('Could not load jobs right now. Try again.');
    }
  }, [applyPage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setNowMs(serverAdjustedNowMs(Date.now(), clockOffsetMs)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [clockOffsetMs]);

  useEffect(() => {
    const focusKey = focusedQuestKey(location.search, location.hash);
    const focused = focusKey && page
      ? page.quests.find((quest) => quest.key === focusKey)
      : null;
    const nextTab = focused ? tabForQuest(focused) : tabFromSearch(location.search);
    setTab(nextTab);

    // Notification links may only know a quest key. Once the page is loaded,
    // resolve that quest to the board it actually belongs on and keep the URL
    // honest so a refresh lands in the same place.
    if (focused && tabFromSearch(location.search) !== nextTab) {
      const params = new URLSearchParams(location.search);
      params.set('tab', nextTab);
      params.set('focus', focused.key);
      navigate({
        pathname: location.pathname,
        search: '?' + params.toString(),
        hash: '#quest-' + encodeURIComponent(focused.key),
      }, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate, page]);

  useEffect(() => {
    const serverNow = serverAdjustedNowMs(Date.now(), clockOffsetMs);
    const eventTransitions = page?.quests
      .filter((quest) => quest.type === 'EVENT' && quest.expiresAt)
      .map((quest) => quest.expiresAt!) ?? [];
    const resetAt = [
      page?.dailyContracts.resetAt,
      page?.weeklyContracts.resetAt,
      page?.cityContracts.resetAt,
      ...eventTransitions,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => value > serverNow)
      .sort((left, right) => left - right)[0];
    if (!resetAt) return;

    const delay = resetAt - serverNow + 250;
    const timer = window.setTimeout(() => void load(), delay);
    return () => window.clearTimeout(timer);
  }, [page?.dailyContracts.resetAt, page?.weeklyContracts.resetAt, page?.cityContracts.resetAt, page?.quests, clockOffsetMs, load]);

  useEffect(() => {
    if (!page || !location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    // The selected board can change in the same render as a notification
    // deep-link. Wait one frame for the quest card to exist, then land on the
    // card itself. CSS scroll-margin keeps it clear of the sticky phone header.
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ block: 'start' });
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page, tab, location.hash]);

  const dailyToday = useMemo(
    () => page?.quests.filter((quest) =>
      quest.type === 'DAILY'
      && quest.expiresAt !== null
      && new Date(quest.expiresAt).getTime() > nowMs
    ) ?? [],
    [page, nowMs],
  );

  const weeklyToday = useMemo(
    () => page?.quests.filter((quest) =>
      quest.type === 'WEEKLY'
      && quest.expiresAt !== null
      && new Date(quest.expiresAt).getTime() > nowMs
    ) ?? [],
    [page, nowMs],
  );

  const cityToday = useMemo(
    () => page?.quests.filter((quest) =>
      quest.category === 'CITY_CONTRACT'
      && quest.expiresAt !== null
      && new Date(quest.expiresAt).getTime() > nowMs
    ) ?? [],
    [page, nowMs],
  );

  const allianceToday = useMemo(
    () => page?.quests.filter((quest) =>
      quest.type === 'ALLIANCE'
      && !['EXPIRED', 'FAILED'].includes(quest.status)
      && quest.expiresAt !== null
      && new Date(quest.expiresAt).getTime() > nowMs
    ) ?? [],
    [page, nowMs],
  );

  const eventToday = useMemo(
    () => page?.quests.filter((quest) =>
      quest.type === 'EVENT'
      && !['EXPIRED', 'FAILED'].includes(quest.status)
      && (
        (quest.seasonalEvent && quest.status === 'AVAILABLE')
        || (quest.expiresAt !== null && new Date(quest.expiresAt).getTime() > nowMs)
      )
    ) ?? [],
    [page, nowMs],
  );

  const standardAvailableCount = useMemo(
    () => page?.quests.filter((quest) =>
      quest.status === 'AVAILABLE'
      && quest.type !== 'DAILY'
      && quest.type !== 'WEEKLY'
      && quest.type !== 'ALLIANCE'
      && quest.type !== 'EVENT'
      && quest.category !== 'CITY_CONTRACT'
    ).length ?? 0,
    [page],
  );

  const activeQuestCount = useMemo(
    () => page?.quests.filter((quest) => ['ACTIVE', 'READY_TO_TURN_IN'].includes(quest.status)).length ?? 0,
    [page],
  );

  const readyToday = useMemo(
    () => page?.quests.filter((quest) => quest.status === 'READY_TO_TURN_IN') ?? [],
    [page],
  );

  const trackedToday = useMemo(
    () => page?.quests.filter((quest) => quest.isTracked && ['ACTIVE', 'READY_TO_TURN_IN'].includes(quest.status)) ?? [],
    [page],
  );

  const shown = useMemo(() => {
    if (!page) return [];
    if (tab === 'daily') return dailyToday;
    if (tab === 'weekly') return weeklyToday;
    if (tab === 'city') return cityToday;
    if (tab === 'alliance') return allianceToday;
    if (tab === 'events') return eventToday;
    if (tab === 'active') return page.quests.filter((quest) => ['ACTIVE', 'READY_TO_TURN_IN'].includes(quest.status));
    if (tab === 'ready') return readyToday;
    if (tab === 'tracked') return trackedToday;
    if (tab === 'completed') return page.quests.filter((quest) => ['COMPLETED', 'FAILED', 'EXPIRED'].includes(quest.status));
    return page.quests.filter((quest) =>
      quest.status === 'AVAILABLE'
      && quest.type !== 'DAILY'
      && quest.type !== 'WEEKLY'
      && quest.type !== 'ALLIANCE'
      && quest.type !== 'EVENT'
      && quest.category !== 'CITY_CONTRACT'
    );
  }, [page, tab, dailyToday, weeklyToday, cityToday, allianceToday, eventToday, readyToday, trackedToday]);

  const sortedShown = useMemo(
    () => [...shown].sort((left, right) => {
      const weight = (quest: PlayerQuestDto) =>
        quest.status === 'READY_TO_TURN_IN' ? 0
          : quest.isTracked ? 1
            : quest.status === 'ACTIVE' ? 2
              : quest.status === 'AVAILABLE' ? 3
                : 4;
      return weight(left) - weight(right) || left.title.localeCompare(right.title);
    }),
    [shown],
  );

  const liveFavors = useMemo(
    () => page?.activeFavors.filter((favor) => new Date(favor.expiresAt).getTime() > nowMs) ?? [],
    [page, nowMs],
  );

  function selectTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(location.search);
    params.set('tab', next);
    // A notification deep-link can leave ?focus=<quest> behind. Once the
    // player deliberately chooses another board, that focus must stop
    // overriding their tab selection.
    params.delete('focus');
    navigate({
      pathname: location.pathname,
      search: '?' + params.toString(),
      hash: '',
    }, { replace: true });
  }

  async function mutate(key: string, action: () => Promise<QuestPageDto>, success?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const requestStartedAtMs = Date.now();
    try {
      const next = await action();
      const responseReceivedAtMs = Date.now();
      applyPage(next, requestStartedAtMs, responseReceivedAtMs);
      window.dispatchEvent(new Event('streets:quests-changed'));
      if (success) setNotice(success);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That job could not be updated.');
    } finally {
      setBusy(null);
    }
  }

  async function claim(key: string, branchKey?: string, branchTitle?: string) {
    if (branchKey) {
      const confirmed = window.confirm(
        'Choose "' + (branchTitle ?? branchKey) + '"? This choice is permanent for this round and locks the other follow-up path.',
      );
      if (!confirmed) return;
    }
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await questsApi.claim(key, crypto.randomUUID(), branchKey);
      setNotice(
        result.result.title
        + ' complete — payment collected.'
        + (result.result.chosenBranch ? ' Choice locked: ' + (branchTitle ?? result.result.chosenBranch) + '.' : ''),
      );
      window.dispatchEvent(new Event('streets:quests-changed'));
      await Promise.all([load(), refreshSnapshot()]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Payment could not be collected.');
    } finally {
      setBusy(null);
    }
  }

  async function activateFavor(key: string) {
    setBusy('favor:' + key);
    setError(null);
    setNotice(null);
    try {
      const result = await questsApi.activateFavor(key, crypto.randomUUID());
      setNotice(result.result.name + ' is active until ' + new Date(result.result.expiresAt).toLocaleTimeString() + '.');
      window.dispatchEvent(new Event('streets:quests-changed'));
      await Promise.all([load(), refreshSnapshot()]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That favor could not be activated.');
    } finally {
      setBusy(null);
    }
  }

  async function armFavor(key: string) {
    setBusy('favor:' + key);
    setError(null);
    setNotice(null);
    try {
      const result = await questsApi.armFavor(key, crypto.randomUUID());
      setNotice(result.result.name + ' is armed for the next eligible action.');
      window.dispatchEvent(new Event('streets:quests-changed'));
      await Promise.all([load(), refreshSnapshot()]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That favor could not be armed.');
    } finally {
      setBusy(null);
    }
  }

  async function disarmFavor(key: string) {
    setBusy('favor:' + key);
    setError(null);
    setNotice(null);
    try {
      const result = await questsApi.disarmFavor(key, crypto.randomUUID());
      setNotice(result.result.name + ' returned to your favor inventory.');
      window.dispatchEvent(new Event('streets:quests-changed'));
      await Promise.all([load(), refreshSnapshot()]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That favor could not be disarmed.');
    } finally {
      setBusy(null);
    }
  }

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-quests">
        <header className="se-quests-hero">
          <div className="se-quests-hero__copy">
            <span className="se-eyebrow">Underworld contract desk</span>
            <h1>Quests</h1>
            <p>Pick work, track live objectives, collect finished jobs, and manage the favors and permanent access your contacts have paid out this round.</p>
          </div>

          <div className="se-quests-hero__side">
            <div className="se-quests-hero__actions">
              <Button
                className="se-btn se-btn--ghost se-btn--sm"
                disabledReason={busy ? 'Another job update is still going through.' : null}
                onClick={() => void load()}
              >
                Refresh jobs
              </Button>
              <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/reputation">Contact standing</Link>
            </div>
            <div className="se-quests-hero__readout">
              <span>
                <small>Ready</small>
                <strong>{page ? formatNumber(page.counts.ready) : '—'}</strong>
              </span>
              <span>
                <small>Active</small>
                <strong>{page ? `${formatNumber(page.counts.active)} / ${formatNumber(page.activeLimit)}` : '—'}</strong>
              </span>
              <span>
                <small>Tracked</small>
                <strong>{page ? `${formatNumber(trackedToday.length)} / ${formatNumber(page.trackedLimit)}` : '—'}</strong>
              </span>
              <span>
                <small>Completed</small>
                <strong>{page ? formatNumber(page.counts.completed) : '—'}</strong>
              </span>
            </div>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}

        {page ? (
          <>
            <section className="se-quests-boardnav">
              <div className="se-quests-sectionhead">
                <div>
                  <span className="se-eyebrow">Contract board</span>
                  <h2>Choose your work</h2>
                </div>
                <p>Ready jobs stay visible from their own queue, while rotating boards keep their server-authoritative reset clocks.</p>
              </div>

              <div className="se-quests-quick">
                <QuestMetric
                  label="Ready to collect"
                  value={formatNumber(page.counts.ready)}
                  detail="finished jobs waiting on payment"
                  tone={page.counts.ready > 0 ? 'accent' : undefined}
                  onClick={() => selectTab('ready')}
                />
                <QuestMetric
                  label="Personal active"
                  value={`${formatNumber(page.counts.active)} / ${formatNumber(page.activeLimit)}`}
                  detail="alliance and events do not use slots"
                  tone={page.counts.active >= page.activeLimit ? 'warn' : undefined}
                  onClick={() => selectTab('active')}
                />
                <QuestMetric
                  label="Tracked"
                  value={`${formatNumber(trackedToday.length)} / ${formatNumber(page.trackedLimit)}`}
                  detail="pinned into your game HUD"
                  onClick={() => selectTab('tracked')}
                />
                <QuestMetric
                  label="Stored favors"
                  value={formatNumber(page.favors.reduce((sum, favor) => sum + favor.quantity, 0))}
                  detail={liveFavors.length || page.armedFavors.length ? `${liveFavors.length} active · ${page.armedFavors.length} armed` : 'none active or armed'}
                  tone={liveFavors.length || page.armedFavors.length ? 'good' : undefined}
                />
              </div>

              <div className="se-quests-tabs" role="tablist" aria-label="Quest view">
                {([
                  ['available', 'Available', standardAvailableCount],
                  ['active', 'Active', activeQuestCount],
                  ['ready', 'Ready', readyToday.length],
                  ['tracked', 'Tracked', trackedToday.length],
                  ...(page.dailyContracts.enabled ? [['daily', 'Daily', dailyToday.length] as const] : []),
                  ...(page.weeklyContracts.enabled ? [['weekly', 'Weekly', weeklyToday.length] as const] : []),
                  ...(page.cityContracts.enabled ? [['city', 'City', cityToday.length] as const] : []),
                  ...(allianceToday.length ? [['alliance', 'Alliance', allianceToday.length] as const] : []),
                  ...(eventToday.length ? [['events', 'Events', eventToday.length] as const] : []),
                  ['completed', 'Completed', page.counts.completed],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    className={`se-quests-tabs__tab${tab === key ? ' se-quests-tabs__tab--active' : ''}${key === 'ready' && readyToday.length ? ' se-quests-tabs__tab--ready' : ''}`}
                    onClick={() => selectTab(key)}
                  >
                    <span>{label}</span>
                    <strong>{formatNumber(count)}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="se-quests-work">
              <div className="se-quests-work__main">
                <div className="se-quests-sectionhead">
                  <div>
                    <span className="se-eyebrow">Selected board</span>
                    <h2>{
                      tab === 'available' ? 'Available jobs'
                        : tab === 'active' ? 'Active jobs'
                          : tab === 'ready' ? 'Ready to collect'
                            : tab === 'tracked' ? 'Tracked jobs'
                              : tab === 'daily' ? 'Daily contracts'
                                : tab === 'weekly' ? 'Weekly contracts'
                                  : tab === 'city' ? 'City contracts'
                                    : tab === 'alliance' ? 'Alliance contracts'
                                      : tab === 'events' ? 'Community events'
                                        : 'Completed jobs'
                    }</h2>
                  </div>
                  <span className="se-quests-sectionhead__meta">{formatNumber(sortedShown.length)} shown</span>
                </div>

                {(tab === 'daily' && page.dailyContracts.resetAt)
                  || (tab === 'weekly' && page.weeklyContracts.resetAt)
                  || (tab === 'city' && page.cityContracts.resetAt)
                  ? (
                    <div className="se-quests-boardclock">
                      <span>{
                        tab === 'daily' ? 'Daily board resets'
                          : tab === 'weekly' ? 'Weekly board resets'
                            : 'City board refreshes'
                      }</span>
                      <strong>{
                        timeRemaining(
                          tab === 'daily'
                            ? page.dailyContracts.resetAt!
                            : tab === 'weekly'
                              ? page.weeklyContracts.resetAt!
                              : page.cityContracts.resetAt!,
                          nowMs,
                        )
                      }</strong>
                    </div>
                  ) : null}

                <div className="se-quest-list se-quests-list">
                  {sortedShown.length ? sortedShown.map((quest) => (
                    <QuestCard
                      key={quest.key + ':' + quest.attempt}
                      quest={quest}
                      page={page}
                      busy={busy ? 'Another job update is still going through.' : null}
                      nowMs={nowMs}
                      onAccept={(key) => void mutate(key, () => questsApi.accept(key, crypto.randomUUID()), 'Job accepted.')}
                      onClaim={(key, branchKey, branchTitle) => void claim(key, branchKey, branchTitle)}
                      onTrack={(key, tracked) => void mutate(key, () => questsApi.track(key, tracked))}
                      onAbandon={(key) => void mutate(key, () => questsApi.abandon(key), 'Job abandoned.')}
                    />
                  )) : (
                    <div className="se-quests-empty">
                      <strong>No jobs in this section.</strong>
                      <span>Pick another board above or check back after its next rotation.</span>
                    </div>
                  )}
                </div>
              </div>

              <aside className="se-quests-work__rail">
                <Panel title="Board status" className="se-quests-panel">
                  <div className="se-quests-boardstatus">
                    <div>
                      <span>Available</span>
                      <strong>{formatNumber(standardAvailableCount)}</strong>
                    </div>
                    {page.dailyContracts.enabled ? (
                      <button type="button" onClick={() => selectTab('daily')}>
                        <span>Daily board</span>
                        <strong>{formatNumber(dailyToday.length)} / {formatNumber(page.dailyContracts.slots)}</strong>
                        {page.dailyContracts.resetAt ? <small>{timeRemaining(page.dailyContracts.resetAt, nowMs)}</small> : null}
                      </button>
                    ) : null}
                    {page.weeklyContracts.enabled ? (
                      <button type="button" onClick={() => selectTab('weekly')}>
                        <span>Weekly board</span>
                        <strong>{formatNumber(weeklyToday.length)} / {formatNumber(page.weeklyContracts.slots)}</strong>
                        {page.weeklyContracts.resetAt ? <small>{timeRemaining(page.weeklyContracts.resetAt, nowMs)}</small> : null}
                      </button>
                    ) : null}
                    {page.cityContracts.enabled ? (
                      <button type="button" onClick={() => selectTab('city')}>
                        <span>City board</span>
                        <strong>{formatNumber(cityToday.length)} / {formatNumber(page.cityContracts.slots)}</strong>
                        {page.cityContracts.resetAt ? <small>{timeRemaining(page.cityContracts.resetAt, nowMs)}</small> : null}
                      </button>
                    ) : null}
                    {allianceToday.length ? (
                      <button type="button" onClick={() => selectTab('alliance')}>
                        <span>Alliance</span>
                        <strong>{formatNumber(allianceToday.length)}</strong>
                        <small>shared contracts</small>
                      </button>
                    ) : null}
                    {eventToday.length ? (
                      <button type="button" onClick={() => selectTab('events')}>
                        <span>Events</span>
                        <strong>{formatNumber(eventToday.length)}</strong>
                        <small>community work</small>
                      </button>
                    ) : null}
                  </div>
                </Panel>

                <Panel title="Contacts" className="se-quests-panel">
                  <div className="se-quests-contacts">
                    {page.contacts.map((contact) => (
                      <div key={contact.key}>
                        <span>{contact.shortName}</span>
                        <strong>{contact.standing}</strong>
                        <small>{contact.role} · {formatNumber(contact.points)} rep</small>
                      </div>
                    ))}
                  </div>
                </Panel>
              </aside>
            </section>

            <section className="se-quests-progression">
              <div className="se-quests-sectionhead">
                <div>
                  <span className="se-eyebrow">Progression desk</span>
                  <h2>Favors & permanent access</h2>
                </div>
                <p>Manage temporary advantages separately from the contract board so favor actions never get buried between job cards.</p>
              </div>

              <div className="se-quests-progression__grid">
                <div className="se-quests-stack">
                  <Panel title="Favor inventory" aside={page.favors.length ? `${formatNumber(page.favors.length)} types` : 'Empty'} className="se-quests-panel">
                    {page.favors.length ? (
                      <div className="se-quests-favors">
                        {page.favors.map((favor) => {
                          const active = liveFavors.find((item) => item.category === favor.category);
                          const armed = page.armedFavors.find((item) => item.category === favor.category);
                          return (
                            <article key={favor.key} className={`se-quests-favor${favor.rarity === 'LEGENDARY' ? ' se-quests-favor--legendary' : ''}`}>
                              <div className="se-quests-favor__head">
                                <div>
                                  <span className="se-eyebrow">{favor.rarity === 'LEGENDARY' ? '★ Legendary favor' : favor.category}</span>
                                  <h3>{favor.name}</h3>
                                </div>
                                <strong className="se-num">×{formatNumber(favor.quantity)}</strong>
                              </div>
                              <p>{favor.description}</p>
                              <div className="se-quests-favor__meta">
                                <span>{favor.category}</span>
                                <span>{favor.activationKind === 'TIMED' && favor.durationMinutes ? `${formatNumber(favor.durationMinutes)} min` : 'Single use'}</span>
                              </div>
                              {favor.activationKind === 'TIMED' && favor.activatable ? (
                                <Button
                                  className="se-btn se-btn--primary se-btn--sm"
                                  disabledReason={
                                    busy
                                      ? 'Another update is still going through.'
                                      : active
                                        ? active.name + ' already occupies ' + favor.category + ' until ' + new Date(active.expiresAt).toLocaleTimeString() + '.'
                                        : null
                                  }
                                  onClick={() => void activateFavor(favor.key)}
                                >
                                  Activate
                                </Button>
                              ) : favor.activationKind === 'SINGLE_USE' && favor.activatable ? (
                                armed?.key === favor.key ? (
                                  <Button
                                    className="se-btn se-btn--ghost se-btn--sm"
                                    disabledReason={busy ? 'Another update is still going through.' : null}
                                    onClick={() => void disarmFavor(favor.key)}
                                  >
                                    Disarm
                                  </Button>
                                ) : (
                                  <Button
                                    className="se-btn se-btn--primary se-btn--sm"
                                    disabledReason={
                                      busy
                                        ? 'Another update is still going through.'
                                        : armed
                                          ? armed.name + ' is already armed in ' + favor.category + '. Disarm it first.'
                                          : null
                                    }
                                    onClick={() => void armFavor(favor.key)}
                                  >
                                    Arm favor
                                  </Button>
                                )
                              ) : (
                                <span className="se-hint">Stored for this round; this effect is not activatable here.</span>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    ) : <p className="se-muted">No favors stored yet.</p>}
                  </Panel>

                  <Panel title="Permanent unlocks" aside="This round" className="se-quests-panel">
                    <div className="se-rows">
                      {page.permanentUnlocks.length ? page.permanentUnlocks.map((unlock) => (
                        <Row
                          key={unlock.key}
                          label={unlock.name}
                          value={unlock.category + (unlock.sourceQuestKey ? ' · ' + unlock.sourceQuestKey.replaceAll('_', ' ') : '')}
                        />
                      )) : <Row label="Earned this round" value="None yet" />}
                    </div>
                  </Panel>
                </div>

                <div className="se-quests-stack">
                  <Panel title="Active favors" aside={liveFavors.length ? `${formatNumber(liveFavors.length)} running` : 'None'} className="se-quests-panel">
                    {liveFavors.length ? (
                      <div className="se-quests-livefavors">
                        {liveFavors.map((favor) => (
                          <div key={favor.category}>
                            <span>{favor.name}</span>
                            <strong>{favor.category}</strong>
                            <small>{timeRemaining(favor.expiresAt, nowMs)}</small>
                          </div>
                        ))}
                      </div>
                    ) : <p className="se-muted">No timed favor is active.</p>}
                    <p className="se-hint se-mt">Timers use server time and continue while you are logged out.</p>
                  </Panel>

                  <Panel title="Armed favors" aside={page.armedFavors.length ? `${formatNumber(page.armedFavors.length)} waiting` : 'None'} className="se-quests-panel">
                    {page.armedFavors.length ? (
                      <div className="se-quests-armed">
                        {page.armedFavors.map((favor) => (
                          <div key={favor.category}>
                            <div>
                              <span>{favor.name}</span>
                              <small>{favor.category} · next eligible action</small>
                            </div>
                            <Button
                              className="se-btn se-btn--ghost se-btn--sm"
                              disabledReason={busy ? 'Another update is still going through.' : null}
                              onClick={() => void disarmFavor(favor.key)}
                            >
                              Disarm
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : <p className="se-muted">No single-use favor is armed.</p>}
                    <p className="se-hint se-mt">An armed favor is only consumed when its matching action succeeds.</p>
                  </Panel>
                </div>
              </div>
            </section>
          </>
        ) : !error ? (
          <div className="se-quests-loading" role="status">Checking the street for work...</div>
        ) : null}
      </div>
    </GameLayout>
  );
}