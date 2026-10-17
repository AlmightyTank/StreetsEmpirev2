import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCents, formatNumber, type CityConditionDto, type PlayerQuestDto, type QuestPageDto } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { questsApi } from '../api/quests.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { CareerGuidance, CareerMetricStrip, CareerNavigation } from '../components/CareerExperience.js';
import { Panel } from '../components/Panel.js';
import { RewardChip } from '../components/RewardChip.js';
import { GameLayout } from '../layouts/GameLayout.js';

type EventShelf = 'active' | 'upcoming' | 'completed' | 'claimed';
type EventTab = EventShelf;

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function eventKind(event: PlayerQuestDto): string {
  if (event.seasonalEvent) return 'Seasonal event · individual objectives';
  if (event.communityEvent) return 'Community event · shared objective';
  return 'Event job · individual objectives';
}

function eventDeadline(event: PlayerQuestDto): string | null {
  return event.expiresAt ?? event.seasonalEvent?.endsAt ?? event.communityEvent?.endsAt ?? null;
}

function shelfFor(event: PlayerQuestDto, now: number): EventShelf {
  if (event.claimedAt) return 'claimed';
  if (event.acceptedAt && ['ACTIVE', 'READY_TO_TURN_IN'].includes(event.status)) return 'active';
  if (['COMPLETED', 'FAILED', 'EXPIRED'].includes(event.status)) return 'completed';
  const start = event.seasonalEvent?.startsAt ?? event.communityEvent?.startsAt;
  if (event.status === 'AVAILABLE' && start && new Date(start).getTime() > now) return 'upcoming';
  if (event.status === 'AVAILABLE' || event.status === 'LOCKED') return 'upcoming';
  return 'active';
}

function formatDate(value: string | null): string {
  if (!value) return 'No scheduled deadline';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
}

function progressText(current: number, target: number, format?: 'NUMBER' | 'CURRENCY'): string {
  return format === 'CURRENCY'
    ? `${formatCents(current)} / ${formatCents(target)}`
    : `${formatNumber(current)} / ${formatNumber(target)}`;
}

function CityConditionCard({ condition }: { condition: CityConditionDto }) {
  const effects = Object.entries(condition.effects)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .map(([key, value]) => `${key === 'cashGainPercent' ? 'Sale income' : key === 'recruitPercent' ? 'Recruiting' : 'Product output'} +${value}%`);
  const districtNames = condition.districts.map((district) => district.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()));
  const actionNames = condition.actions.map((action) => action === 'PRODUCE_CRACK' ? 'Production' : action === 'STORE_SELL' ? 'Store sales' : titleCase(action.toLowerCase()));
  const source = condition.followUpFrom
    ? `${condition.followUpFrom.type === 'COMMUNITY' ? 'Community' : 'Seasonal'} event · ${condition.followUpFrom.key.replaceAll('_', ' ').toLowerCase()}`
    : null;

  return <Panel className="se-city-condition" title={condition.title} aside={condition.status === 'ACTIVE' ? 'Active city condition' : 'Scheduled city condition'}>
    <p className="se-event-card__description">{condition.description}</p>
    <div className="se-event-card__schedule">
      <span><small>Affected districts</small>{districtNames.join(', ')}</span>
      <span><small>Affected actions</small>{actionNames.join(', ')}</span>
      <span><small>Ends</small>{formatDate(condition.endsAt)}</span>
      {source ? <span><small>Event chain</small>Follow-up from {source}</span> : null}
    </div>
    {effects.length ? <div className="se-event-condition-effects"><strong>Modifiers</strong>{effects.map((effect) => <span key={effect}>{effect}</span>)}</div> : null}
  </Panel>;
}

function EventCard({ event, shelf }: { event: PlayerQuestDto; shelf: EventShelf }) {
  const scheduleStart = event.seasonalEvent?.startsAt ?? event.communityEvent?.startsAt;
  const scheduleEnd = event.seasonalEvent?.endsAt ?? event.communityEvent?.endsAt;
  const destination = `/game/quests?tab=events&focus=${encodeURIComponent(event.key)}#quest-${encodeURIComponent(event.key)}`;
  const timeline = [
    event.acceptedAt ? { label: 'Joined', at: event.acceptedAt } : null,
    event.completedAt ? { label: 'Completed', at: event.completedAt } : null,
    event.claimedAt ? { label: 'Reward claimed', at: event.claimedAt } : null,
    !event.claimedAt && ['EXPIRED', 'FAILED'].includes(event.status) && eventDeadline(event)
      ? { label: event.status === 'EXPIRED' ? 'Event expired' : 'Event ended', at: eventDeadline(event)! }
      : null,
  ].filter((entry): entry is { label: string; at: string } => Boolean(entry));

  return (
    <Panel className="se-event-card" title={event.title} aside={eventKind(event)}>
      <p className="se-event-card__description">{event.description}</p>
      <div className="se-event-card__schedule">
        <span><small>Schedule</small>{scheduleStart ? formatDate(scheduleStart) : 'Available now'}{scheduleEnd ? ` – ${formatDate(scheduleEnd)}` : ''}</span>
        <span><small>{shelf === 'active' ? 'Your deadline' : 'Status'}</small>{shelf === 'active' ? formatDate(eventDeadline(event)) : titleCase(shelf)}</span>
      </div>

      {event.communityEvent ? (
        <div className="se-event-shared">
          <div><strong>Shared community progress</strong><span>{event.communityEvent.sharedCompleted ? 'Community objective complete' : 'Players contribute together'}</span></div>
          <div className="se-event-meter" role="progressbar" aria-label="Shared event progress" aria-valuemin={0} aria-valuemax={event.communityEvent.contributionTarget} aria-valuenow={Math.min(event.communityEvent.contributionCurrent, event.communityEvent.contributionTarget)}>
            <span style={{ width: `${Math.min(100, event.communityEvent.contributionCurrent / event.communityEvent.contributionTarget * 100)}%` }} />
          </div>
          <small>{event.communityEvent.contributionLabel}: {progressText(event.communityEvent.contributionCurrent, event.communityEvent.contributionTarget, event.communityEvent.contributionFormat)}</small>
        </div>
      ) : null}

      <div className="se-event-objectives">
        <h3>{event.communityEvent ? 'Your contribution' : 'Objectives'}</h3>
        {event.objectives.length ? event.objectives.map((objective) => (
          <div className="se-event-objective" key={objective.id}>
            <span>{objective.description}{objective.bonus ? ' · Bonus' : ''}</span>
            <strong>{progressText(objective.current, objective.target, objective.format)}</strong>
          </div>
        )) : <p className="se-hint">No personal objectives for this event.</p>}
      </div>

      {event.branchChoices.length ? <div className="se-event-choices"><h3>Choices</h3>{event.branchChoices.map((choice) => <p key={choice.key}><strong>{choice.title}</strong> · {choice.description}</p>)}</div> : null}
      {event.rewards.length ? (
        <div className="se-event-rewards">
          <h3>Rewards</h3>
          {event.rewards.map((reward, index) => <RewardChip key={`${reward.kind}-${reward.key ?? index}`} reward={reward} />)}
        </div>
      ) : null}
      {event.bonusRewardPercent ? <p className="se-hint">Each finished bonus adds {event.bonusRewardPercent}% to cash, turns, goods, and contact reputation.</p> : null}
      {timeline.length ? (
        <div className="se-event-history"><h3>Event history</h3><ol>{timeline.map((entry) => <li key={entry.label}><span>{entry.label}</span><time dateTime={entry.at}>{formatDate(entry.at)}</time></li>)}</ol></div>
      ) : null}
      {shelf === 'active' || shelf === 'upcoming' ? <div className="se-event-card__actions"><Link className="se-btn" to={destination}>{event.status === 'AVAILABLE' ? 'View event and join' : 'Manage event'}</Link></div> : null}
    </Panel>
  );
}

export function EventsPage() {
  const [page, setPage] = useState<QuestPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<EventTab>('active');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let mounted = true;
    void questsApi.page().then((result) => {
      if (mounted) { setPage(result); setError(null); }
    }).catch((cause: unknown) => {
      if (mounted) setError(cause instanceof ApiError ? cause.message : 'Events could not be loaded.');
    });
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const events = useMemo(() => {
    const list = page?.quests.filter((quest) => quest.type === 'EVENT') ?? [];
    return list.map((event) => ({ event, shelf: shelfFor(event, now) }));
  }, [page, now]);
  const selected = events.filter((entry) => entry.shelf === tab).sort((left, right) => left.event.title.localeCompare(right.event.title));
  const count = (shelf: EventShelf) => events.filter((entry) => entry.shelf === shelf).length;

  return <GameLayout>
    <main className="se-events">
      <CareerNavigation active="events" />
      <header className="se-events-hero">
        <div><span className="se-eyebrow">Event Center</span><h1>Events</h1><p>Track community and seasonal events, their schedules, your progress, and earned rewards.</p></div>
        <CareerMetricStrip
          label="Event counts"
          items={(['active', 'upcoming', 'completed', 'claimed'] as const).map((shelf) => ({
            label: shelf,
            value: count(shelf),
            tone: shelf === 'active' && count(shelf) > 0 ? 'accent' as const : shelf === 'claimed' && count(shelf) > 0 ? 'good' as const : undefined,
          }))}
        />
      </header>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <nav className="se-event-tabs" aria-label="Event status">
        {(['active', 'upcoming', 'completed', 'claimed'] as const).map((shelf) => <Button key={shelf} className={`se-btn ${tab === shelf ? '' : 'se-btn--ghost'}`} aria-pressed={tab === shelf} onClick={() => setTab(shelf)}>{titleCase(shelf)} <span>{count(shelf)}</span></Button>)}
      </nav>
      <CareerGuidance title="Event calendar, objectives, and city effects">
        <p>This page is the event calendar and progress record. Join or manage an event through its linked Quest entry; completion and claim history return here.</p>
        <p>Community objectives combine player contributions. City conditions are separate temporary modifiers and apply only during their displayed window.</p>
      </CareerGuidance>
      {page?.cityConditions?.length ? <section className="se-city-conditions" aria-label="City conditions">
        <header><h2>City conditions</h2><p>Temporary modifiers apply to everyone in your city while their window is active.</p></header>
        {page.cityConditions.map((condition) => <CityConditionCard key={condition.key} condition={condition} />)}
      </section> : null}
      {!page && !error ? <Panel title="Loading events"><p className="se-hint">Checking the event calendar…</p></Panel> : null}
      {page && selected.length === 0 ? <Panel title={`No ${tab} events`}><p className="se-hint">Events in this section will appear here, with their schedule and progress.</p><Link className="se-btn se-btn--ghost" to="/game/quests">Browse jobs</Link></Panel> : null}
      {selected.map(({ event, shelf }) => <EventCard key={`${event.key}-${event.attempt}`} event={event} shelf={shelf} />)}
    </main>
  </GameLayout>;
}
