import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { QuestContactDto, QuestPageDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { questsApi } from '../api/quests.js';
import { Alert } from '../components/Alert.js';
import { Portrait } from '../components/Portrait.js';
import { questHref } from '../components/QuestLink.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { publishQuestsChanged, trackedFromQuests } from '../quests/questSignals.js';
import { confirmAction } from '../stores/confirm.js';
import { useSession } from '../stores/session.js';
import { contactJobs, contactRoomHref, lockedJobCount } from '../utils/contactRoom.js';
import { formatWhen } from '../utils/time.js';

type PhoneView = 'contacts' | 'jobs' | 'history' | 'unlocks';

interface ContactSummary {
  contact: QuestContactDto;
  ready: number;
  active: number;
  available: number;
  locked: number;
}

function summaryFor(page: QuestPageDto, contact: QuestContactDto): ContactSummary {
  const jobs = contactJobs(page.quests, contact.key);
  return {
    contact,
    ready: jobs.filter((job) => job.status === 'READY_TO_TURN_IN').length,
    active: jobs.filter((job) => job.status === 'ACTIVE').length,
    available: jobs.filter((job) => job.status === 'AVAILABLE').length,
    locked: lockedJobCount(page.quests, contact.key),
  };
}

type QuestTrailJob = QuestPageDto['quests'][number];

function questProgressLabel(status: QuestTrailJob['status']): string {
  switch (status) {
    case 'AVAILABLE': return 'Available now';
    case 'ACTIVE': return 'In progress';
    case 'READY_TO_TURN_IN': return 'Ready to collect';
    case 'COMPLETED': return 'Completed';
    case 'LOCKED': return 'Locked';
    default: return 'Not available';
  }
}

function QuestTrailNode({ quest, quests, expandedQuestKeys, onToggle, ancestors = [] }: {
  quest: QuestTrailJob;
  quests: QuestTrailJob[];
  expandedQuestKeys: ReadonlySet<string>;
  onToggle: (questKey: string) => void;
  ancestors?: readonly string[];
}) {
  const expanded = expandedQuestKeys.has(quest.key);
  const requirements = quest.requires ?? [];
  const cyclic = ancestors.includes(quest.key);
  const nextAncestors = [...ancestors, quest.key];

  return (
    <li className="se-quest-phone__trail-node">
      <button
        type="button"
        className="se-quest-phone__trail-toggle"
        aria-expanded={expanded}
        onClick={() => onToggle(quest.key)}
      >
        <span><strong>{quest.title}</strong><small>{questProgressLabel(quest.status)}</small></span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {expanded ? (
        <div className="se-quest-phone__trail-detail">
          {cyclic ? <p>This quest loops back to an earlier requirement.</p> : quest.status === 'LOCKED' && requirements.length ? (
            <>
              <span className="se-eyebrow">To open this quest</span>
              <ul>
                {requirements.map((requirement, index) => {
                  const prerequisite = requirement.questKey ? quests.find((entry) => entry.key === requirement.questKey) : undefined;
                  return prerequisite ? (
                    <QuestTrailNode
                      key={`${prerequisite.key}:${index}`}
                      quest={prerequisite}
                      quests={quests}
                      expandedQuestKeys={expandedQuestKeys}
                      onToggle={onToggle}
                      ancestors={nextAncestors}
                    />
                  ) : <li key={`${requirement.questKey ?? requirement.label}:${index}`}>{requirement.label}</li>;
                })}
              </ul>
            </>
          ) : quest.status === 'LOCKED' ? (
            <p>No earlier quest is listed for this job yet.</p>
          ) : quest.status === 'COMPLETED' ? (
            <p>This job is complete.</p>
          ) : (
            <>
              <p>{quest.status === 'AVAILABLE' ? 'This job is available now.' : quest.status === 'READY_TO_TURN_IN' ? 'Collect this job to receive its unlock.' : 'Continue this job to reach the unlock.'}</p>
              <Link className="se-btn se-btn--ghost se-btn--sm" to={questHref(quest.key)}>
                {quest.status === 'AVAILABLE' ? 'Open this job' : 'Continue this job'} <span aria-hidden="true">→</span>
              </Link>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function JobDetails({ job, completed = false, onTrack, tracking = false, onClaim, claiming = false }: {
  job: QuestPageDto['quests'][number];
  completed?: boolean;
  onTrack?: (job: QuestPageDto['quests'][number]) => void;
  tracking?: boolean;
  onClaim?: (job: QuestPageDto['quests'][number], branchKey?: string, branchTitle?: string) => void;
  claiming?: boolean;
}) {
  const readyToCollect = !completed && job.status === 'READY_TO_TURN_IN';

  return (
    <details className="se-quest-phone__active-job">
      <summary>
        <span className="se-quest-phone__active-icon" aria-hidden="true">{completed ? '✓' : job.status === 'READY_TO_TURN_IN' ? '$' : '›'}</span>
        <span><strong>{job.title}</strong><small>{job.contactName ?? 'Personal job'} · {completed ? (job.completedAt ? formatWhen(job.completedAt) : 'Completed') : job.status === 'READY_TO_TURN_IN' ? 'Ready to collect' : 'In progress'}</small></span>
        <span className="se-quest-phone__active-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="se-quest-phone__job-details">
        <p>{job.description}</p>
        {job.objectives.length ? (
          <div className="se-quest-phone__job-block">
            <span className="se-eyebrow">Objectives</span>
            <ul>
              {job.objectives.map((objective) => <li key={objective.id} className={objective.completed ? 'is-complete' : undefined}>{objective.description}<small>{objective.current}/{objective.target}</small></li>)}
            </ul>
          </div>
        ) : null}
        {job.rewards.length ? (
          <div className="se-quest-phone__job-block">
            <span className="se-eyebrow">Rewards</span>
            <div className="se-quest-phone__job-rewards">{job.rewards.map((reward, index) => <span key={`${reward.kind}:${reward.key ?? index}`}>{reward.label}</span>)}</div>
          </div>
        ) : null}
        {!completed && job.contactKey ? (
          <Link
            className={`se-btn se-btn--${readyToCollect ? 'primary' : 'ghost'} se-btn--sm`}
            to={`${contactRoomHref(job.contactKey)}?job=${encodeURIComponent(job.key)}`}
          >
            {readyToCollect ? 'Collect payment' : 'Open quest questions'} <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {readyToCollect && !job.contactKey && onClaim ? (
          <div className="se-quest-phone__job-actions">
            {job.branchChoices.length ? job.branchChoices.map((choice) => (
              <button
                key={choice.key}
                type="button"
                className="se-btn se-btn--primary se-btn--sm"
                disabled={claiming}
                onClick={() => onClaim(job, choice.key, choice.title)}
              >
                {choice.title}
              </button>
            )) : (
              <button type="button" className="se-btn se-btn--primary se-btn--sm" disabled={claiming} onClick={() => onClaim(job)}>
                {claiming ? 'Collecting…' : 'Collect payment'}
              </button>
            )}
          </div>
        ) : null}
        {!completed && onTrack ? (
          <button
            type="button"
            className="se-btn se-btn--ghost se-btn--sm"
            aria-pressed={job.isTracked}
            disabled={tracking}
            onClick={() => onTrack(job)}
          >
            {job.isTracked ? 'Untrack job' : 'Track job'}
          </button>
        ) : null}
      </div>
    </details>
  );
}

/** The phone is the front door for personal work; contracts remain on the old work desk. */
export function QuestPhonePage() {
  const me = useSession((state) => state.me);
  const refreshSnapshot = useSession((state) => state.refreshSnapshot);
  const location = useLocation();
  const navigate = useNavigate();
  const [page, setPage] = useState<QuestPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<QuestPageDto['quests'] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [trackingKey, setTrackingKey] = useState<string | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [unlockSearch, setUnlockSearch] = useState('');
  const [expandedQuestKeys, setExpandedQuestKeys] = useState<Set<string>>(() => new Set());

  const requestedView = new URLSearchParams(location.search).get('view');
  const view: PhoneView = requestedView === 'jobs' || requestedView === 'history' || requestedView === 'unlocks' ? requestedView : 'contacts';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPage(await questsApi.page());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Your contacts are not answering right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (view !== 'history' || history || historyLoading) return;
    setHistoryLoading(true);
    void questsApi.history().then((result) => {
      setHistory(result.quests);
    }).catch(() => {
      setError('Your old conversations could not be loaded.');
    }).finally(() => {
      setHistoryLoading(false);
    });
  }, [history, historyLoading, view]);

  useEffect(() => {
    if (!page) return;
    const params = new URLSearchParams(location.search);
    let hashFocus: string | null = null;
    if (location.hash.startsWith('#quest-')) {
      try { hashFocus = decodeURIComponent(location.hash.slice('#quest-'.length)); }
      catch { hashFocus = location.hash.slice('#quest-'.length); }
    }
    const focus = params.get('focus') ?? hashFocus;
    if (focus) {
      const quest = page.quests.find((entry) => entry.key === focus);
      if (quest?.contactKey) {
        navigate(contactRoomHref(quest.contactKey), { replace: true });
        return;
      }
    }
    if (params.has('tab')) {
      navigate(`/game/quests?view=${params.get('tab') === 'completed' ? 'history' : 'jobs'}`, { replace: true });
    }
  }, [location.hash, location.search, navigate, page]);

  const contacts = useMemo(() => {
    if (!page) return [];
    return page.contacts
      .map((contact) => summaryFor(page, contact))
      .sort((left, right) => (right.ready - left.ready)
        || ((right.active + right.available) - (left.active + left.available))
        || left.contact.name.localeCompare(right.contact.name));
  }, [page]);

  if (!me) return <Navigate to="/join" replace />;

  const ready = page?.counts.ready ?? 0;
  const active = page?.counts.active ?? 0;
  const openContacts = contacts.filter((entry) => entry.ready || entry.active || entry.available).length;
  const activeJobs = page?.quests.filter((quest) => quest.status === 'ACTIVE' || quest.status === 'READY_TO_TURN_IN') ?? [];
  const trackedJobs = activeJobs.filter((job) => job.isTracked);
  function toggleQuestTrail(questKey: string) {
    setExpandedQuestKeys((current) => {
      const next = new Set(current);
      if (next.has(questKey)) next.delete(questKey);
      else next.add(questKey);
      return next;
    });
  }
  const filteredUnlocks = (page?.questUnlocks ?? []).filter((unlock) => {
    const query = unlockSearch.trim().toLocaleLowerCase();
    return !query || [unlock.name, unlock.description, unlock.category, unlock.quest.title, unlock.quest.giverName ?? '']
      .some((part) => part.toLocaleLowerCase().includes(query));
  });

  async function toggleTracking(job: QuestPageDto['quests'][number]) {
    setTrackingKey(job.key);
    setError(null);
    try {
      const next = await questsApi.track(job.key, !job.isTracked);
      setPage(next);
      publishQuestsChanged({ scope: 'board', quests: next.quests, tracked: trackedFromQuests(next.quests) });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That tracking change did not go through. Try again.');
    } finally {
      setTrackingKey(null);
    }
  }

  async function claimJob(job: QuestPageDto['quests'][number], branchKey?: string, branchTitle?: string) {
    const locking = job.factionStandings.filter((standing) => standing.locks?.length);
    if (locking.length && !(await confirmAction({
      title: `Join ${locking.map((standing) => standing.factionName).join(' and ')}'s Inner Circle?`,
      body: locking.map((standing) => `This locks ${standing.locks!.join(' and ')}'s Inner Circle for the rest of the season.`).join(' '),
      confirmLabel: 'Collect and join',
    }))) return;
    if (branchKey && !(await confirmAction({
      title: `Choose "${branchTitle ?? branchKey}"?`,
      body: 'This choice is permanent for this round and locks the other follow-up path.',
      confirmLabel: 'Choose this path',
    }))) return;

    setClaimingKey(job.key);
    setError(null);
    try {
      const result = await questsApi.claim(job.key, crypto.randomUUID(), branchKey);
      useSession.getState().applyActionSnapshot(result.after, result.rankChanges);
      const next = await questsApi.page();
      setPage(next);
      publishQuestsChanged({ scope: 'action', quests: next.quests, tracked: trackedFromQuests(next.quests) });
      setHistory(null);
      void refreshSnapshot({ background: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Payment could not be collected.');
    } finally {
      setClaimingKey(null);
    }
  }

  return (
    <GameLayout>
      <div className="se-quest-phone">
        <header className="se-quest-phone__topbar">
          <div>
            <span className="se-eyebrow">Street line · private</span>
            <h1>{view === 'contacts' ? 'Contacts' : view === 'jobs' ? 'My jobs' : view === 'unlocks' ? 'Quest unlocks' : 'History'}</h1>
          </div>
          <span className="se-quest-phone__signal" aria-label="Connected">● Connected</span>
        </header>

        <nav className="se-quest-phone__apps" aria-label="Phone apps">
          <Link className={view === 'contacts' ? 'is-active' : undefined} to="/game/quests?view=contacts" aria-current={view === 'contacts' ? 'page' : undefined}><span aria-hidden="true">◉</span>Contacts</Link>
          <Link className={view === 'jobs' ? 'is-active' : undefined} to="/game/quests?view=jobs" aria-current={view === 'jobs' ? 'page' : undefined}><span aria-hidden="true">▣</span>My jobs</Link>
          <Link className={view === 'history' ? 'is-active' : undefined} to="/game/quests?view=history" aria-current={view === 'history' ? 'page' : undefined}><span aria-hidden="true">▤</span>History</Link>
          <Link className={view === 'unlocks' ? 'is-active' : undefined} to="/game/quests?view=unlocks" aria-current={view === 'unlocks' ? 'page' : undefined}><span aria-hidden="true">⌕</span>Unlocks</Link>
        </nav>

        <section className="se-quest-phone__intro" aria-labelledby="quest-phone-intro-title">
          <div>
            <span className="se-eyebrow">{view === 'contacts' ? 'Your people know the work' : view === 'jobs' ? 'Keep the line open' : view === 'unlocks' ? 'Find the job behind the lock' : 'What has already happened'}</span>
            <h2 id="quest-phone-intro-title">{view === 'contacts' ? 'Who are you calling?' : view === 'jobs' ? 'What is still on your plate?' : view === 'unlocks' ? 'What do you need to unlock?' : 'Your finished business'}</h2>
            <p>{view === 'contacts'
              ? 'Jobs come through people, not a board. Open a conversation to hear what is happening, take a job, or settle what you already owe.'
              : view === 'jobs'
                ? 'Your active work stays here. Open the contact who gave it to you when you are ready to make your next move.'
                : view === 'unlocks'
                  ? 'Search weapons, products, travel, or districts to see which job opens them and what you need to do first.'
                  : 'The street remembers. Revisit completed jobs and the choices you made with the people who trusted you.'}</p>
          </div>
          <div className="se-quest-phone__stats" aria-label="Job summary">
            <span><strong>{formatNumber(ready)}</strong><small>ready</small></span>
            <span><strong>{formatNumber(active)}</strong><small>active</small></span>
            <span><strong>{formatNumber(trackedJobs.length)}</strong><small>tracked</small></span>
            <span><strong>{formatNumber(openContacts)}</strong><small>with work</small></span>
          </div>
        </section>

        {error ? <Alert>{error}</Alert> : null}
        {loading && !page ? <p className="se-muted" role="status">Checking the line…</p> : null}

        {page && view === 'contacts' ? (
          <section className="se-quest-phone__active" aria-labelledby="quest-phone-tracked-title">
            <div className="se-quest-phone__sectionhead">
              <div>
                <span className="se-eyebrow">Keep them close</span>
                <h2 id="quest-phone-tracked-title">Tracked jobs</h2>
              </div>
              <span className="se-quest-phone__sectionmeta">{formatNumber(trackedJobs.length)} saved</span>
            </div>
            <div className="se-quest-phone__active-list">
               {trackedJobs.length ? trackedJobs.map((job) => <JobDetails key={job.key} job={job} onTrack={toggleTracking} tracking={trackingKey === job.key} onClaim={claimJob} claiming={claimingKey === job.key} />) : (
                <p className="se-quest-phone__empty">No jobs are tracked yet. Open a job below and keep it on your line.</p>
              )}
            </div>
          </section>
        ) : null}

        {page && view === 'contacts' ? (
          <section className="se-quest-phone__contacts" aria-labelledby="quest-phone-contacts-title">
            <div className="se-quest-phone__sectionhead">
              <div>
                <span className="se-eyebrow">Your street book</span>
                <h2 id="quest-phone-contacts-title">Contacts</h2>
              </div>
              <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void load()} disabled={loading}>
                Refresh
              </button>
            </div>
            <div className="se-quest-phone__grid">
              {contacts.map(({ contact, ready: readyCount, active: activeCount, available, locked }) => {
                const workCount = readyCount + activeCount + available;
                return (
                  <article className={`se-quest-phone__contact${readyCount ? ' is-ready' : workCount ? ' has-work' : ''}`} key={contact.key}>
                    <div className="se-quest-phone__contact-head">
                      <Portrait who={contact.key} size="md" label={contact.name} />
                      <div>
                        <span className="se-eyebrow">{contact.role}</span>
                        <h3>{contact.shortName}</h3>
                        <span className="se-quest-phone__standing">{contact.standing} · {formatNumber(contact.points)} rep</span>
                      </div>
                      {readyCount ? <span className="se-quest-phone__badge">{readyCount} ready</span> : workCount ? <span className="se-quest-phone__badge se-quest-phone__badge--dim">{workCount} open</span> : null}
                    </div>
                    <p>{contact.description}</p>
                    <div className="se-quest-phone__contact-meta">
                      {activeCount ? <span>{activeCount} active</span> : null}
                      {available ? <span>{available} on offer</span> : null}
                      {locked ? <span>{locked} locked</span> : null}
                      {contact.faction ? <span>{contact.faction.name}</span> : contact.independent ? <span>Independent</span> : null}
                    </div>
                    <Link className="se-btn se-btn--primary se-quest-phone__call" to={contactRoomHref(contact.key)}>
                      Open conversation <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {page && view === 'jobs' ? (
          <section id="active" className="se-quest-phone__active" aria-labelledby="quest-phone-active-title">
            <div className="se-quest-phone__sectionhead">
              <div>
                <span className="se-eyebrow">Keep the line open</span>
                <h2 id="quest-phone-active-title">My jobs</h2>
              </div>
              <span className="se-quest-phone__sectionmeta">{formatNumber(activeJobs.length)} active</span>
            </div>
            <div className="se-quest-phone__active-list">
                {activeJobs.length ? activeJobs.map((job) => <JobDetails key={job.key} job={job} onTrack={toggleTracking} tracking={trackingKey === job.key} onClaim={claimJob} claiming={claimingKey === job.key} />) : <p className="se-quest-phone__empty">Nothing is active. Call someone when you are ready for more work.</p>}
            </div>
          </section>
        ) : null}

        {page && view === 'unlocks' ? (
          <section className="se-quest-phone__active" aria-labelledby="quest-phone-unlocks-title">
            <div className="se-quest-phone__sectionhead">
              <div>
                <span className="se-eyebrow">Round progression</span>
                <h2 id="quest-phone-unlocks-title">Unlock lookup</h2>
              </div>
              <span className="se-quest-phone__sectionmeta">{formatNumber(filteredUnlocks.length)} found</span>
            </div>
            <label className="se-quest-phone__lookup-label" htmlFor="quest-unlock-search">Search unlocks</label>
            <input
              id="quest-unlock-search"
              className="se-quest-phone__lookup-search"
              type="search"
              value={unlockSearch}
              onChange={(event) => setUnlockSearch(event.target.value)}
              placeholder="Try AK-47, Meth, Casino…"
              autoComplete="off"
            />
            <div className="se-quest-phone__unlock-list">
              {filteredUnlocks.map((unlock) => {
                const quest = page.quests.find((job) => job.key === unlock.quest.key);
                const status = unlock.unlocked ? 'Unlocked this round'
                  : unlock.questStatus === 'AVAILABLE' ? 'Job available'
                    : unlock.questStatus === 'ACTIVE' ? 'Job in progress'
                      : unlock.questStatus === 'READY_TO_TURN_IN' ? 'Ready to collect'
                        : unlock.questStatus === 'COMPLETED' ? 'Job completed'
                          : unlock.questStatus === 'LOCKED' ? 'Job locked' : 'Not available';
                return (
                  <article className={`se-quest-phone__unlock${unlock.unlocked ? ' is-open' : ''}`} key={unlock.key}>
                    <div className="se-quest-phone__unlock-head">
                      <div><span className="se-eyebrow">{unlock.category}</span><h3>{unlock.name}</h3></div>
                      <span className="se-quest-phone__unlock-status">{status}</span>
                    </div>
                    <p>{unlock.description}</p>
                    <div className="se-quest-phone__unlock-route">
                      <span>{unlock.unlocked ? 'Opened by' : 'Unlock quest'}</span>
                      {quest ? (
                        <ul className="se-quest-phone__trail-list">
                          <QuestTrailNode
                            quest={quest}
                            quests={page.quests}
                            expandedQuestKeys={expandedQuestKeys}
                            onToggle={toggleQuestTrail}
                          />
                        </ul>
                      ) : <strong>{unlock.quest.title}{unlock.quest.giverName ? ` for ${unlock.quest.giverName}` : ''}</strong>}
                    </div>
                    {!unlock.unlocked && !quest && unlock.requires.length ? (
                      <p className="se-quest-phone__unlock-prereq">This job is locked. Earlier requirements: {unlock.requires.map((requirement) => requirement.label).join(' · ')}</p>
                    ) : null}
                  </article>
                );
              })}
              {!filteredUnlocks.length ? <p className="se-quest-phone__empty">{page.questUnlocks?.length ? 'No unlocks match that search.' : 'No quest locked features are set up in this round.'}</p> : null}
            </div>
          </section>
        ) : null}

        {view === 'history' ? (
          <section className="se-quest-phone__active" aria-labelledby="quest-phone-history-title">
            <div className="se-quest-phone__sectionhead">
              <div>
                <span className="se-eyebrow">The record</span>
                <h2 id="quest-phone-history-title">Finished jobs</h2>
              </div>
              <span className="se-quest-phone__sectionmeta">{history ? formatNumber(history.length) : '—'} saved</span>
            </div>
            {historyLoading ? <p className="se-muted" role="status">Pulling the old messages…</p> : history?.length ? (
              <div className="se-quest-phone__active-list">
                {history.map((job) => <JobDetails key={`${job.key}:${job.attempt}`} job={job} completed />)}
              </div>
            ) : <p className="se-quest-phone__empty">No finished conversations yet.</p>}
          </section>
        ) : null}

        <footer className="se-quest-phone__footer">
          <span>Need work?</span>
          <span>Call someone you trust.</span>
        </footer>
      </div>
    </GameLayout>
  );
}
import '../styles/quests.css';
import '../styles/quest-phone.css';
