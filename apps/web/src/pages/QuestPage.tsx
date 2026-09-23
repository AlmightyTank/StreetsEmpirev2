import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
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

type Tab = 'available' | 'daily' | 'weekly' | 'city' | 'alliance' | 'events' | 'active' | 'completed';

function tabFromSearch(search: string): Tab {
  const requested = new URLSearchParams(search).get('tab');
  return requested === 'daily' || requested === 'weekly' || requested === 'city' || requested === 'alliance' || requested === 'events' || requested === 'active' || requested === 'completed' || requested === 'available'
    ? requested
    : 'available';
}

function formatObjective(objective: PlayerQuestDto['objectives'][number]): string {
  if (objective.kind === 'EARN_CASH' || objective.format === 'CURRENCY') {
    return formatCents(objective.current) + ' / ' + formatCents(objective.target);
  }
  return formatNumber(objective.current) + ' / ' + formatNumber(objective.target);
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

function QuestCard({
  quest,
  page,
  busy,
  onAccept,
  onClaim,
  onTrack,
  onAbandon,
}: {
  quest: PlayerQuestDto;
  page: QuestPageDto;
  busy: string | null;
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
      className="se-quest-card"
      title={quest.title}
      aside={<span className="se-num se-dim">{quest.contactName ?? 'StreetsEmpire'} · {quest.category === 'CITY_CONTRACT' ? 'City contract' : quest.type === 'ALLIANCE' ? 'Alliance contract' : quest.type === 'EVENT' ? 'Community event' : quest.type === 'DAILY' ? 'Daily contract' : quest.type === 'WEEKLY' ? 'Weekly contract' : quest.type === 'SECRET' ? 'Secret job' : quest.type === 'SIDE' ? 'Side job' : quest.type === 'STORY' ? 'Story' : quest.type} · {statusLabel(quest)}</span>}
    >
      <p className="se-hint se-quest-card__desc">{quest.description}</p>
      {quest.communityEvent ? (
        <div className="se-rows se-quest-objectives">
          <Row
            label={'Your contribution · ' + quest.communityEvent.contributionLabel}
            value={
              (quest.communityEvent.contributionFormat === 'CURRENCY'
                ? formatCents(quest.communityEvent.contributionCurrent)
                : formatNumber(quest.communityEvent.contributionCurrent))
              + ' / '
              + (quest.communityEvent.contributionFormat === 'CURRENCY'
                ? formatCents(quest.communityEvent.contributionTarget)
                : formatNumber(quest.communityEvent.contributionTarget))
            }
            strong={quest.communityEvent.contributionCurrent >= quest.communityEvent.contributionTarget}
          />
        </div>
      ) : null}
      <div className="se-rows se-quest-objectives">
        {quest.objectives.map((objective) => (
          <Row
            key={objective.id}
            label={(objective.bonus ? 'Bonus · ' : '') + objective.description}
            value={objective.completed ? 'Complete' : formatObjective(objective)}
            strong={objective.completed}
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

      {quest.expiresAt ? <p className="se-hint">{quest.category === 'CITY_CONTRACT' ? 'City board refreshes ' : quest.type === 'ALLIANCE' ? 'Alliance board resets ' : quest.type === 'EVENT' ? 'Event ends ' : quest.type === 'DAILY' ? 'Daily board resets ' : quest.type === 'WEEKLY' ? 'Weekly board resets ' : 'Expires '}{new Date(quest.expiresAt).toLocaleString()}.</p> : null}
    </Panel>
  );
}

export function QuestPage() {
  const location = useLocation();
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
    const timer = window.setInterval(
      () => setNowMs(serverAdjustedNowMs(Date.now(), clockOffsetMs)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [clockOffsetMs]);

  useEffect(() => {
    setTab(tabFromSearch(location.search));
  }, [location.search]);

  useEffect(() => {
    const resetAt = [
      page?.dailyContracts.resetAt,
      page?.weeklyContracts.resetAt,
      page?.cityContracts.resetAt,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .sort((left, right) => left - right)[0];
    if (!resetAt) return;

    const delay = resetAt - serverAdjustedNowMs(Date.now(), clockOffsetMs) + 250;
    if (delay <= 0) {
      void load();
      return;
    }
    const timer = window.setTimeout(() => void load(), delay);
    return () => window.clearTimeout(timer);
  }, [page?.dailyContracts.resetAt, page?.weeklyContracts.resetAt, page?.cityContracts.resetAt, clockOffsetMs, load]);

  useEffect(() => {
    if (!page || !location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
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
      && quest.expiresAt !== null
      && new Date(quest.expiresAt).getTime() > nowMs
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

  const shown = useMemo(() => {
    if (!page) return [];
    if (tab === 'daily') return dailyToday;
    if (tab === 'weekly') return weeklyToday;
    if (tab === 'city') return cityToday;
    if (tab === 'alliance') return allianceToday;
    if (tab === 'events') return eventToday;
    if (tab === 'active') return page.quests.filter((quest) => ['ACTIVE', 'READY_TO_TURN_IN'].includes(quest.status));
    if (tab === 'completed') return page.quests.filter((quest) => ['COMPLETED', 'FAILED', 'EXPIRED'].includes(quest.status));
    return page.quests.filter((quest) =>
      quest.status === 'AVAILABLE'
      && quest.type !== 'DAILY'
      && quest.type !== 'WEEKLY'
      && quest.type !== 'ALLIANCE'
      && quest.type !== 'EVENT'
      && quest.category !== 'CITY_CONTRACT'
    );
  }, [page, tab, dailyToday, weeklyToday, cityToday, allianceToday, eventToday]);

  const liveFavors = useMemo(
    () => page?.activeFavors.filter((favor) => new Date(favor.expiresAt).getTime() > nowMs) ?? [],
    [page, nowMs],
  );

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
      <div className="se-questpage">
        <div className="se-pagehead se-questpage__head">
          <div>
            <h1 className="se-title">Quests</h1>
            <p className="se-eyebrow">Jobs, contacts and underworld progression</p>
          </div>
          <Link className="se-btn se-btn--ghost" to="/game/reputation">Contact standing</Link>
        </div>

        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}

        {page ? (
          <>
            <div className="se-grid se-grid--sidebar se-quest-summary">
              <div className="se-grid se-quest-summary__col">
                <Panel title="Jobs">
                  <div className="se-rows">
                    <Row label="Available jobs" value={formatNumber(standardAvailableCount)} />
                    {page.dailyContracts.enabled ? (
                      <Row
                        label="Daily board"
                        value={formatNumber(dailyToday.length) + ' / ' + formatNumber(page.dailyContracts.slots)}
                        strong={dailyToday.some((quest) => quest.status === 'READY_TO_TURN_IN')}
                      />
                    ) : null}
                    {page.weeklyContracts.enabled ? (
                      <Row
                        label="Weekly board"
                        value={formatNumber(weeklyToday.length) + ' / ' + formatNumber(page.weeklyContracts.slots)}
                        strong={weeklyToday.some((quest) => quest.status === 'READY_TO_TURN_IN')}
                      />
                    ) : null}
                    {page.cityContracts.enabled ? (
                      <Row
                        label="City board"
                        value={formatNumber(cityToday.length) + ' / ' + formatNumber(page.cityContracts.slots)}
                        strong={cityToday.some((quest) => quest.status === 'READY_TO_TURN_IN')}
                      />
                    ) : null}
                    {allianceToday.length ? (
                      <Row
                        label="Alliance board"
                        value={formatNumber(allianceToday.length) + ' this week'}
                        strong={allianceToday.some((quest) => quest.status === 'READY_TO_TURN_IN')}
                      />
                    ) : null}
                    {eventToday.length ? (
                      <Row
                        label="Community event"
                        value={eventToday[0]!.title}
                        strong={eventToday.some((quest) => quest.status === 'READY_TO_TURN_IN')}
                      />
                    ) : null}
                    <Row label="Personal active" value={formatNumber(page.counts.active) + ' / ' + formatNumber(page.activeLimit)} />
                    <Row label="Ready to collect" value={formatNumber(page.counts.ready)} strong={page.counts.ready > 0} />
                    <Row label="Completed" value={formatNumber(page.counts.completed)} />
                    <Row
                      label="Tracked"
                      value={formatNumber(page.quests.filter((quest) => quest.isTracked).length) + ' / ' + formatNumber(page.trackedLimit)}
                    />
                  </div>
                  {page.dailyContracts.resetAt ? (
                    <p className="se-hint se-mt">Daily contracts rotate {new Date(page.dailyContracts.resetAt).toLocaleString()}.</p>
                  ) : null}
                  {page.weeklyContracts.resetAt ? (
                    <p className="se-hint se-mt">Weekly contracts rotate {new Date(page.weeklyContracts.resetAt).toLocaleString()}.</p>
                  ) : null}
                  {page.cityContracts.resetAt ? (
                    <p className="se-hint se-mt">City contracts refresh {new Date(page.cityContracts.resetAt).toLocaleString()}.</p>
                  ) : null}
                </Panel>

                <Panel title="Permanent unlocks">
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

                <Panel title="Favor inventory">
                  {page.favors.length ? page.favors.map((favor) => {
                    const active = liveFavors.find((item) => item.category === favor.category);
                    return (
                      <div key={favor.key} className="se-mb">
                        <Row
                          label={favor.name}
                          value={
                            '×' + formatNumber(favor.quantity)
                            + ' · ' + favor.category
                            + (favor.activationKind === 'TIMED' && favor.durationMinutes
                              ? ' · ' + formatNumber(favor.durationMinutes) + ' min'
                              : ' · single use')
                          }
                        />
                        <p className="se-hint">{favor.description}</p>
                        {favor.activationKind === 'TIMED' && favor.activatable ? (
                          <Button
                            className="se-btn se-btn--primary"
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
                        ) : favor.activationKind === 'SINGLE_USE' && favor.activatable ? (() => {
                          const armed = page.armedFavors.find((item) => item.category === favor.category);
                          return armed?.key === favor.key ? (
                            <Button
                              className="se-btn se-btn--ghost"
                              disabledReason={busy ? 'Another update is still going through.' : null}
                              onClick={() => void disarmFavor(favor.key)}
                            >
                              Disarm
                            </Button>
                          ) : (
                            <Button
                              className="se-btn se-btn--primary"
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
                          );
                        })()
                          : <p className="se-hint">This pinned round stores the favor but does not support this effect yet.</p>}
                      </div>
                    );
                  }) : <Row label="Stored favors" value="None yet" />}
                </Panel>
              </div>

              <div className="se-grid se-quest-summary__col">
                <Panel title="Contacts">
                  <div className="se-rows">
                    {page.contacts.map((contact) => (
                      <Row
                        key={contact.key}
                        label={contact.shortName + ' · ' + contact.role}
                        value={contact.standing + ' · ' + formatNumber(contact.points) + ' rep'}
                      />
                    ))}
                  </div>
                </Panel>

                <Panel title="Active favors">
                  <div className="se-rows">
                    {liveFavors.length ? liveFavors.map((favor) => (
                      <Row
                        key={favor.category}
                        label={favor.name + ' · ' + favor.category}
                        value={'Until ' + new Date(favor.expiresAt).toLocaleTimeString()}
                        strong
                      />
                    )) : <Row label="Running now" value="None" />}
                  </div>
                  <p className="se-hint se-mt">Timers use server time and keep running while you are logged out.</p>
                </Panel>

                <Panel title="Armed favors">
                  <div className="se-rows">
                    {page.armedFavors.length ? page.armedFavors.map((favor) => (
                      <div key={favor.category} className="se-mb">
                        <Row
                          label={favor.name + ' · ' + favor.category}
                          value="Waiting for the next eligible action"
                          strong
                        />
                        <Button
                          className="se-btn se-btn--ghost"
                          disabledReason={busy ? 'Another update is still going through.' : null}
                          onClick={() => void disarmFavor(favor.key)}
                        >
                          Disarm
                        </Button>
                      </div>
                    )) : <Row label="Waiting now" value="None" />}
                  </div>
                  <p className="se-hint se-mt">Armed favors are only consumed when their matching action succeeds. Disarm one to return it to inventory.</p>
                </Panel>
              </div>
            </div>

            <div className="se-storetabs se-quest-tabs" role="tablist" aria-label="Quest view">
            {([
              ['available', 'Available (' + standardAvailableCount + ')'],
              ...(page.dailyContracts.enabled ? [['daily', 'Daily (' + dailyToday.length + ')'] as const] : []),
              ...(page.weeklyContracts.enabled ? [['weekly', 'Weekly (' + weeklyToday.length + ')'] as const] : []),
              ...(page.cityContracts.enabled ? [['city', 'City (' + cityToday.length + ')'] as const] : []),
              ...(allianceToday.length ? [['alliance', 'Alliance (' + allianceToday.length + ')'] as const] : []),
              ...(eventToday.length ? [['events', 'Events (' + eventToday.length + ')'] as const] : []),
              ['active', 'Active (' + activeQuestCount + ')'],
              ['completed', 'Completed (' + page.counts.completed + ')'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={'se-storetabs__tab' + (tab === key ? ' se-storetabs__tab--active' : '')}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
            </div>

            <div className="se-grid se-quest-list">
            {shown.length ? shown.map((quest) => (
              <QuestCard
                key={quest.key + ':' + quest.attempt}
                quest={quest}
                page={page}
                busy={busy ? 'Another job update is still going through.' : null}
                onAccept={(key) => void mutate(key, () => questsApi.accept(key, crypto.randomUUID()), 'Job accepted.')}
                onClaim={(key, branchKey, branchTitle) => void claim(key, branchKey, branchTitle)}
                onTrack={(key, tracked) => void mutate(key, () => questsApi.track(key, tracked))}
                onAbandon={(key) => void mutate(key, () => questsApi.abandon(key), 'Job abandoned.')}
              />
            )) : <p className="se-muted">No jobs in this section yet.</p>}
            </div>
          </>
        ) : !error ? <p className="se-muted" role="status">Checking the street for work...</p> : null}
      </div>
    </GameLayout>
  );
}
