import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  ConsoleActivityDto,
  ConsoleActivityEntryDto,
  ConsoleActivityFilter,
  ConsoleBlocksDto,
  ConsoleCountsDto,
  ConsoleFolder,
  DirectMessageDto,
  InAppNotificationDto,
  InAppNotificationFeedDto,
  PimpConsoleDto,
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
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';

type ConsoleView = ConsoleFolder | 'alliance' | 'attacks' | 'notifications' | 'activity' | 'blocked';
type ConsoleMode = 'detail' | 'compose';

const VIEWS: Array<{ key: ConsoleView; label: string }> = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' },
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
  return new Date(value).toLocaleString();
}

function subjectForReply(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export function ConsolePage() {
  const [searchParams] = useSearchParams();
  const crackWord = useSession((s) => s.me?.products) ? 'crack' : 'product';
  const [view, setView] = useState<ConsoleView>('inbox');
  const [activityFilter, setActivityFilter] = useState<ConsoleActivityFilter>('all');
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<ConsoleCountsDto | null>(null);
  const [data, setData] = useState<PimpConsoleDto | null>(null);
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

  const selected = data?.messages.find((message) => message.id === selectedId) ?? null;
  const selectedEvent = activityData?.events.find((event) => event.activity.id === selectedEventId) ?? activityData?.events[0] ?? null;
  const selectedNotification =
    notifications?.notifications.find((notification) => notification.id === selectedNotificationId)
    ?? notifications?.notifications[0]
    ?? null;

  useEffect(() => {
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

    consoleApi.page(view, page)
      .then((next) => {
        if (!live) return;
        setData(next);
        setCounts(next.counts);
      })
      .catch((caught: unknown) => {
        if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load the Console.');
      });
    return () => { live = false; };
  }, [view, activityFilter, page]);

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
    const next = await consoleApi.page(view, page);
    setData(next);
    setCounts(next.counts);
  }

  async function openMessage(message: DirectMessageDto) {
    setSelectedId(message.id);
    setMode('detail');
    setReporting(false);
    setReportReason('');

    if (message.direction === 'in' && !message.readAt) {
      try {
        await consoleApi.read(message.id);
        announceConsoleUpdated();
        setCounts((current) => current ? {
          ...current,
          unread: Math.max(0, current.unread - 1),
        } : current);
        setData((current) => current ? {
          ...current,
          counts: {
            ...current.counts,
            unread: Math.max(0, current.counts.unread - 1),
          },
          messages: current.messages.map((row) =>
            row.id === message.id ? { ...row, readAt: new Date().toISOString() } : row),
        } : current);
      } catch {
        // Opening the message should still work if the read receipt fails.
      }
    }
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
      setView('sent');
      setPage(1);
      const next = await consoleApi.page('sent', 1);
      setData(next);
      setCounts(next.counts);
      setSelectedId(result.message.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The message did not go through.');
    } finally {
      setBusy(false);
    }
  }

  function reply(message: DirectMessageDto) {
    setRecipient(String(message.counterpart.publicPimpId));
    setSubject(subjectForReply(message.subject));
    setBody('');
    actionId.current = newActionId();
    setMode('compose');
    setReporting(false);
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
        messages: current.messages.map((row) =>
          row.counterpart.publicPimpId === message.counterpart.publicPimpId
            ? { ...row, blocked: true }
            : row),
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
        messages: current.messages.map((row) =>
          row.counterpart.publicPimpId === publicPimpId ? { ...row, muted } : row),
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
    if (!window.confirm(`Delete your whole conversation with ${message.counterpart.displayName}? This cannot be undone on your side. Their copy stays, and reports keep their evidence.`)) return;
    setBusy(true);
    setError(null);
    try {
      const { hidden } = await consoleApi.hideConversation(message.counterpart.publicPimpId);
      setSelectedId(null);
      setData((current) => current ? {
        ...current,
        messages: current.messages.filter((row) => row.counterpart.publicPimpId !== message.counterpart.publicPimpId),
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
    if (key === 'inbox') return counts.inbox;
    if (key === 'sent') return counts.sent;
    if (key === 'archived') return counts.archived;
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
      href: toast?.href ?? '/game/activity',
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
            <span><small>Inbox</small><strong>{counts?.inbox ?? 0}</strong></span>
            <span><small>Sent</small><strong>{counts?.sent ?? 0}</strong></span>
            <span><small>Attacks</small><strong>{counts?.attacks ?? 0}</strong></span>
            <span><small>Activity</small><strong>{counts?.activity ?? 0}</strong></span>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}

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
                  setView(key);
                  setPage(1);
                  setMode('detail');
                  setSelectedEventId(null);
                }}
              >
                <span>{label}</span>
                <strong>{countFor(key)}</strong>
                {key === 'inbox' && (counts?.unread ?? 0) > 0
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
              setView('inbox');
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
                : `A moderator has paused your messaging until ${new Date(data.restriction.until!).toLocaleString()}. You can still read your mail.`}
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
                    aside={new Date(selectedEvent.activity.createdAt).toLocaleString()}
                    className="se-console-panel"
                  >
                    <article className="se-console-eventdetail">
                      <strong>{summary.text}</strong>
                      {summary.detail ? <p>{summary.detail}</p> : null}
                      <div className="se-console-actions">
                        <Link className="se-btn se-btn--primary se-btn--sm" to={selectedEvent.href}>
                          Open report
                        </Link>
                        <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/activity">
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
                      <p>{new Date(selectedNotification.activity.createdAt).toLocaleString()}</p>
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
              title={view === 'inbox' ? 'Inbox' : view === 'sent' ? 'Sent mail' : 'Archived mail'}
              aside={data ? `${data.messages.length} of ${data.total}` : 'Loading'}
              flush
              className="se-console-listpanel"
            >
              {!data ? <p className="se-muted se-console-pad">Checking the wire...</p> : null}
              {data && data.messages.length === 0 ? (
                <div className="se-console-empty">
                  <strong>No messages here.</strong>
                  <span>{view === 'inbox' ? 'When another player writes, it will land here.' : 'This folder is clear.'}</span>
                </div>
              ) : null}
              <div className="se-console-list">
                {data?.messages.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    className={`se-console-message${selectedId === message.id ? ' se-console-message--selected' : ''}${message.direction === 'in' && !message.readAt ? ' se-console-message--unread' : ''}`}
                    onClick={() => void openMessage(message)}
                  >
                    <span className="se-console-message__top">
                      <strong>{message.counterpart.displayName}</strong>
                      <time>{messageTime(message.createdAt)}</time>
                    </span>
                    <span className="se-console-message__subject">{message.subject}</span>
                    <span className="se-console-message__meta">
                      <span className="se-num">#{message.counterpart.publicPimpId}</span>
                      <span>{message.direction === 'in' ? 'Received' : 'Sent'}</span>
                      {message.blocked ? <span>Blocked</span> : null}
                      {message.reported ? <span>Reported</span> : null}
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
              ) : selected ? (
                <Panel
                  title={selected.subject}
                  aside={selected.direction === 'in' ? 'Received' : 'Sent'}
                  className="se-console-panel"
                >
                  <article className="se-console-letter">
                    <header>
                      <div>
                        <strong>{selected.counterpart.displayName}</strong>
                        <span className="se-num">#{selected.counterpart.publicPimpId}</span>
                      </div>
                      <time>{messageTime(selected.createdAt)}</time>
                    </header>
                    <p>{selected.body}</p>
                  </article>

                  <div className="se-console-actions">
                    <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => reply(selected)}>
                      Reply
                    </button>
                    <button
                      type="button"
                      className="se-btn se-btn--ghost se-btn--sm"
                      disabled={busy}
                      onClick={() => void archive(selected, !selected.archived)}
                    >
                      {selected.archived ? 'Restore' : 'Archive'}
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
                      Delete conversation
                    </button>
                    {selected.direction === 'in' && !selected.reported ? (
                      <button
                        type="button"
                        className="se-btn se-btn--ghost se-btn--sm"
                        onClick={() => setReporting((current) => !current)}
                      >
                        Report
                      </button>
                    ) : null}
                    {selected.direction === 'in' && selected.reported ? (
                      <span className="se-tag se-tag--dim">Reported</span>
                    ) : null}
                    <Link className="se-btn se-btn--ghost se-btn--sm" to={`/game/players/${selected.counterpart.publicPimpId}`}>
                      Profile
                    </Link>
                  </div>

                  {reporting && selected.direction === 'in' ? (
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
                </Panel>
              ) : (
                <Panel title="Street mail" className="se-console-panel">
                  <div className="se-console-placeholder">
                    <strong>Select a message or start a new one.</strong>
                    <p>Messages are asynchronous. Blocking either account disables private messages in both directions.</p>
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
          <Link to="/game/activity">Activity & attacks</Link>
          <Link to="/game/players">Player directory</Link>
        </footer>
      </div>
    </GameLayout>
  );
}
