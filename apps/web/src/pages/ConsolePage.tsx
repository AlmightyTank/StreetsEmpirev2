import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  ConsoleActivityDto,
  ConsoleActivityEntryDto,
  ConsoleActivityFilter,
  ConsoleBlocksDto,
  ConsoleCountsDto,
  DirectMessageDto,
  DirectMessageConversationDto,
  DirectMessageThreadDto,
  InAppNotificationDto,
  InAppNotificationFeedDto,
  PimpConsoleThreadsDto,
} from '@streets/shared';
import {
  MESSAGE_BODY_MAX,
  MESSAGE_REPORT_REASON_MAX,
  MESSAGE_SUBJECT_MAX,
} from '@streets/shared';
import { announceConsoleUpdated, consoleApi } from '../api/console.js';
import { notificationsApi } from '../api/notifications.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { activityGroup, activityGroupLabel, describeActivity } from '../components/ActivityFeed.js';
import { AllianceWire } from '../components/AllianceWire.js';
import { gameEventToastFor } from '../components/GameEventToasts.js';
import { Panel } from '../components/Panel.js';
import { PendingEncountersPanel } from '../components/PendingEncountersPanel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { confirmAction } from '../stores/confirm.js';
import { formatWhen } from '../utils/time.js';

type ConsoleView = 'threads' | 'alliance' | 'attacks' | 'notifications' | 'activity' | 'archived' | 'blocked';
type ConsoleMode = 'detail' | 'compose';

const VIEWS: Array<{ key: ConsoleView; label: string }> = [
  { key: 'threads', label: 'Threads' },
  { key: 'alliance', label: 'Alliance' },
  { key: 'attacks', label: 'Attacks' },
  { key: 'notifications', label: 'Alerts' },
  { key: 'activity', label: 'Activity' },
  { key: 'archived', label: 'Archived' },
  { key: 'blocked', label: 'Blocked & muted' },
];

const EMPTY_NOTIFICATION_FEED: InAppNotificationFeedDto = { notifications: [], unreadCount: 0 };

const ACTIVITY_FILTERS: Array<{ key: ConsoleActivityFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'combat', label: 'Attacks' },
  { key: 'turf', label: 'Turf' },
  { key: 'travel', label: 'Travel' },
  { key: 'market', label: 'Market' },
  { key: 'progress', label: 'Progress' },
  { key: 'street', label: 'Street' },
  { key: 'system', label: 'System' },
];

function messageTime(value: string): string {
  return formatWhen(value);
}

function subjectForReply(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export function ConsolePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const crackWord = useSession((s) => s.me?.products) ? 'crack' : 'product';
  const pendingEncounters = useSession((s) => s.me?.pendingEncounters ?? []);
  const [view, setView] = useState<ConsoleView>(() => {
    const requested = searchParams.get('view');
    if (requested === 'inbox' || requested === 'sent') return 'threads';
    return VIEWS.some((item) => item.key === requested) ? requested as ConsoleView : 'threads';
  });
  const [activityFilter, setActivityFilter] = useState<ConsoleActivityFilter>('all');
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<ConsoleCountsDto | null>(null);
  const [data, setData] = useState<PimpConsoleThreadsDto | null>(null);
  const [conversation, setConversation] = useState<DirectMessageConversationDto | null>(null);
  const [selectedThreadPimpId, setSelectedThreadPimpId] = useState<number | null>(null);
  const [activityData, setActivityData] = useState<ConsoleActivityDto | null>(null);
  const [blocks, setBlocks] = useState<ConsoleBlocksDto | null>(null);
  const [notifications, setNotifications] = useState<InAppNotificationFeedDto | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [mode, setMode] = useState<ConsoleMode>('detail');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const actionId = useRef(newActionId());

  const selected = conversation?.messages.find((message) => message.id === selectedId)
    ?? conversation?.messages.at(-1)
    ?? null;
  const selectedEvent = activityData?.events.find((event) => event.activity.id === selectedEventId) ?? activityData?.events[0] ?? null;
  const selectedNotification =
    notifications?.notifications.find((notification) => notification.id === selectedNotificationId)
    ?? notifications?.notifications[0]
    ?? null;

  useEffect(() => {
    const requested = searchParams.get('view');
    if (requested === 'inbox' || requested === 'sent') {
      setView('threads');
    } else if (requested && VIEWS.some((item) => item.key === requested)) {
      setView(requested as ConsoleView);
    } else if (!searchParams.get('to')) {
      setView('threads');
    }

    const to = searchParams.get('to');
    if (!to || !/^\d+$/.test(to)) return;
    setRecipient(to);
    setMode('compose');
  }, [searchParams]);

  useEffect(() => {
    let live = true;
    setError(null);
    setSelectedId(null);
    setSelectedEventId(null);
    setReporting(false);
    setData(null);
    setConversation(null);
    setActivityData(null);
    setNotifications(null);

    if (view === 'blocked') {
      Promise.all([consoleApi.blocks(), consoleApi.summary()])
        .then(([nextBlocks, nextCounts]) => {
          if (!live) return;
          setBlocks(nextBlocks);
          setCounts(nextCounts);
        })
        .catch((caught: unknown) => {
          if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load blocked players.');
        });
      return () => { live = false; };
    }

    if (view === 'alliance') {
      consoleApi.summary()
        .then((nextCounts) => {
          if (live) setCounts(nextCounts);
        })
        .catch((caught: unknown) => {
          if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load the Console.');
        });
      return () => { live = false; };
    }

    if (view === 'activity' || view === 'attacks') {
      const filter = view === 'attacks' ? 'combat' : activityFilter;
      Promise.all([consoleApi.activity(filter, page), consoleApi.summary()])
        .then(([nextActivity, nextCounts]) => {
          if (!live) return;
          setActivityData(nextActivity);
          setCounts(nextCounts);
          setSelectedEventId(nextActivity.events[0]?.activity.id ?? null);
        })
        .catch((caught: unknown) => {
          if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load the activity console.');
        });
      return () => { live = false; };
    }

    if (view === 'notifications') {
      Promise.all([notificationsApi.inbox(), consoleApi.summary()])
        .then(([nextNotifications, nextCounts]) => {
          if (!live) return;
          setNotifications(nextNotifications);
          setCounts(nextCounts);
          setSelectedNotificationId(nextNotifications.notifications[0]?.id ?? null);
        })
        .catch((caught: unknown) => {
          if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load notifications.');
        });
      return () => { live = false; };
    }

    consoleApi.threads(view === 'archived' ? 'archived' : 'active', page)
      .then((next) => {
        if (!live) return;
        setData(next);
        setCounts(next.counts);
        setSelectedThreadPimpId((current) => {
          if (current && next.threads.some((thread) => thread.counterpart.publicPimpId === current)) return current;
          return next.threads[0]?.counterpart.publicPimpId ?? null;
        });
      })
      .catch((caught: unknown) => {
        if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load the Console.');
      });
    return () => { live = false; };
  }, [view, activityFilter, page]);

  useEffect(() => {
    if ((view !== 'threads' && view !== 'archived') || mode === 'compose' || !selectedThreadPimpId) {
      setConversation(null);
      setSelectedId(null);
      return;
    }

    let live = true;
    setReporting(false);
    setReportReason('');
    consoleApi.conversation(selectedThreadPimpId)
      .then(async (next) => {
        if (!live) return;
        setConversation(next);
        setSelectedId((current) =>
          current && next.messages.some((message) => message.id === current)
            ? current
            : next.messages.at(-1)?.id ?? null);

        const unread = next.messages.filter((message) => message.direction === 'in' && !message.readAt);
        if (!unread.length) return;
        const readAt = new Date().toISOString();
        setCounts((current) => current ? {
          ...current,
          unread: Math.max(0, current.unread - unread.length),
        } : current);
        setData((current) => current ? {
          ...current,
          counts: {
            ...current.counts,
            unread: Math.max(0, current.counts.unread - unread.length),
          },
          threads: current.threads.map((thread) =>
            thread.counterpart.publicPimpId === next.counterpart.publicPimpId
              ? { ...thread, unreadCount: 0 }
              : thread),
        } : current);
        setConversation((current) => current && current.counterpart.publicPimpId === next.counterpart.publicPimpId ? {
          ...current,
          unreadCount: 0,
          messages: current.messages.map((message) =>
            message.direction === 'in' && !message.readAt ? { ...message, readAt } : message),
        } : current);
        try {
          await Promise.all(unread.map((message) => consoleApi.read(message.id)));
          announceConsoleUpdated();
        } catch {
          await refreshCurrent();
        }
      })
      .catch((caught: unknown) => {
        if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load that thread.');
      });
    return () => { live = false; };
  }, [view, mode, selectedThreadPimpId]);

  function changeComposeField(setter: (value: string) => void, value: string) {
    setter(value);
    actionId.current = newActionId();
  }

  async function refreshCurrent() {
    if (view === 'blocked') {
      const [nextBlocks, nextCounts] = await Promise.all([consoleApi.blocks(), consoleApi.summary()]);
      setBlocks(nextBlocks);
      setCounts(nextCounts);
      return;
    }
    if (view === 'activity') {
      const [nextActivity, nextCounts] = await Promise.all([consoleApi.activity(activityFilter, page), consoleApi.summary()]);
      setActivityData(nextActivity);
      setCounts(nextCounts);
      return;
    }
    if (view === 'attacks') {
      const [nextActivity, nextCounts] = await Promise.all([consoleApi.activity('combat', page), consoleApi.summary()]);
      setActivityData(nextActivity);
      setCounts(nextCounts);
      return;
    }
    if (view === 'alliance') {
      setCounts(await consoleApi.summary());
      return;
    }
    if (view === 'notifications') {
      const [nextNotifications, nextCounts] = await Promise.all([notificationsApi.inbox(), consoleApi.summary()]);
      setNotifications(nextNotifications);
      setCounts(nextCounts);
      return;
    }
    const next = await consoleApi.threads(view === 'archived' ? 'archived' : 'active', page);
    setData(next);
    setCounts(next.counts);
    if (selectedThreadPimpId) {
      setConversation(await consoleApi.conversation(selectedThreadPimpId));
    }
  }

  function openThread(thread: DirectMessageThreadDto) {
    setSelectedThreadPimpId(thread.counterpart.publicPimpId);
    setSelectedId(thread.lastMessageId);
    setMode('detail');
    setReporting(false);
    setReportReason('');
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const target = Number(recipient.replace(/^#/, ''));
    if (!Number.isSafeInteger(target) || target < 1) {
      setError('Enter a valid public pimp number.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await consoleApi.send({
        recipientPublicPimpId: target,
        subject,
        body,
        actionId: actionId.current,
      });
      setNotice(result.replayed ? 'That message was already delivered.' : 'Message sent.');
      setRecipient('');
      setSubject('');
      setBody('');
      actionId.current = newActionId();
      setMode('detail');
      setView('threads');
      setPage(1);
      const next = await consoleApi.threads('active', 1);
      setData(next);
      setCounts(next.counts);
      setSelectedThreadPimpId(result.message.counterpart.publicPimpId);
      setSelectedId(result.message.id);
      setConversation(await consoleApi.conversation(result.message.counterpart.publicPimpId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The message did not go through.');
    } finally {
      setBusy(false);
    }
  }

  async function sendThreadReply(event: FormEvent, thread: DirectMessageConversationDto) {
    event.preventDefault();
    const lastSubject = thread.messages.at(-1)?.subject ?? 'Street business';

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await consoleApi.send({
        recipientPublicPimpId: thread.counterpart.publicPimpId,
        subject: subjectForReply(lastSubject),
        body,
        actionId: actionId.current,
      });
      setNotice(result.replayed ? 'That reply was already delivered.' : 'Reply sent.');
      setBody('');
      actionId.current = newActionId();
      setView('threads');
      setPage(1);
      const [nextThreads, nextConversation] = await Promise.all([
        consoleApi.threads('active', 1),
        consoleApi.conversation(thread.counterpart.publicPimpId),
      ]);
      setData(nextThreads);
      setCounts(nextThreads.counts);
      setConversation(nextConversation);
      setSelectedThreadPimpId(thread.counterpart.publicPimpId);
      setSelectedId(result.message.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The reply did not go through.');
    } finally {
      setBusy(false);
    }
  }

  async function archive(message: DirectMessageDto, archived: boolean) {
    setBusy(true);
    setError(null);
    try {
      await consoleApi.archive(message.id, archived);
      setSelectedId(null);
      await refreshCurrent();
      setNotice(archived ? 'Message archived.' : 'Message restored.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update that message.');
    } finally {
      setBusy(false);
    }
  }

  async function report(message: DirectMessageDto) {
    if (!reportReason.trim()) {
      setError('Tell us why you are reporting this message.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await consoleApi.report(message.id, reportReason.trim());
      setData((current) => current ? {
        ...current,
        threads: current.threads.map((thread) =>
          thread.counterpart.publicPimpId === message.counterpart.publicPimpId
            ? { ...thread, reported: true }
            : thread),
      } : current);
      setConversation((current) => current ? {
        ...current,
        reported: true,
        messages: current.messages.map((row) =>
          row.id === message.id ? { ...row, reported: true } : row),
      } : current);
      setReporting(false);
      setReportReason('');
      setNotice('Report saved for moderation.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not submit that report.');
    } finally {
      setBusy(false);
    }
  }

  async function block(message: DirectMessageDto) {
    setBusy(true);
    setError(null);
    try {
      const next = await consoleApi.block(message.counterpart.publicPimpId);
      setBlocks(next);
      setCounts((current) => current ? { ...current, blocked: next.blocked.length } : current);
      setData((current) => current ? {
        ...current,
        counts: { ...current.counts, blocked: next.blocked.length },
        threads: current.threads.map((thread) =>
          thread.counterpart.publicPimpId === message.counterpart.publicPimpId
            ? { ...thread, blocked: true }
            : thread),
      } : current);
      setConversation((current) => current && current.counterpart.publicPimpId === message.counterpart.publicPimpId ? {
        ...current,
        blocked: true,
        messages: current.messages.map((row) => ({ ...row, blocked: true })),
      } : current);
      setNotice(`${message.counterpart.displayName} is blocked. Messages are disabled both ways.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not block that player.');
    } finally {
      setBusy(false);
    }
  }

  /** 0.9.0-H: private and one-sided. Their mail still arrives, straight into Archived. */
  async function setMuted(publicPimpId: number, displayName: string, muted: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = muted ? await consoleApi.mute(publicPimpId) : await consoleApi.unmute(publicPimpId);
      setBlocks(next);
      setCounts((current) => current ? { ...current, muted: next.muted.length } : current);
      setData((current) => current ? {
        ...current,
        counts: { ...current.counts, muted: next.muted.length },
        threads: current.threads.map((thread) =>
          thread.counterpart.publicPimpId === publicPimpId ? { ...thread, muted } : thread),
      } : current);
      setConversation((current) => current && current.counterpart.publicPimpId === publicPimpId ? {
        ...current,
        muted,
        messages: current.messages.map((row) => ({ ...row, muted })),
      } : current);
      setNotice(muted
        ? `${displayName} is muted. Their new messages go straight to Archived with no alerts. They are not told.`
        : `${displayName} is unmuted.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not change that mute.');
    } finally {
      setBusy(false);
    }
  }

  /** 0.9.0-H: remove the whole conversation from your side. Their copy is untouched. */
  async function hideConversation(message: DirectMessageDto) {
    if (!(await confirmAction({
      title: `Delete your conversation with ${message.counterpart.displayName}?`,
      body: 'This cannot be undone on your side. Their copy stays, and reports keep their evidence.',
      confirmLabel: 'Delete conversation',
      tone: 'danger',
    }))) return;
    setBusy(true);
    setError(null);
    try {
      const { hidden } = await consoleApi.hideConversation(message.counterpart.publicPimpId);
      setSelectedId(null);
      setSelectedThreadPimpId(null);
      setConversation(null);
      setData((current) => current ? {
        ...current,
        threads: current.threads.filter((thread) => thread.counterpart.publicPimpId !== message.counterpart.publicPimpId),
      } : current);
      setNotice(`Deleted ${hidden} message${hidden === 1 ? '' : 's'} with ${message.counterpart.displayName} from your Console.`);
      setCounts(await consoleApi.summary());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete that conversation.');
    } finally {
      setBusy(false);
    }
  }

  async function unblock(publicPimpId: number) {
    setBusy(true);
    setError(null);
    try {
      const next = await consoleApi.unblock(publicPimpId);
      setBlocks(next);
      setCounts((current) => current ? { ...current, blocked: next.blocked.length } : current);
      setData((current) => current ? {
        ...current,
        counts: { ...current.counts, blocked: next.blocked.length },
      } : current);
      setNotice('Player unblocked.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not unblock that player.');
    } finally {
      setBusy(false);
    }
  }

  async function markNotificationRead(notification: InAppNotificationDto) {
    if (notification.readAt) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current ? {
      unreadCount: Math.max(0, current.unreadCount - 1),
      notifications: current.notifications.map((item) => item.id === notification.id ? { ...item, readAt } : item),
    } : current);
    setCounts((current) => current ? {
      ...current,
      notifications: Math.max(0, current.notifications - 1),
    } : current);
    try {
      await notificationsApi.read(notification.id);
      window.dispatchEvent(new Event('streets:notifications-changed'));
      announceConsoleUpdated();
    } catch {
      await refreshCurrent();
    }
  }

  async function markAllNotificationsRead() {
    const current = notifications ?? EMPTY_NOTIFICATION_FEED;
    if (!current.unreadCount) return;
    const readAt = new Date().toISOString();
    setNotifications({
      unreadCount: 0,
      notifications: current.notifications.map((notification) =>
        notification.readAt ? notification : { ...notification, readAt }),
    });
    setCounts((existing) => existing ? { ...existing, notifications: 0 } : existing);
    try {
      await notificationsApi.readAll();
      window.dispatchEvent(new Event('streets:notifications-changed'));
      announceConsoleUpdated();
    } catch {
      await refreshCurrent();
    }
  }

  function countFor(key: ConsoleView): number {
    if (!counts) return key === 'blocked' ? (blocks?.blocked.length ?? 0) + (blocks?.muted.length ?? 0) : 0;
    if (key === 'threads') return data?.folder === 'active' ? data.total : counts.inbox + counts.sent;
    if (key === 'archived') return data?.folder === 'archived' ? data.total : counts.archived;
    if (key === 'alliance') return 0;
    if (key === 'attacks') return counts.attacks;
    if (key === 'notifications') return counts.notifications;
    if (key === 'activity') return counts.activity;
    return counts.blocked + (counts.muted ?? 0);
  }

  function selectActivityFilter(next: ConsoleActivityFilter) {
    setActivityFilter(next);
    setPage(1);
    setSelectedEventId(null);
  }

  function activityTitle(filter: ConsoleActivityFilter): string {
    return filter === 'all' ? 'All activity' : activityGroupLabel(filter);
  }

  function eventSummary(event: ConsoleActivityEntryDto) {
    return describeActivity(event.activity, crackWord);
  }

  function notificationSummary(notification: InAppNotificationDto) {
    const toast = gameEventToastFor(notification.activity, crackWord);
    const fallback = describeActivity(notification.activity, crackWord);
    return {
      title: toast?.title ?? activityGroupLabel(activityGroup(notification.activity.type)),
      detail: toast?.detail ?? [fallback.text, fallback.detail].filter(Boolean).join(' '),
      href: toast?.href ?? '/game/console?view=activity',
      group: activityGroup(notification.activity.type),
    };
  }

  return (
    <GameLayout>
      <div className="se-console">
        <header className="se-console-hero">
          <div>
            <span className="se-eyebrow">0.9.0 · Pimp Console</span>
            <h1>Console</h1>
            <p>Street mail and important operation history, collected in one place without replacing the reports that already own the facts.</p>
          </div>
          <div className="se-console-hero__stats">
            <span><small>Unread</small><strong>{counts?.unread ?? 0}</strong></span>
            <span><small>Alerts</small><strong>{counts?.notifications ?? notifications?.unreadCount ?? 0}</strong></span>
            <span><small>Threads</small><strong>{data?.folder === 'active' ? data.total : (counts ? counts.inbox + counts.sent : 0)}</strong></span>
            <span><small>Archived</small><strong>{counts?.archived ?? 0}</strong></span>
            <span><small>Attacks</small><strong>{counts?.attacks ?? 0}</strong></span>
            <span><small>Activity</small><strong>{counts?.activity ?? 0}</strong></span>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        <PendingEncountersPanel encounters={pendingEncounters} />

        <section className="se-console-bar">
          <div className="se-console-tabs" role="tablist" aria-label="Console folders">
            {VIEWS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                className={`se-console-tab${view === key ? ' se-console-tab--active' : ''}`}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('to');
                  if (key === 'threads') next.delete('view');
                  else next.set('view', key);
                  setSearchParams(next, { replace: true });
                  setView(key);
                  setPage(1);
                  setMode('detail');
                  setSelectedEventId(null);
                }}
              >
                <span>{label}</span>
                <strong>{countFor(key)}</strong>
                {key === 'threads' && (counts?.unread ?? 0) > 0
                  ? <em>{counts!.unread} unread</em>
                  : null}
                {key === 'notifications' && (counts?.notifications ?? notifications?.unreadCount ?? 0) > 0
                  ? <em>{counts?.notifications ?? notifications!.unreadCount} unread</em>
                  : null}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="se-btn se-btn--primary"
            onClick={() => {
              setView('threads');
              setPage(1);
              setMode('compose');
            }}
          >
            Compose
          </button>
          {data?.restriction ? (
            <p className="se-alert se-console-restriction" role="status">
              {data.restriction.permanent
                ? 'A moderator has switched off your messaging. You can still read your mail.'
                : `A moderator has paused your messaging until ${formatWhen(data.restriction.until!)}. You can still read your mail.`}
            </p>
          ) : null}
        </section>

        {view === 'activity' || view === 'attacks' ? (
          <section className="se-console-work se-console-work--activity">
            <Panel
              title={view === 'attacks' ? 'Attacks' : activityTitle(activityFilter)}
              aside={activityData ? `${activityData.events.length} of ${activityData.total}` : 'Loading'}
              flush
              className="se-console-listpanel"
            >
              {view === 'activity' ? (
                <div className="se-console-filterbar" role="tablist" aria-label="Activity category">
                  {ACTIVITY_FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      role="tab"
                      aria-selected={activityFilter === filter.key}
                      className={`se-console-filter${activityFilter === filter.key ? ' se-console-filter--active' : ''}`}
                      onClick={() => selectActivityFilter(filter.key)}
                    >
                      <span>{filter.label}</span>
                      <strong>{activityData?.counts[filter.key] ?? (filter.key === 'all' ? counts?.activity : 0) ?? 0}</strong>
                    </button>
                  ))}
                </div>
              ) : null}
              {!activityData ? <p className="se-muted se-console-pad">Reading the street log...</p> : null}
              {activityData && activityData.events.length === 0 ? (
                <div className="se-console-empty">
                  <strong>{view === 'attacks' ? 'No attacks recorded.' : 'No activity in this lane.'}</strong>
                  <span>{view === 'attacks' ? 'Combat reports will collect here when they happen.' : 'Switch categories to scan a different part of your operation.'}</span>
                </div>
              ) : null}
              <div className="se-console-list">
                {activityData?.events.map((event) => {
                  const summary = eventSummary(event);
                  return (
                    <button
                      key={event.activity.id}
                      type="button"
                      className={`se-console-message se-console-event se-console-event--${event.group}${selectedEventId === event.activity.id ? ' se-console-message--selected' : ''}`}
                      onClick={() => setSelectedEventId(event.activity.id)}
                    >
                      <span className="se-console-message__top">
                        <strong>{activityGroupLabel(event.group)}</strong>
                        <time>{messageTime(event.activity.createdAt)}</time>
                      </span>
                      <span className="se-console-message__subject">{summary.text}</span>
                      {summary.detail ? <span className="se-console-message__meta">{summary.detail}</span> : null}
                    </button>
                  );
                })}
              </div>
              {activityData && activityData.totalPages > 1 ? (
                <div className="se-console-pagination">
                  <button
                    type="button"
                    className="se-btn se-btn--ghost se-btn--sm"
                    disabled={activityData.page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </button>
                  <span className="se-num">Page {activityData.page} / {activityData.totalPages}</span>
                  <button
                    type="button"
                    className="se-btn se-btn--ghost se-btn--sm"
                    disabled={activityData.page >= activityData.totalPages}
                    onClick={() => setPage((current) => Math.min(activityData.totalPages, current + 1))}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </Panel>

            <div className="se-console-detail">
              {selectedEvent ? (() => {
                const summary = eventSummary(selectedEvent);
                return (
                  <Panel
                    title={activityGroupLabel(selectedEvent.group)}
                    aside={formatWhen(selectedEvent.activity.createdAt)}
                    className="se-console-panel"
                  >
                    <article className="se-console-eventdetail">
                      <strong>{summary.text}</strong>
                      {summary.detail ? <p>{summary.detail}</p> : null}
                      <div className="se-console-actions">
                        <Link className="se-btn se-btn--primary se-btn--sm" to={selectedEvent.href}>
                          Open report
                        </Link>
                        <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/console?view=activity">
                          Full log
                        </Link>
                      </div>
                    </article>
                  </Panel>
                );
              })() : (
                <Panel title="Activity console" className="se-console-panel">
                  <div className="se-console-placeholder">
                    <strong>Select an event to inspect.</strong>
                    <p>Each event points back to the authoritative page for the report, action, or system that created it.</p>
                  </div>
                </Panel>
              )}
            </div>
          </section>
        ) : view === 'alliance' ? (
          <section className="se-console-single">
            <AllianceWire />
          </section>
        ) : view === 'notifications' ? (
          <section className="se-console-work se-console-work--activity">
            <Panel
              title="Notifications"
              aside={notifications ? `${notifications.unreadCount} unread` : 'Loading'}
              flush
              className="se-console-listpanel"
            >
              {notifications && notifications.unreadCount > 0 ? (
                <div className="se-console-readall">
                  <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void markAllNotificationsRead()}>
                    Mark all read
                  </button>
                </div>
              ) : null}
              {!notifications ? <p className="se-muted se-console-pad">Checking notifications...</p> : null}
              {notifications && notifications.notifications.length === 0 ? (
                <div className="se-console-empty">
                  <strong>No recent notifications.</strong>
                  <span>Important alerts will collect here and in the bell.</span>
                </div>
              ) : null}
              <div className="se-console-list">
                {notifications?.notifications.map((notification) => {
                  const summary = notificationSummary(notification);
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      className={`se-console-message se-console-event se-console-event--${summary.group}${selectedNotificationId === notification.id ? ' se-console-message--selected' : ''}${notification.readAt ? '' : ' se-console-message--unread'}`}
                      onClick={() => {
                        setSelectedNotificationId(notification.id);
                        void markNotificationRead(notification);
                      }}
                    >
                      <span className="se-console-message__top">
                        <strong>{summary.title}</strong>
                        <time>{messageTime(notification.activity.createdAt)}</time>
                      </span>
                      <span className="se-console-message__subject">{summary.detail}</span>
                      <span className="se-console-message__meta">{activityGroupLabel(summary.group)}</span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <div className="se-console-detail">
              {selectedNotification ? (() => {
                const summary = notificationSummary(selectedNotification);
                return (
                  <Panel
                    title={summary.title}
                    aside={selectedNotification.readAt ? 'Read' : 'Unread'}
                    className="se-console-panel"
                  >
                    <article className="se-console-eventdetail">
                      <strong>{summary.detail}</strong>
                      <p>{formatWhen(selectedNotification.activity.createdAt)}</p>
                      <div className="se-console-actions">
                        <Link className="se-btn se-btn--primary se-btn--sm" to={summary.href}>
                          Open report
                        </Link>
                        {!selectedNotification.readAt ? (
                          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void markNotificationRead(selectedNotification)}>
                            Mark read
                          </button>
                        ) : null}
                      </div>
                    </article>
                  </Panel>
                );
              })() : (
                <Panel title="Notification center" className="se-console-panel">
                  <div className="se-console-placeholder">
                    <strong>Select an alert to inspect.</strong>
                    <p>Console alerts use the same durable in-game notifications as the bell.</p>
                  </div>
                </Panel>
              )}
            </div>
          </section>
        ) : view === 'blocked' ? (
          <Panel title="Blocked players" aside={blocks ? `${blocks.blocked.length} current-round` : 'Loading'} className="se-console-panel">
            {!blocks ? <p className="se-muted">Loading blocks...</p> : null}
            {blocks?.blocked.length === 0 ? <p className="se-muted">Nobody in this round is on your block list.</p> : null}
            <div className="se-console-blocks">
              {blocks?.blocked.map((player) => (
                <div key={player.publicPimpId} className="se-console-block">
                  <div>
                    <strong>{player.displayName}</strong>
                    <span className="se-muted se-num">#{player.publicPimpId}</span>
                  </div>
                  <button
                    type="button"
                    className="se-btn se-btn--ghost se-btn--sm"
                    disabled={busy}
                    onClick={() => void unblock(player.publicPimpId)}
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
            <h3 className="se-subhead">Muted players</h3>
            <p className="se-hint">Their messages still arrive, straight into Archived, with no unread count or alerts. They are never told.</p>
            {blocks?.muted.length === 0 ? <p className="se-muted">Nobody is muted.</p> : null}
            <div className="se-console-blocks">
              {blocks?.muted.map((player) => (
                <div key={player.publicPimpId} className="se-console-block">
                  <div>
                    <strong>{player.displayName}</strong>
                    <span className="se-muted se-num">#{player.publicPimpId}</span>
                  </div>
                  <button
                    type="button"
                    className="se-btn se-btn--ghost se-btn--sm"
                    disabled={busy}
                    onClick={() => void setMuted(player.publicPimpId, player.displayName, false)}
                  >
                    Unmute
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <section className="se-console-work">
            <Panel
              title={view === 'archived' ? 'Archived threads' : 'Message threads'}
              aside={data ? `${data.threads.length} of ${data.total}` : 'Loading'}
              flush
              className="se-console-listpanel"
            >
              {!data ? <p className="se-muted se-console-pad">Checking the wire...</p> : null}
              {data && data.threads.length === 0 ? (
                <div className="se-console-empty">
                  <strong>No threads here.</strong>
                  <span>{view === 'threads' ? 'When a conversation starts, it will land here.' : 'Archived conversations collect here.'}</span>
                </div>
              ) : null}
              <div className="se-console-list">
                {data?.threads.map((thread) => (
                  <button
                    key={thread.counterpart.publicPimpId}
                    type="button"
                    className={`se-console-message${selectedThreadPimpId === thread.counterpart.publicPimpId ? ' se-console-message--selected' : ''}${thread.unreadCount > 0 ? ' se-console-message--unread' : ''}`}
                    onClick={() => openThread(thread)}
                  >
                    <span className="se-console-message__top">
                      <strong>{thread.counterpart.displayName}</strong>
                      <time>{messageTime(thread.lastMessageAt)}</time>
                    </span>
                    <span className="se-console-message__subject">{thread.subject}</span>
                    <span className="se-console-message__preview">{thread.preview}</span>
                    <span className="se-console-message__meta">
                      <span className="se-num">#{thread.counterpart.publicPimpId}</span>
                      <span>{thread.messageCount} message{thread.messageCount === 1 ? '' : 's'}</span>
                      <span>{thread.lastDirection === 'in' ? 'They replied' : 'You replied'}</span>
                      {thread.unreadCount > 0 ? <span>{thread.unreadCount} unread</span> : null}
                      {thread.blocked ? <span>Blocked</span> : null}
                      {thread.muted ? <span>Muted</span> : null}
                      {thread.reported ? <span>Reported</span> : null}
                    </span>
                  </button>
                ))}
              </div>
              {data && data.totalPages > 1 ? (
                <div className="se-console-pagination">
                  <button
                    type="button"
                    className="se-btn se-btn--ghost se-btn--sm"
                    disabled={data.page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </button>
                  <span className="se-num">Page {data.page} / {data.totalPages}</span>
                  <button
                    type="button"
                    className="se-btn se-btn--ghost se-btn--sm"
                    disabled={data.page >= data.totalPages}
                    onClick={() => setPage((current) => Math.min(data.totalPages, current + 1))}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </Panel>

            <div className="se-console-detail">
              {mode === 'compose' ? (
                <Panel title="Compose" aside="Private message" className="se-console-panel">
                  <form className="se-console-compose" onSubmit={(event) => void send(event)}>
                    <label>
                      <span>Recipient pimp #</span>
                      <input
                        className="se-input"
                        inputMode="numeric"
                        value={recipient}
                        placeholder="1042"
                        onChange={(event) => changeComposeField(setRecipient, event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Subject</span>
                      <input
                        className="se-input"
                        maxLength={MESSAGE_SUBJECT_MAX}
                        value={subject}
                        onChange={(event) => changeComposeField(setSubject, event.target.value)}
                      />
                      <small>{subject.length}/{MESSAGE_SUBJECT_MAX}</small>
                    </label>
                    <label>
                      <span>Message</span>
                      <textarea
                        className="se-input se-console-compose__body"
                        maxLength={MESSAGE_BODY_MAX}
                        value={body}
                        onChange={(event) => changeComposeField(setBody, event.target.value)}
                      />
                      <small>{body.length}/{MESSAGE_BODY_MAX}</small>
                    </label>
                    <div className="se-inline-actions">
                      <button
                        type="submit"
                        className="se-btn se-btn--primary"
                        disabled={busy || !recipient.trim() || !subject.trim() || !body.trim()}
                      >
                        {busy ? 'Sending...' : 'Send message'}
                      </button>
                      <button type="button" className="se-btn se-btn--ghost" onClick={() => setMode('detail')}>
                        Cancel
                      </button>
                    </div>
                    <p className="se-hint">Retries reuse the same delivery key until you edit the draft, preventing double sends.</p>
                  </form>
                </Panel>
              ) : conversation ? (
                <Panel
                  title={conversation.counterpart.displayName}
                  aside={`${conversation.messageCount} message${conversation.messageCount === 1 ? '' : 's'}`}
                  className="se-console-panel"
                >
                  <div className="se-console-thread">
                    {conversation.messages.map((message) => (
                      <button
                        key={message.id}
                        type="button"
                        className={`se-console-bubble se-console-bubble--${message.direction === 'in' ? 'in' : 'out'}${selected?.id === message.id ? ' se-console-bubble--selected' : ''}`}
                        onClick={() => {
                          setSelectedId(message.id);
                          setReporting(false);
                          setReportReason('');
                        }}
                      >
                        <span className="se-console-bubble__meta">
                          <strong>{message.direction === 'in' ? conversation.counterpart.displayName : 'You'}</strong>
                          <time>{messageTime(message.createdAt)}</time>
                        </span>
                        <span className="se-console-bubble__subject">{message.subject}</span>
                        <span className="se-console-bubble__body">{message.body}</span>
                        {message.reported ? <span className="se-tag se-tag--dim">Reported</span> : null}
                      </button>
                    ))}
                  </div>

                  {selected ? (
                    <div className="se-console-actions">
                      <button
                        type="button"
                        className="se-btn se-btn--ghost se-btn--sm"
                        disabled={busy}
                        onClick={() => void archive(selected, !selected.archived)}
                      >
                        {selected.archived ? 'Restore selected' : 'Archive selected'}
                      </button>
                      {selected.direction === 'in' && !selected.blocked ? (
                        <button
                          type="button"
                          className="se-btn se-btn--ghost se-btn--sm"
                          disabled={busy}
                          onClick={() => void block(selected)}
                        >
                          Block sender
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="se-btn se-btn--ghost se-btn--sm"
                        disabled={busy}
                        onClick={() => void setMuted(selected.counterpart.publicPimpId, selected.counterpart.displayName, !selected.muted)}
                      >
                        {selected.muted ? 'Unmute' : 'Mute'}
                      </button>
                      <button
                        type="button"
                        className="se-btn se-btn--ghost se-btn--sm"
                        disabled={busy}
                        onClick={() => void hideConversation(selected)}
                      >
                        Delete thread
                      </button>
                      {selected.direction === 'in' && !selected.reported ? (
                        <button
                          type="button"
                          className="se-btn se-btn--ghost se-btn--sm"
                          onClick={() => setReporting((current) => !current)}
                        >
                          Report selected
                        </button>
                      ) : null}
                      <Link className="se-btn se-btn--ghost se-btn--sm" to={`/game/players/${selected.counterpart.publicPimpId}`}>
                        Profile
                      </Link>
                    </div>
                  ) : null}

                  {reporting && selected && selected.direction === 'in' ? (
                    <div className="se-console-report">
                      <label>
                        <span>Why are you reporting this message?</span>
                        <textarea
                          className="se-input"
                          maxLength={MESSAGE_REPORT_REASON_MAX}
                          value={reportReason}
                          onChange={(event) => setReportReason(event.target.value)}
                        />
                      </label>
                      <div className="se-inline-actions">
                        <button
                          type="button"
                          className="se-btn se-btn--primary se-btn--sm"
                          disabled={busy || !reportReason.trim()}
                          onClick={() => void report(selected)}
                        >
                          Submit report
                        </button>
                        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setReporting(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <form className="se-console-thread-reply" onSubmit={(event) => void sendThreadReply(event, conversation)}>
                    <label>
                      <span>Reply</span>
                      <textarea
                        className="se-input"
                        maxLength={MESSAGE_BODY_MAX}
                        value={body}
                        onChange={(event) => changeComposeField(setBody, event.target.value)}
                      />
                      <small>{body.length}/{MESSAGE_BODY_MAX}</small>
                    </label>
                    <div className="se-inline-actions">
                      <button
                        type="submit"
                        className="se-btn se-btn--primary"
                        disabled={busy || !body.trim() || Boolean(conversation.restriction)}
                      >
                        {busy ? 'Sending...' : 'Send reply'}
                      </button>
                      <button
                        type="button"
                        className="se-btn se-btn--ghost"
                        onClick={() => setBody('')}
                        disabled={!body.trim()}
                      >
                        Clear
                      </button>
                    </div>
                  </form>
                </Panel>
              ) : (
                <Panel title="Message threads" className="se-console-panel">
                  <div className="se-console-placeholder">
                    <strong>Select a thread or start a new one.</strong>
                    <p>Messages are grouped by player, so the whole back-and-forth stays together.</p>
                    <button type="button" className="se-btn se-btn--primary" onClick={() => setMode('compose')}>
                      Compose
                    </button>
                  </div>
                </Panel>
              )}
            </div>
          </section>
        )}

        <footer className="se-console-links">
          <span>Existing systems stay authoritative:</span>
          <Link to="/game/alliance">Alliance Wire</Link>
          <Link to="/game/console?view=activity">Activity & attacks</Link>
          <Link to="/game/players">Player directory</Link>
        </footer>
      </div>
    </GameLayout>
  );
}
