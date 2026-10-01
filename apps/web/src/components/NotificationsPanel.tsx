import { useEffect, useState } from 'react';
import { BELL_CATEGORIES, type NotificationCategory, type NotificationSettingsDto, type UpdateNotificationSettingsInput } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { notificationsApi } from '../api/notifications.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { useSession } from '../stores/session.js';

interface CategoryRow { key: NotificationCategory; label: string; hint: string }

/** 0.9.0-G. Grouped so fourteen switches stay scannable on a phone. */
const CATEGORY_GROUPS: Array<{ title: string; rows: CategoryRow[] }> = [
  {
    title: 'Combat & turf',
    rows: [
      { key: 'attacks', label: 'Attacks on me', hint: 'Raids, drive-bys and every other hit on your empire.' },
      { key: 'turfPush', label: 'Block being pushed', hint: 'Once your Lookouts spot a push on one of your blocks.' },
      { key: 'turf', label: 'My turf', hint: 'A rival crew takes one of your blocks.' },
      { key: 'revenge', label: 'Revenge expiring', hint: 'A couple of hours before your revenge window on a hitter closes.' },
    ],
  },
  {
    title: 'Alliance & messages',
    rows: [
      { key: 'reinforcements', label: 'Backup calls', hint: 'An ally in your city calls for reinforcements on turf or a run.' },
      { key: 'alliance', label: 'Alliance control', hint: 'Your alliance gains or loses control of a city.' },
      { key: 'announcements', label: 'Alliance announcements', hint: 'Your leaders post an announcement.' },
      { key: 'messages', label: 'Private messages', hint: 'Someone sends you a message. Alerts name the sender only.' },
    ],
  },
  {
    title: 'Travel & economy',
    rows: [
      { key: 'convoy', label: 'Convoy danger', hint: 'Your Lookouts spot a tail on your run.' },
      { key: 'runs', label: 'Runs home', hint: 'A run makes it home.' },
      { key: 'orders', label: 'Special orders', hint: 'A trader shipment you ordered lands on the shelf.' },
    ],
  },
  {
    title: 'Round',
    rows: [
      { key: 'turns', label: 'Turns are full', hint: 'Once each time your turns fill up, so none go to waste.' },
      { key: 'rank', label: 'Rank drops', hint: 'You lose national #1 or fall out of the top 10.' },
      { key: 'round', label: 'Round news', hint: 'A new round opens, the last day starts, or the round ends.' },
    ],
  },
];

function toClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function fromClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 0 && minute < 24 * 60 ? minute : null;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function timeZones(current: string): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  return [...new Set([current, browserTimeZone(), 'UTC', ...supported])];
}

interface NotificationsPanelProps {
  refreshKey?: number;
}

export function NotificationsPanel({ refreshKey = 0 }: NotificationsPanelProps) {
  const [settings, setSettings] = useState<NotificationSettingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [quietDraft, setQuietDraft] = useState<{ start: number; end: number; timeZone: string } | null>(null);
  const setBellMuted = useSession((s) => s.setBellMuted);
  const working = 'Finishing the last thing you asked for.';

  async function refresh() {
    setError(null);
    try {
      setSettings(await notificationsApi.settings());
    } catch {
      setError('Could not load your alert settings. Try again.');
    }
  }

  useEffect(() => {
    void refresh();
  }, [refreshKey]);

  async function run(key: string, task: () => Promise<string | null>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const message = await task();
      if (message) setNotice(message);
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const update = (input: UpdateNotificationSettingsInput) => run('update', async () => {
    const next = await notificationsApi.update(input);
    setSettings(next);
    setQuietDraft(null);
    setBellMuted(next.bellMuted);
    // The bell and Console badges re-read with the new mutes.
    window.dispatchEvent(new Event('streets:notifications-changed'));
    return null;
  });

  const sendTest = () => run('test', async () => {
    const result = await notificationsApi.test();
    setSettings(await notificationsApi.settings());
    const problems = result.failures.map((failure) => `${failure.label ?? 'A device'}: ${failure.reason}`);
    if (!result.delivered) {
      throw new Error(['The test did not reach any device.', ...problems].join(' '));
    }
    return [
      `Test sent to ${result.delivered} of ${result.devices} device${result.devices === 1 ? '' : 's'}.`,
      ...problems,
    ].join(' ');
  });

  if (!settings) {
    return (
      <Panel title="Alerts">
        {error ? <Alert>{error}</Alert> : null}
        <button type="button" className="se-btn se-btn--ghost" onClick={refresh}>
          {error ? 'Retry' : 'Loading alerts...'}
        </button>
      </Panel>
    );
  }

  const devices = settings.push.devices;
  const anyCategory = Object.values(settings.categories).some(Boolean);
  const muted = new Set<NotificationCategory>(settings.bellMuted);
  const quiet = quietDraft ?? settings.quietHours ?? { start: 23 * 60, end: 7 * 60, timeZone: browserTimeZone() };
  const off = busy !== null ? working : null;

  return (
    <Panel title="Alerts">
      <div className="se-alerts">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <p role="status" className="se-good">{notice}</p> : null}

        <label className="se-checkrow se-checkrow--inline se-alerts-master">
          <input
            type="checkbox"
            checked={!settings.paused}
            disabled={busy !== null}
            onChange={(event) => update({ paused: !event.target.checked })}
          />
          <span>
            <strong>{settings.paused ? 'Outside alerts are paused' : 'Outside alerts are on'}</strong>
            <small>Pauses every phone and Discord alert at once without losing your choices below. The in-game bell keeps everything.</small>
          </span>
        </label>

        <p>
          Choose what's worth hearing about. <strong>Bell</strong> is the in-game notification center; <strong>Phone & Discord</strong> reaches you when the game is closed.
          Alerts only ever say what you could already see in game.
        </p>

        {CATEGORY_GROUPS.map((group) => (
          <fieldset className="se-alerts-group" key={group.title}>
            <legend>{group.title}</legend>
            <div className="se-alerts-grid" role="table" aria-label={`${group.title} alerts`}>
              <div className="se-alerts-grid__head" role="row">
                <span role="columnheader">Alert</span>
                <span role="columnheader">Bell</span>
                <span role="columnheader">Phone & Discord</span>
              </div>
              {group.rows.map((category) => {
                const hasBell = BELL_CATEGORIES.includes(category.key);
                const bellOn = hasBell && !muted.has(category.key);
                return (
                  <div className="se-alerts-grid__row" role="row" key={category.key}>
                    <span role="cell" className="se-alerts-grid__label">
                      <strong>{category.label}</strong>
                      <small>{category.hint}</small>
                    </span>
                    <span role="cell">
                      {hasBell ? (
                        <input
                          type="checkbox"
                          aria-label={`${category.label} in the bell`}
                          checked={bellOn}
                          disabled={busy !== null}
                          onChange={(event) => update({
                            bellMuted: event.target.checked
                              ? [...muted].filter((key) => key !== category.key)
                              : [...muted, category.key],
                          })}
                        />
                      ) : <span className="se-muted" title="This one has no bell item">—</span>}
                    </span>
                    <span role="cell">
                      <input
                        type="checkbox"
                        aria-label={`${category.label} on phone and Discord`}
                        checked={settings.categories[category.key]}
                        disabled={busy !== null}
                        onChange={(event) => update({ categories: { [category.key]: event.target.checked } })}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}

        <h3 className="se-subhead">Quiet hours</h3>
        <label className="se-checkrow se-checkrow--inline">
          <input
            type="checkbox"
            checked={Boolean(settings.quietHours)}
            disabled={busy !== null}
            onChange={(event) => update({
              quietHours: event.target.checked ? { start: quiet.start, end: quiet.end, timeZone: quiet.timeZone } : null,
            })}
          />
          <span>
            <strong>Hold phone & Discord alerts overnight</strong>
            <small>Nothing is sent inside the window. What happens meanwhile waits in the bell.</small>
          </span>
        </label>
        <div className="se-alerts-quiet">
          <label className="se-field">
            <span className="se-label">From</span>
            <input
              type="time"
              className="se-input"
              value={toClock(quiet.start)}
              disabled={busy !== null}
              onChange={(event) => setQuietDraft({ ...quiet, start: fromClock(event.target.value) ?? quiet.start })}
            />
          </label>
          <label className="se-field">
            <span className="se-label">Until</span>
            <input
              type="time"
              className="se-input"
              value={toClock(quiet.end)}
              disabled={busy !== null}
              onChange={(event) => setQuietDraft({ ...quiet, end: fromClock(event.target.value) ?? quiet.end })}
            />
          </label>
          <label className="se-field">
            <span className="se-label">Time zone</span>
            <select
              className="se-input"
              value={quiet.timeZone}
              disabled={busy !== null}
              onChange={(event) => setQuietDraft({ ...quiet, timeZone: event.target.value })}
            >
              {timeZones(quiet.timeZone).map((zone) => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <Button
            type="button"
            className="se-btn se-btn--ghost se-btn--sm"
            onClick={() => update({ quietHours: { ...quiet } })}
            disabledReason={off ?? (quiet.start === quiet.end ? 'Pick different start and end times.' : null)}
          >
            {settings.quietHours ? 'Save quiet hours' : 'Turn on quiet hours'}
          </Button>
        </div>

        <h3 className="se-subhead">Delivery channels</h3>

        <label className="se-checkrow se-checkrow--inline">
          <input
            type="checkbox"
            checked={devices.length > 0 && settings.channels.push}
            disabled={busy !== null || !settings.push.available || devices.length === 0}
            onChange={(event) => update({ channels: { push: event.target.checked } })}
          />
          <span>
            <strong>Phone & browser devices</strong>
            <small>
              {!settings.push.available
                ? 'Push alerts are not configured on this server.'
                : devices.length
                  ? `Send to ${devices.length} connected device${devices.length === 1 ? '' : 's'}.`
                  : 'Connect a phone or browser in Connected accounts & devices first.'}
            </small>
          </span>
        </label>

        {devices.length ? (
          <Button
            type="button"
            className="se-btn se-btn--ghost se-btn--sm"
            onClick={sendTest}
            disabledReason={off ?? (settings.channels.push ? null : 'Switch phone & browser delivery on first.')}
          >
            {busy === 'test' ? 'Sending...' : 'Send device test'}
          </Button>
        ) : null}

        <label className="se-checkrow se-checkrow--inline">
          <input
            type="checkbox"
            checked={settings.discordLinked && settings.channels.discord}
            disabled={busy !== null || !settings.discordLinked}
            onChange={(event) => update({ channels: { discord: event.target.checked } })}
          />
          <span>
            <strong>Discord DMs</strong>
            <small>
              {settings.discordLinked
                ? 'Send enabled alert categories to your linked Discord account.'
                : 'Link Discord in Connected accounts & devices first.'}
            </small>
          </span>
        </label>

        {!anyCategory ? <p className="se-hint">No phone or Discord alerts are switched on yet.</p> : null}
      </div>
    </Panel>
  );
}
