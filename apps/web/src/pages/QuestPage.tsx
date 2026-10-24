import { forwardRef, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
  formatCents,
  formatNumber,
  type CareerIdentityDto,
  type FactionPerksDto,
  type PlayerQuestDto,
  type QuestPageDto,
} from '@streets/shared';
import { ApiError } from '../api/client.js';
import { questsApi } from '../api/quests.js';
import { communityApi } from '../api/community.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { ItemTile } from '../components/ItemTile.js';
import { questHref } from '../components/QuestLink.js';
import { RecipeLadderPanel } from '../components/RecipeLadder.js';
import { RewardChip } from '../components/RewardChip.js';
import { hasItemArt } from '../items/itemArt.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { Portrait } from '../components/Portrait.js';
import { useSession } from '../stores/session.js';
import { useOnboarding } from '../stores/onboarding.js';
import { formatClockTime, formatWhen, serverAdjustedNowMs, serverClockOffsetMs } from '../utils/time.js';
import { confirmAction } from '../stores/confirm.js';
import { publishQuestsChanged, trackedFromQuests } from '../quests/questSignals.js';
import { buildQuestBoard, legacyQuestGroup, type QuestBoardGroupKey } from '../utils/questBoard.js';

const BOARD_QUEST_TYPES = ['ALLIANCE', 'CITY_CONTRACT', 'EVENT', 'SEASON'] as const;

/** City, alliance, season and community work: shared boards, not personal jobs, and never abandoned. */
function isBoardQuest(quest: PlayerQuestDto): boolean {
  return BOARD_QUEST_TYPES.includes(quest.type as typeof BOARD_QUEST_TYPES[number])
    || quest.category === 'CITY_CONTRACT';
}

function focusedQuestKey(search: string, hash: string): string | null {
  // In-page links can change the hash while an older ?focus= remains in the URL.
  // The clicked anchor is the current intent and must win.
  if (hash.startsWith('#quest-')) {
    try { return decodeURIComponent(hash.slice('#quest-'.length)); }
    catch { return hash.slice('#quest-'.length); }
  }
  return new URLSearchParams(search).get('focus');
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

const BOARD_TYPES: ReadonlySet<string> = new Set(['DAILY', 'WEEKLY', 'CITY_CONTRACT', 'SEASON', 'ALLIANCE']);
type QuestBoardFilter = 'all' | 'ready' | 'active' | 'available' | 'contracts' | 'story';

const VirtualizedQuestListContainer = forwardRef<HTMLDivElement, {
  children?: ReactNode;
  style?: CSSProperties;
  'data-testid': string;
}>(function VirtualizedQuestListContainer({ children, style, ...props }, ref) {
  return <div {...props} ref={ref} style={style} className="se-quests-list se-quests-list--virtualized">{children}</div>;
});

function VirtualQuestList({
  quests,
  focusKey,
  renderQuest,
}: {
  quests: PlayerQuestDto[];
  focusKey: string | null;
  renderQuest: (quest: PlayerQuestDto) => ReactNode;
}) {
  const listRef = useRef<VirtuosoHandle>(null);
  const rows = useMemo(() => {
    const result: PlayerQuestDto[][] = [];
    for (let index = 0; index < quests.length; index += 2) {
      result.push(quests.slice(index, index + 2));
    }
    return result;
  }, [quests]);

  useEffect(() => {
    if (!focusKey) return;
    const questIndex = quests.findIndex((quest) => quest.key === focusKey);
    if (questIndex >= 0) listRef.current?.scrollToIndex({ index: Math.floor(questIndex / 2), align: 'center' });
  }, [quests, focusKey]);

  return (
    <Virtuoso
      ref={listRef}
      useWindowScroll
      data={rows}
      overscan={{ main: 700, reverse: 400 }}
      components={{ List: VirtualizedQuestListContainer }}
      itemContent={(_index, row) => (
        <div className="se-quests-virtual-row">
          {row.map((quest) => renderQuest(quest))}
        </div>
      )}
    />
  );
}

/** Who the work is for: the contact and their faction, or a board contract's sponsor (1.4.0-C). */
function questByline(quest: PlayerQuestDto): string {
  if (BOARD_TYPES.has(quest.type) && quest.factionStandings.length && quest.factionName) {
    return `${quest.contactName ? `${quest.contactName} · ` : ''}for ${quest.factionName}`;
  }
  const who = quest.contactName ?? quest.factionName ?? 'StreetsEmpire';
  return quest.contactName && quest.factionName ? `${who} · ${quest.factionName}` : who;
}

function questKindLabel(quest: PlayerQuestDto): string {
  if (quest.type === 'CITY_CONTRACT' || quest.category === 'CITY_CONTRACT') return 'City contract';
  if (quest.type === 'ALLIANCE') return 'Alliance contract';
  if (quest.type === 'EVENT') return 'Community event';
  if (quest.type === 'DAILY') return 'Daily contract';
  if (quest.type === 'WEEKLY') return 'Weekly contract';
  if (quest.type === 'SEASON') return 'Season contract';
  if (quest.type === 'SECRET') return 'Secret job';
  if (quest.factionJob) return 'Faction job';
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

function storyLineForStatus(quest: PlayerQuestDto): string | null {
  if (!quest.story) return null;
  switch (quest.status) {
    case 'READY_TO_TURN_IN':
      return quest.story.ready;
    case 'COMPLETED':
      return quest.story.completed;
    case 'ACTIVE':
      return quest.story.inProgress;
    case 'AVAILABLE':
    case 'LOCKED':
      return quest.story.intro;
    case 'FAILED':
    case 'EXPIRED':
      return quest.story.inProgress;
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

function isHistoricalQuest(quest: PlayerQuestDto): boolean {
  return quest.status === 'COMPLETED' || quest.status === 'FAILED' || quest.status === 'EXPIRED';
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
  trackedCount,
  busy,
  onAccept,
  onClaim,
  onTrack,
  onAbandon,
  nowMs,
  featured = false,
  focused = false,
}: {
  quest: PlayerQuestDto;
  featured?: boolean;
  focused?: boolean;
  page: QuestPageDto;
  trackedCount: number;
  busy: string | null;
  nowMs: number;
  onAccept: (key: string) => void;
  onClaim: (key: string, branchKey?: string, branchTitle?: string) => void;
  onTrack: (key: string, tracked: boolean) => void;
  onAbandon: (key: string) => void;
}) {
  const active = quest.status === 'ACTIVE' || quest.status === 'READY_TO_TURN_IN';
  const [showDetails, setShowDetails] = useState(featured || focused || (quest.status === 'READY_TO_TURN_IN' && quest.branchChoices.length > 0));
  const primaryObjective = quest.objectives.find((item) => !item.bonus && !item.completed)
    ?? quest.objectives.find((item) => !item.bonus);
  const tourTarget = quest.status === 'AVAILABLE'
    ? 'accept-quest'
    : quest.status === 'READY_TO_TURN_IN' && !quest.branchChoices.length
      ? 'complete-quest'
      : undefined;

  useEffect(() => {
    if (focused) setShowDetails(true);
  }, [focused]);

  return (
    <Panel
      id={`quest-${quest.key}`}
      tourTarget={tourTarget}
      className={'se-quest-card'
        + (featured ? ' se-quest-card--featured' : '')
        + (quest.status === 'READY_TO_TURN_IN' ? ' se-quest-card--ready' : '')
        + (quest.isTracked ? ' se-quest-card--tracked' : '')}
      title={quest.title}
      aside={(
        <div className="se-quest-card__meta">
          <Portrait who={quest.contactKey ?? quest.factionKey} size="sm" />
          <span className="se-quest-kind">{questByline(quest)} · {questKindLabel(quest)}</span>
          {quest.isTracked ? <span className="se-quest-status se-quest-status--tracked">Tracked</span> : null}
          <span className={'se-quest-status se-quest-status--' + statusTone(quest.status)}>{statusLabel(quest)}</span>
        </div>
      )}
    >
      <p className="se-hint se-quest-card__desc">{quest.description}</p>
      {primaryObjective && quest.status !== 'COMPLETED' && quest.status !== 'FAILED' && quest.status !== 'EXPIRED' ? (
        <div className="se-quest-card__preview">
          <ProgressLine
            label={primaryObjective.description}
            current={primaryObjective.current}
            target={primaryObjective.target}
            format={primaryObjective.kind === 'EARN_CASH' || primaryObjective.format === 'CURRENCY' ? 'CURRENCY' : 'NUMBER'}
            completed={primaryObjective.completed}
          />
        </div>
      ) : null}
      {quest.rewards.length ? (
        <p className="se-quest-card__reward-preview">
          <span>Reward</span> {quest.rewards[0]?.label}{quest.rewards.length > 1 ? ` +${quest.rewards.length - 1} more` : ''}
        </p>
      ) : null}
      <button
        type="button"
        className="se-quest-detail-toggle"
        aria-expanded={showDetails}
        aria-controls={`quest-details-${quest.key}`}
        onClick={() => setShowDetails((value) => !value)}
      >
        <span>{showDetails ? 'Hide job details' : 'View objectives, rewards & story'}</span>
        <span aria-hidden="true">{showDetails ? '−' : '+'}</span>
      </button>
      <div id={`quest-details-${quest.key}`} className="se-quest-card__details" hidden={!showDetails}>
      {showDetails ? <>
      {quest.status === 'LOCKED' && quest.requires?.length ? (
        <div className="se-quest-card__requires">
          <span className="se-eyebrow">Opens after</span>
          <ul>
            {quest.requires.map((requirement) => (
              <li key={requirement.label}>
                {requirement.questKey ? <Link className="se-golink" to={questHref(requirement.questKey)}>{requirement.label}</Link> : requirement.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {quest.story ? (
        <div className="se-quest-story">
          <div className="se-quest-story__quote">
            <span className="se-eyebrow">{quest.story.chapter} · {quest.story.speaker}</span>
            <p>{storyLineForStatus(quest)}</p>
          </div>
          <div className="se-quest-story__lesson">
            <div>
              <span>Lesson</span>
              <strong>{quest.story.lesson}</strong>
            </div>
            <div>
              <span>Next move</span>
              <strong>{quest.story.actionHint}</strong>
            </div>
          </div>
        </div>
      ) : null}
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
      {quest.bonusRewardPercent ? (
        <p className="se-hint">Each finished bonus adds {quest.bonusRewardPercent}% to cash, turns, goods, and contact reputation.</p>
      ) : null}

      {quest.rewards.length || quest.factionStandings.length ? (
        <div className="se-quest-reward-block">
          <p className="se-eyebrow">{quest.branchChoices.length ? 'Shared rewards' : 'Rewards'}</p>
          <div className="se-quest-rewards">
            {quest.rewards.map((reward, index) => (
              <RewardChip key={reward.kind + ':' + (reward.key ?? index)} reward={reward} />
            ))}
            {quest.factionStandings.map((standing) => (
              <RewardChip key={'standing:' + standing.factionKey} reward={{ kind: 'FACTION_STANDING', key: standing.factionKey, amount: standing.amount, label: quest.introduces ? `Starts you at Known with ${standing.factionName}` : standing.label }} />
            ))}
          </div>
          {quest.factionStandings.map((standing) => standing.locks?.length ? (
            <p key={'locks:' + standing.factionKey} className="se-hint se-warn">
              This takes you to {standing.factionName}&rsquo;s Inner Circle, which locks {standing.locks.join(' and ')}&rsquo;s Inner Circle for the rest of the season.
            </p>
          ) : standing.heldShortBy ? (
            <p key={'short:' + standing.factionKey} className="se-hint">
              You are in {standing.heldShortBy}&rsquo;s Inner Circle, so {standing.factionName} stops one point short of theirs.
            </p>
          ) : null)}
        </div>
      ) : null}
      {quest.feeCents ? (
        <p className="se-hint">{quest.contactName ?? 'They'} wants {formatCents(quest.feeCents)} when you collect{quest.introduces ? `, and only if you are still a stranger to ${quest.introduces.factionName}` : ''}.</p>
      ) : null}

      {quest.status === 'READY_TO_TURN_IN' && quest.branchChoices.length ? (
        <div className="se-quest-reward-block">
          <p className="se-eyebrow">Choose a side · permanent for this round</p>
          {quest.branchChoices.map((choice) => (
            <div key={choice.key} className="se-mb">
              <Row label={choice.title} value={choice.description} strong />
              <div className="se-quest-rewards">
                {choice.rewards.map((reward, index) => (
                  <RewardChip key={choice.key + ':' + reward.kind + ':' + (reward.key ?? index)} reward={reward} />
                ))}
                {choice.reputationDeltas.map((delta) => (
                  <RewardChip
                    key={choice.key + ':rep:' + delta.contactKey}
                    reward={{ kind: 'CONTACT_REP', key: delta.contactKey, amount: delta.amount, label: delta.label }}
                  />
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
      </> : null}
      </div>
      <div className="se-actions se-quest-actions">
        {quest.status === 'AVAILABLE' ? (
          <Button
            className="se-btn se-btn--primary"
            disabledReason={busy}
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

        {active && showDetails ? (
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
            {!isBoardQuest(quest) ? (
              <Button className="se-btn se-btn--ghost" disabledReason={busy} onClick={() => onAbandon(quest.key)}>
                Abandon
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {quest.expiresAt ? (
        <p className="se-hint se-quest-expiry">
          {quest.type === 'CITY_CONTRACT' || quest.category === 'CITY_CONTRACT' ? 'City board refreshes ' : quest.type === 'ALLIANCE' ? 'Alliance board resets ' : quest.type === 'EVENT' ? (quest.seasonalEvent ? 'Job expires ' : 'Community event ends ') : quest.type === 'DAILY' ? 'Daily board resets ' : quest.type === 'WEEKLY' ? 'Weekly board resets ' : 'Expires '}
          {formatWhen(quest.expiresAt)} · {timeRemaining(quest.expiresAt, nowMs)}.
        </p>
      ) : null}
    </Panel>
  );
}

/** A favor's picture, or nothing for a favor that has no art yet. */
function FavorArt({ favorKey }: { favorKey: string }) {
  return hasItemArt(favorKey) ? <ItemTile item={favorKey} size="sm" label={false} className="se-quests-favor-art" /> : null;
}

export function QuestPage() {
  const location = useLocation();
  const me = useSession((state) => state.me);
  const refreshSnapshot = useSession((state) => state.refreshSnapshot);
  const reloadOnboarding = useOnboarding((state) => state.load);
  const [page, setPage] = useState<QuestPageDto | null>(null);
  const historyCache = useRef<PlayerQuestDto[] | null>(null);
  const historyLoadInFlight = useRef<Promise<PlayerQuestDto[] | null> | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Partial<Record<QuestBoardGroupKey, boolean>>>({});
  const [showConnections, setShowConnections] = useState(false);
  const [showProgression, setShowProgression] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [career, setCareer] = useState<CareerIdentityDto | null>(null);
  const [careerLens, setCareerLens] = useState(true);
  const [boardFilter, setBoardFilter] = useState<QuestBoardFilter>('all');
  const [boardSearch, setBoardSearch] = useState('');
  const deferredBoardSearch = useDeferredValue(boardSearch);
  const pageLoadInFlight = useRef<Promise<QuestPageDto | null> | null>(null);

  const loadHistory = useCallback(() => {
    if (historyCache.current) return Promise.resolve(historyCache.current);
    if (historyLoadInFlight.current) return historyLoadInFlight.current;
    setError(null);
    setHistoryLoading(true);
    const pending = questsApi.history().then(({ quests }) => {
      historyCache.current = quests;
      setPage((current) => current ? {
        ...current,
        quests: [...current.quests.filter((quest) => !isHistoricalQuest(quest)), ...quests],
      } : current);
      return quests;
    }).catch(() => {
      setError('Could not load quest history right now. Try again.');
      return null;
    });
    historyLoadInFlight.current = pending;
    void pending.finally(() => {
      setHistoryLoading(false);
      if (historyLoadInFlight.current === pending) historyLoadInFlight.current = null;
    });
    return pending;
  }, []);

  const applyPage = useCallback((
    next: QuestPageDto,
    requestStartedAtMs: number,
    responseReceivedAtMs: number,
  ) => {
    const offset = serverClockOffsetMs(next.serverTime, requestStartedAtMs, responseReceivedAtMs);
    setClockOffsetMs(offset);
    setNowMs(serverAdjustedNowMs(responseReceivedAtMs, offset));
    const currentQuests = next.quests.filter((quest) => !isHistoricalQuest(quest));
    setPage({
      ...next,
      quests: historyCache.current ? [...currentQuests, ...historyCache.current] : currentQuests,
    });
  }, []);

  const load = useCallback(() => {
    if (pageLoadInFlight.current) return pageLoadInFlight.current;
    const pending = (async () => {
      const requestStartedAtMs = Date.now();
      try {
        const next = await questsApi.page();
        const responseReceivedAtMs = Date.now();
        applyPage(next, requestStartedAtMs, responseReceivedAtMs);
        setError(null);
        return next;
      } catch {
        setError('Could not load jobs right now. Try again.');
        return null;
      }
    })();
    pageLoadInFlight.current = pending;
    void pending.finally(() => {
      if (pageLoadInFlight.current === pending) pageLoadInFlight.current = null;
    });
    return pending;
  }, [applyPage]);

  useEffect(() => {
    void load();
    void communityApi.careerIdentity().then((result) => setCareer(result.career)).catch(() => undefined);
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
    let interval: number | undefined;
    const firstTick = window.setTimeout(() => {
      setNowMs(serverAdjustedNowMs(Date.now(), clockOffsetMs));
      interval = window.setInterval(
        () => setNowMs(serverAdjustedNowMs(Date.now(), clockOffsetMs)),
        60_000,
      );
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      window.clearTimeout(firstTick);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [clockOffsetMs]);

  useEffect(() => {
    if (!page) return;
    const focusKey = focusedQuestKey(location.search, location.hash);
    if (focusKey && !page.quests.some((quest) => quest.key === focusKey) && (page.historyCount ?? 0) > 0) {
      void loadHistory();
    }
    const board = buildQuestBoard(page.quests, focusKey);
    const targetGroup = focusKey
      ? board.groups.find((group) => group.quests.some((quest) => quest.key === focusKey))?.key
      : legacyQuestGroup(location.search);
    if (targetGroup) {
      setExpandedGroups((previous) => previous[targetGroup] ? previous : { ...previous, [targetGroup]: true });
    }
    if (location.hash === '#contact-standing' || location.hash === '#factions') {
      setShowConnections(true);
    }
    if (location.hash === '#quest-progression') setShowProgression(true);
  }, [page, location.search, location.hash, location.key, loadHistory]);

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

  const focusKey = focusedQuestKey(location.search, location.hash);
  const board = useMemo(() => {
    const result = buildQuestBoard(page?.quests ?? [], focusKey);
    if ((page?.historyCount ?? 0) > 0 && !result.groups.some((group) => group.key === 'history')) {
      result.groups.push({
        key: 'history',
        title: 'Completed & past jobs',
        description: 'Your history, expired jobs and past rewards.',
        defaultOpen: false,
        quests: [],
      });
    }
    return result;
  }, [page, focusKey]);
  const visibleGroups = useMemo(() => {
    if (!career || !careerLens) return board.groups;
    const categories = new Set(career.contractCategories.map((value) => value.toUpperCase()));
    return board.groups.map((group) => ({
      ...group,
      quests: group.quests.filter((quest) => quest.key === focusKey || quest.status !== 'AVAILABLE'
        || categories.has(quest.category.toUpperCase())
        || categories.has(quest.type.toUpperCase())),
    })).filter((group) => group.quests.length > 0 || (group.key === 'history' && (page?.historyCount ?? 0) > 0));
  }, [board.groups, career, careerLens, focusKey, page?.historyCount]);

  const filteredGroups = useMemo(() => {
    const query = deferredBoardSearch.trim().toLocaleLowerCase();
    const matchesFilter = (group: QuestBoardGroupKey) => boardFilter === 'all'
      || (boardFilter === 'contracts' && group === 'contracts')
      || (boardFilter === 'story' && (group === 'story' || group === 'available'))
      || group === boardFilter;
    return visibleGroups.map((group) => ({
      ...group,
      quests: group.quests.filter((quest) => {
        if (!matchesFilter(group.key) && quest.key !== focusKey) return false;
        if (!query || quest.key === focusKey) return true;
        const searchable = [
          quest.title, quest.description, quest.category, quest.type,
          quest.contactName, quest.factionName, quest.story?.chapter,
          quest.story?.lesson, quest.story?.actionHint,
          ...quest.objectives.map((objective) => objective.description),
        ].filter(Boolean).join(' ').toLocaleLowerCase();
        return searchable.includes(query);
      }),
    })).filter((group) => group.quests.length > 0
      || (group.key === 'history' && !query && (page?.historyCount ?? 0) > 0));
  }, [visibleGroups, boardFilter, deferredBoardSearch, focusKey, page?.historyCount]);

  useEffect(() => {
    if (deferredBoardSearch.trim() && (page?.historyCount ?? 0) > 0 && !historyCache.current) {
      void loadHistory();
    }
  }, [deferredBoardSearch, page?.historyCount, loadHistory]);

  useEffect(() => {
    if (expandedGroups.history && (page?.historyCount ?? 0) > 0 && !historyCache.current) {
      void loadHistory();
    }
  }, [expandedGroups.history, page?.historyCount, loadHistory]);

  const trackedToday = useMemo(
    () => page?.quests.filter((quest) => quest.isTracked && ['ACTIVE', 'READY_TO_TURN_IN'].includes(quest.status)) ?? [],
    [page],
  );
  const trackedCount = useMemo(
    () => page?.quests.filter((quest) => quest.isTracked).length ?? 0,
    [page],
  );

  const liveFavors = useMemo(
    () => page?.activeFavors.filter((favor) => new Date(favor.expiresAt).getTime() > nowMs) ?? [],
    [page, nowMs],
  );

  async function mutate(key: string, action: () => Promise<QuestPageDto>, success?: string, refreshTour = false) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const requestStartedAtMs = Date.now();
    try {
      const next = await action();
      const responseReceivedAtMs = Date.now();
      applyPage(next, requestStartedAtMs, responseReceivedAtMs);
      publishQuestsChanged({
        scope: 'board',
        quests: next.quests,
        tracked: trackedFromQuests(next.quests),
      });
      if (success) setNotice(success);
      if (refreshTour && me?.id) await reloadOnboarding(me.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That job could not be updated.');
    } finally {
      setBusy(null);
    }
  }

  async function claim(key: string, branchKey?: string, branchTitle?: string) {
    // 1.4.0-E: reaching one faction's Inner Circle locks its rivals'. Ask before it happens.
    const locking = page?.quests.find((quest) => quest.key === key)?.factionStandings.filter((standing) => standing.locks?.length) ?? [];
    if (locking.length) {
      const confirmed = await confirmAction({
        title: `Join ${locking.map((standing) => standing.factionName).join(' and ')}'s Inner Circle?`,
        body: locking.map((standing) => `This locks ${standing.locks!.join(' and ')}'s Inner Circle for the rest of the season. Standing with them keeps counting, one point short of it.`).join(' '),
        confirmLabel: 'Collect and join',
      });
      if (!confirmed) return;
    }
    if (branchKey) {
      const confirmed = await confirmAction({
        title: `Choose "${branchTitle ?? branchKey}"?`,
        body: 'This choice is permanent for this round and locks the other follow-up path.',
        confirmLabel: 'Choose this path',
      });
      if (!confirmed) return;
    }
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await questsApi.claim(key, crypto.randomUUID(), branchKey);
      const locked = result.result.standingChanges.flatMap((change) => change.locked ?? []);
      // Quest Recipe Unlocks D: say which recipe the job opened; Produce and Pip's counter reload on the event below.
      const opened = page?.recipeLadder?.find((rung) => rung.questKey === key);
      setNotice(
        result.result.title
        + ' complete — payment collected.'
        + (opened ? ' The ' + opened.productName + ' recipe is open: cook it on Produce.' : '')
        + (result.result.chosenBranch ? ' Choice locked: ' + (branchTitle ?? result.result.chosenBranch) + '.' : '')
        + (locked.length ? ' Inner Circle locked for the season: ' + locked.join(', ') + '.' : ''),
      );
      const claimedQuest = page?.quests.find((quest) => quest.key === key && quest.status === 'READY_TO_TURN_IN');
      if (historyCache.current && claimedQuest) {
        historyCache.current = [
          { ...claimedQuest, status: 'COMPLETED', isTracked: false, ...(branchKey ? { chosenBranch: branchKey } : {}) },
          ...historyCache.current.filter((quest) => quest.key !== key),
        ];
      }
      useSession.getState().applyActionSnapshot(result.after, result.rankChanges);
      setPage((current) => {
        if (!current) return current;
        const claimed = current.quests.find((quest) => quest.key === key && quest.status === 'READY_TO_TURN_IN');
        if (!claimed) return current;
        return {
          ...current,
          quests: current.quests.filter((quest) => quest.key !== key),
          counts: {
            ...current.counts,
            ready: Math.max(0, current.counts.ready - 1),
            completed: current.counts.completed + 1,
          },
          historyCount: (current.historyCount ?? 0) + 1,
        };
      });
      void load().then((next) => publishQuestsChanged(next
        ? { scope: 'action', quests: next.quests, tracked: trackedFromQuests(next.quests) }
        : { scope: 'action' }));
      void refreshSnapshot({ background: true });
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
      setNotice(result.result.name + ' is active until ' + formatClockTime(result.result.expiresAt) + '.');
      useSession.getState().applyActionSnapshot(result.after, result.rankChanges);
      const next = await load();
      publishQuestsChanged(next
        ? { scope: 'board', quests: next.quests, tracked: trackedFromQuests(next.quests) }
        : { scope: 'board' });
      void refreshSnapshot({ background: true });
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
      useSession.getState().applyActionSnapshot(result.after, result.rankChanges);
      const next = await load();
      publishQuestsChanged(next
        ? { scope: 'board', quests: next.quests, tracked: trackedFromQuests(next.quests) }
        : { scope: 'board' });
      void refreshSnapshot({ background: true });
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
      useSession.getState().applyActionSnapshot(result.after, result.rankChanges);
      const next = await load();
      publishQuestsChanged(next
        ? { scope: 'board', quests: next.quests, tracked: trackedFromQuests(next.quests) }
        : { scope: 'board' });
      void refreshSnapshot({ background: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That favor could not be disarmed.');
    } finally {
      setBusy(null);
    }
  }

  const renderQuest = (quest: PlayerQuestDto, featured = false) => page ? (
    <QuestCard
      key={quest.key + ':' + quest.attempt}
      quest={quest}
      page={page}
      trackedCount={trackedCount}
      featured={featured}
      focused={focusKey === quest.key}
      busy={busy ? 'Another job update is still going through.' : null}
      nowMs={nowMs}
       onAccept={(key) => void mutate(key, () => questsApi.accept(key, crypto.randomUUID()), 'Job accepted.', true)}
      onClaim={(key, branchKey, branchTitle) => void claim(key, branchKey, branchTitle)}
      onTrack={(key, tracked) => void mutate(key, () => questsApi.track(key, tracked))}
      onAbandon={(key) => void mutate(key, () => questsApi.abandon(key), 'Job abandoned.')}
    />
  ) : null;

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-quests">
        <header className="se-quests-hero">
          <div className="se-quests-hero__copy">
            <span className="se-eyebrow">Underworld contract desk</span>
            <h1>Quests</h1>
            <p>Your main story is always first. Continue your mission, collect rewards, then take on other work when you are ready.</p>
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
            </div>
            <div className="se-quests-hero__readout">
              <span>
                <small>Ready</small>
                <strong>{page ? formatNumber(page.counts.ready) : '—'}</strong>
              </span>
              {/* Personal jobs only: city, alliance, season and community work runs alongside them. */}
              <span title="Jobs you took from contacts. City, alliance, season and community work is not counted here.">
                <small>Personal jobs</small>
                <strong>{page ? formatNumber(page.counts.active) : '—'}</strong>
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
        {career ? (
          <label className="se-checkrow se-checkrow--toggle se-career-lens">
            <input type="checkbox" checked={careerLens} onChange={(event) => setCareerLens(event.target.checked)} />
            <span><strong>{career.title} contract lens</strong><small>Highlights matching available work only. Turn it off to see every contract; rewards and access never change.</small></span>
          </label>
        ) : null}

        {page ? (
          <>

            <section className="se-quests-primary" aria-labelledby="se-quests-story-title">
              <div className="se-quests-sectionhead">
                <div>
                  <span className="se-eyebrow">Your main storyline</span>
                  <h2 id="se-quests-story-title">Next story mission</h2>
                </div>
                {board.featuredStory?.story?.chapter ? <span className="se-quests-sectionhead__meta">{board.featuredStory.story.chapter}</span> : null}
              </div>
              {board.featuredStory ? renderQuest(board.featuredStory, true) : (
                <div className="se-quests-empty">
                  <strong>Your main story is up to date.</strong>
                  <span>Check back for the next chapter. Other work is listed below.</span>
                </div>
              )}
            </section>

            <section className="se-quests-board" aria-labelledby="se-quests-work-title">
              <div className="se-quests-sectionhead">
                <div>
                  <span className="se-eyebrow">Other work</span>
                  <h2 id="se-quests-work-title">Your jobs &amp; contracts</h2>
                </div>
                <span className="se-quests-sectionhead__meta">{formatNumber(filteredGroups.reduce((sum, group) => sum + (group.key === 'history' ? 0 : group.quests.length), 0))} current</span>
              </div>
              <div className="se-quests-boardtools" role="search">
                <label className="se-quests-boardtools__search">
                  <span className="se-sr-only">Search jobs</span>
                  <input
                    className="se-input"
                    type="search"
                    placeholder="Search jobs, contacts, objectives..."
                    value={boardSearch}
                    onChange={(event) => setBoardSearch(event.target.value)}
                  />
                </label>
                <div className="se-quests-boardtools__filters" role="group" aria-label="Filter jobs">
                  {([
                    ['all', 'All'], ['ready', 'Ready'], ['active', 'Active'],
                    ['available', 'Available'], ['contracts', 'Contracts'], ['story', 'Story'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={'se-quests-boardtools__filter' + (boardFilter === value ? ' se-quests-boardtools__filter--active' : '')}
                      aria-pressed={boardFilter === value}
                      onClick={() => setBoardFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {boardSearch || boardFilter !== 'all' ? (
                  <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => { setBoardSearch(''); setBoardFilter('all'); }}>
                    Clear filters
                  </button>
                ) : null}
              </div>
              {filteredGroups.length ? filteredGroups.map((group) => {
                const open = expandedGroups[group.key] ?? group.defaultOpen;
                const groupCount = group.key === 'history' ? page.historyCount ?? group.quests.length : group.quests.length;
                return (
                  <section id={'quest-board-' + group.key} className="se-quests-group" key={group.key}>
                    <details
                      open={open}
                      onToggle={(event) => {
                        const next = event.currentTarget.open;
                        if (next && group.key === 'history' && !historyCache.current) void loadHistory();
                        setExpandedGroups((current) => current[group.key] === next ? current : { ...current, [group.key]: next });
                      }}
                    >
                      <summary className="se-quests-group__summary">
                        <span className="se-quests-group__heading">
                          <strong>{group.title}</strong>
                          <small>{group.description}</small>
                        </span>
                        <span className="se-quests-group__count">{formatNumber(groupCount)}</span>
                        <span className="se-quests-group__chevron" aria-hidden="true">{open ? '−' : '+'}</span>
                      </summary>
                      {open ? group.quests.length ? (
                        <VirtualQuestList quests={group.quests} focusKey={focusKey} renderQuest={(quest) => renderQuest(quest)} />
                      ) : group.key === 'history' ? (
                        <div className="se-quests-empty" role={historyLoading ? 'status' : undefined}>
                          <strong>{historyLoading ? 'Loading your quest history…' : historyCache.current ? 'No past jobs to show.' : 'Quest history could not be loaded.'}</strong>
                          {!historyLoading && !historyCache.current && (page.historyCount ?? 0) > 0 ? <span>Close and reopen history to retry.</span> : null}
                        </div>
                      ) : null : null}
                    </details>
                  </section>
                );
              }) : <div className="se-quests-empty"><strong>No jobs match those filters.</strong><span>Try another search or clear the filters to see the full board.</span></div>}
            </section>

            <details className="se-quests-resources" open={showConnections}
              onToggle={(event) => setShowConnections(event.currentTarget.open)}>
              <summary className="se-quests-resources__summary">
                <span><strong>Contacts &amp; factions</strong><small>Reputation, relationships and faction benefits</small></span>
                <span aria-hidden="true">{showConnections ? '−' : '+'}</span>
              </summary>
              {showConnections ? <div className="se-quests-work__rail se-quests-work__rail--expanded">
                <div id="contact-standing">
                  <Panel title="Contact standing" className="se-quests-panel">
                    <div className="se-quests-contacts">
                      {page.contacts.map((contact) => (
                        <div key={contact.key} className="se-quests-contact">
                          <Portrait who={contact.key} label={contact.name} />
                          <span>{contact.name}</span>
                          <strong>{contact.standing}</strong>
                          <small>{contact.role} · {formatNumber(contact.points)} rep</small>
                          {contact.faction ? <small>Works for {contact.faction.name}</small> : contact.independent ? <small title={contact.independent}>Independent</small> : null}
                          <small>{contact.nextStandingAt === null ? 'Max standing' : `Next standing at ${formatNumber(contact.nextStandingAt)} rep`} · {formatNumber(page.quests.filter((quest) => quest.contactKey === contact.key && quest.status !== 'LOCKED').length)} jobs open</small>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>

                {page.factions?.length ? (
                  <div id="factions">
                    <Panel title="Factions" className="se-quests-panel">
                      <p className="se-hint">The organizations behind your contacts: who works for whom, and who they are up against.{page.factions.some((faction) => faction.standing) ? ' A one-time Job earns standing with the faction it works for, and only the factions it helps; only you can see it. Each faction also has Jobs of its own that open as your standing grows.' : ''}{page.quests.some((quest) => BOARD_TYPES.has(quest.type) && quest.factionStandings.length) ? ' Board contracts are sponsored too: a finished contract pays its sponsor standing, and when work could go to two factions it leans toward one you are Known with.' : ''}{page.factions.some((faction) => faction.perks) ? ' Standing also opens perks: a faction\'s word on its lane at Known, early warnings at Trusted, and one small saving at Connected.' : ''}</p>
                      <div className="se-quests-contacts">
                        {page.factions.map((faction) => (
                          <div key={faction.key}>
                            <span className="se-faction-faces">
                              {faction.faces.length
                                ? faction.faces.map((face) => <Portrait key={face.key} who={face.key} size="sm" label={face.name} />)
                                : <Portrait who={faction.key} size="sm" />}
                            </span>
                            <span>{faction.lane}</span>
                            <strong>{faction.name}{faction.standing ? ` · ${faction.standing.tierName}` : ''}</strong>
                            {faction.standing ? (
                              <small>
                                {formatNumber(faction.standing.points)} standing · {faction.standing.next ? `${faction.standing.next.tierName} at ${formatNumber(faction.standing.next.startsAt)}` : 'Top tier'}
                              </small>
                            ) : null}
                            <small>{faction.identity}</small>
                            <small>{faction.description}</small>
                            <small>{faction.faces.length ? `Faces: ${faction.faces.map((face) => face.name).join(', ')}` : faction.facesNote ?? ''}</small>
                            {faction.rivals.length ? <small>Rival{faction.rivals.length === 1 ? '' : 's'}: {faction.rivals.map((rival) => rival.name).join(', ')}</small> : null}
                            {faction.standing && faction.jobs.length ? (
                              <ul className="se-faction-jobs">
                                {faction.jobs.map((job) => (
                                  <li key={job.key} className={job.status === 'LOCKED' ? 'is-locked' : job.status === 'COMPLETED' ? 'is-done' : 'is-open'}>
                                    {job.status === 'LOCKED' ? job.title : <Link to={`#quest-${encodeURIComponent(job.key)}`}>{job.title}</Link>}
                                    <span>{job.status === 'COMPLETED' ? 'Done' : job.status === 'LOCKED' ? (job.tierName ? `Opens at ${job.tierName}` : 'Locked') : 'Open'}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {faction.innerCircle?.lockedBy ? (
                              <small className="se-warn">Inner Circle locked this season: you are in {faction.innerCircle.lockedBy.name}&rsquo;s.</small>
                            ) : faction.innerCircle?.wouldLock.length ? (
                              <small>Reaching Inner Circle here locks {faction.innerCircle.wouldLock.map((rival) => rival.name).join(' and ')}&rsquo;s.</small>
                            ) : null}
                            {faction.innerCircle?.introduction && faction.innerCircle.introduction.status !== 'COMPLETED' ? (
                              <small>
                                {faction.innerCircle.introduction.status === 'LOCKED'
                                  ? 'Vic can introduce you once you are not already known here.'
                                  : <>Vic can introduce you: <Link to={`#quest-${encodeURIComponent(faction.innerCircle.introduction.key)}`}>{faction.innerCircle.introduction.title}</Link></>}
                              </small>
                            ) : null}
                            {faction.perks ? <FactionPerks perks={faction.perks} /> : null}
                          </div>
                        ))}
                      </div>
                    </Panel>
                  </div>
                ) : null}

              </div> : null}
            </details>

            <details className="se-quests-resources" id="quest-progression" open={showProgression}
              onToggle={(event) => setShowProgression(event.currentTarget.open)}>
              <summary className="se-quests-resources__summary">
                <span><strong>Favors &amp; permanent unlocks</strong><small>Stored advantages, active favors, recipes and rewards</small></span>
                <span aria-hidden="true">{showProgression ? '−' : '+'}</span>
              </summary>
              {showProgression ? (
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
                                <FavorArt favorKey={favor.key} />
                                <div className="se-quests-favor__title">
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
                                        ? active.name + ' already occupies ' + favor.category + ' until ' + formatClockTime(active.expiresAt) + '.'
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

                  <RecipeLadderPanel page={page} />
                </div>

                <div className="se-quests-stack">
                  <Panel title="Active favors" aside={liveFavors.length ? `${formatNumber(liveFavors.length)} running` : 'None'} className="se-quests-panel">
                    {liveFavors.length ? (
                      <div className="se-quests-livefavors">
                        {liveFavors.map((favor) => (
                          <div key={favor.category}>
                            <FavorArt favorKey={favor.key} />
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
                            <FavorArt favorKey={favor.key} />
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
              ) : null}
            </details>

            <details className="se-quests-resources se-quests-options">
              <summary className="se-quests-resources__summary">
                <span><strong>Contract settings</strong><small>Automatic acceptance and board refreshes</small></span>
                <span aria-hidden="true">+</span>
              </summary>
              <div className="se-quests-options__body">
              <label className="se-checkrow se-checkrow--toggle se-quests-autoaccept">
                <input
                  type="checkbox"
                  checked={page.autoAccept ?? true}
                  disabled={busy !== null}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    void mutate('auto-accept', () => questsApi.setAutoAccept(enabled), enabled
                      ? 'Auto-accept is on. New daily, weekly and city work starts by itself.'
                      : 'Auto-accept is off. Accept board work yourself.');
                  }}
                />
                <span>
                  <strong>Auto-accept board work</strong>
                  <small>Daily, weekly and city contracts start as soon as they appear. Community events always start on their own. A job you abandon stays off until you take it again.</small>
                </span>
              </label>
                <p className="se-hint">Daily: {page.dailyContracts.resetAt ? timeRemaining(page.dailyContracts.resetAt, nowMs) : 'No reset scheduled'} · Weekly: {page.weeklyContracts.resetAt ? timeRemaining(page.weeklyContracts.resetAt, nowMs) : 'No reset scheduled'} · City: {page.cityContracts.resetAt ? timeRemaining(page.cityContracts.resetAt, nowMs) : 'No reset scheduled'}</p>
              </div>
            </details>

          </>
        ) : !error ? (
          <div className="se-quests-loading" role="status">Checking the street for work...</div>
        ) : null}
      </div>
    </GameLayout>
  );
}

/** 1.4.0-D. What standing opens with a faction, and what it is telling you right now. */
function FactionPerks({ perks }: { perks: FactionPerksDto }) {
  const levels = [
    { key: 'information', level: perks.information, empty: 'Nothing to tell you right now.' },
    { key: 'warnings', level: perks.warnings, empty: 'Nothing to warn you about.' },
    ...(perks.nudge ? [{ key: 'nudge', level: perks.nudge, empty: '' }] : []),
  ];
  return (
    <ul className="se-faction-perks">
      {levels.map(({ key, level, empty }) => (
        <li key={key} className={level.open ? 'is-open' : 'is-locked'}>
          <div className="se-faction-perks__head">
            <span>{level.title}</span>
            <span>{level.open ? (key === 'nudge' ? 'Active' : level.tierName) : `Opens at ${level.tierName}`}</span>
          </div>
          {level.open && key !== 'nudge' ? (
            level.lines.length
              ? <ul>{level.lines.map((line) => <li key={line}>{line}</li>)}</ul>
              : <p>{empty}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
