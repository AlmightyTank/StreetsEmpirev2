import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InAppNotificationFeedDto } from '@streets/shared';
import { notificationsApi } from '../api/notifications.js';
import { useSession } from '../stores/session.js';
import { gameEventToastFor } from './GameEventToasts.js';

const EMPTY_FEED: InAppNotificationFeedDto = { notifications: [], unreadCount: 0 };

function displayTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export function NotificationBell() {
  const accountId = useSession((s) => s.account?.id ?? null);
  const activityHead = useSession((s) => s.recentActivity[0]?.id ?? null);
  const crackWord = useSession((s) => s.me?.products) ? 'crack' : 'product';
  const [feed, setFeed] = useState<InAppNotificationFeedDto>(EMPTY_FEED);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!accountId) {
      setFeed(EMPTY_FEED);
      return;
    }
    setLoading(true);
    try {
      setFeed(await notificationsApi.inbox());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    const onChanged = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('streets:notifications-changed', onChanged);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('streets:notifications-changed', onChanged);
    };
  }, [accountId, refresh]);

  useEffect(() => {
    if (accountId && activityHead) void refresh();
  }, [accountId, activityHead, refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const rendered = useMemo(() => feed.notifications.flatMap((notification) => {
    const toast = gameEventToastFor(notification.activity, crackWord);
    return toast ? [{ notification, toast }] : [];
  }), [feed.notifications, crackWord]);

  async function markRead(id: string) {
    let changed = false;
    setFeed((current) => ({
      unreadCount: Math.max(0, current.unreadCount - (current.notifications.some((item) => item.id === id && !item.readAt) ? 1 : 0)),
      notifications: current.notifications.map((item) => {
        if (item.id !== id || item.readAt) return item;
        changed = true;
        return { ...item, readAt: new Date().toISOString() };
      }),
    }));
    try {
      await notificationsApi.read(id);
      window.dispatchEvent(new Event('streets:notifications-changed'));
    } catch {
      void refresh();
    }
  }

  async function markAllRead() {
    if (!feed.unreadCount) return;
    const at = new Date().toISOString();
    setFeed((current) => ({
      unreadCount: 0,
      notifications: current.notifications.map((item) => item.readAt ? item : { ...item, readAt: at }),
    }));
    try {
      await notificationsApi.readAll();
      window.dispatchEvent(new Event('streets:notifications-changed'));
    } catch {
      void refresh();
    }
  }

  if (!accountId) return null;

  const badge = feed.unreadCount > 99 ? '99+' : String(feed.unreadCount);

  return (
    <div className="se-notification-center" ref={root}>
      <button
        type="button"
        className={`se-notification-bell${open ? ' se-notification-bell--open' : ''}`}
        aria-label={feed.unreadCount ? `Notifications, ${feed.unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => {
          if (!current) void refresh();
          return !current;
        })}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {feed.unreadCount > 0 ? <span className="se-notification-badge">{badge}</span> : null}
      </button>

      {open ? (
        <div className="se-notification-menu" role="dialog" aria-label="Recent notifications">
          <div className="se-notification-menu__head">
            <div>
              <strong>Notifications</strong>
              <span>{feed.unreadCount ? `${feed.unreadCount} unread` : 'Caught up'}</span>
            </div>
            {feed.unreadCount ? (
              <button type="button" className="se-notification-menu__readall" onClick={() => void markAllRead()}>
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="se-notification-menu__list">
            {error ? (
              <button type="button" className="se-notification-empty" onClick={() => void refresh()}>
                Could not load notifications. Tap to retry.
              </button>
            ) : loading && !rendered.length ? (
              <div className="se-notification-empty">Loading notifications…</div>
            ) : !rendered.length ? (
              <div className="se-notification-empty">No recent notifications.</div>
            ) : rendered.map(({ notification, toast }) => {
              const body = (
                <>
                  <span className="se-notification-item__top">
                    <strong>{toast.title}</strong>
                    {!notification.readAt ? <span className="se-notification-dot" aria-label="Unread" /> : null}
                  </span>
                  <span className="se-notification-item__detail">{toast.detail}</span>
                  <span className="se-notification-item__time">{displayTime(notification.activity.createdAt)}</span>
                </>
              );
              const className = `se-notification-item se-notification-item--${toast.tone}${notification.readAt ? ' se-notification-item--read' : ''}`;
              return toast.href ? (
                <Link
                  key={notification.id}
                  to={toast.href}
                  className={className}
                  onClick={() => {
                    if (!notification.readAt) void markRead(notification.id);
                    setOpen(false);
                  }}
                >
                  {body}
                </Link>
              ) : (
                <button
                  key={notification.id}
                  type="button"
                  className={className}
                  onClick={() => {
                    if (!notification.readAt) void markRead(notification.id);
                  }}
                >
                  {body}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
