import { useEffect, useState } from 'react';
import type { NotificationCategory, NotificationSettingsDto, UpdateNotificationSettingsInput } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { notificationsApi } from '../api/notifications.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

const CATEGORIES: Array<{ key: NotificationCategory; label: string; hint: string }> = [
  { key: 'attacks', label: 'Attacks on me', hint: 'Raids, drive-bys and every other hit on your empire.' },
  { key: 'turf', label: 'My turf', hint: 'A rival crew takes one of your blocks.' },
  { key: 'alliance', label: 'Alliance control', hint: 'Your alliance gains or loses control of a city.' },
  { key: 'turns', label: 'Turns are full', hint: 'Once each time your turns fill up, so none go to waste.' },
  { key: 'round', label: 'Round news', hint: 'A new round opens, the last day starts, or the round ends.' },
  { key: 'rank', label: 'Rank drops', hint: 'You lose national #1 or fall out of the top 10.' },
];

interface NotificationsPanelProps {
  refreshKey?: number;
}

export function NotificationsPanel({ refreshKey = 0 }: NotificationsPanelProps) {
  const [settings, setSettings] = useState<NotificationSettingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
    setSettings(await notificationsApi.update(input));
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
  const off = busy !== null ? working : null;

  return (
    <Panel title="Alerts">
      <div className="se-alerts">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <p role="status" className="se-good">{notice}</p> : null}

        <p>Choose what's worth hearing about, then choose which connected channels receive it.</p>

        {CATEGORIES.map((category) => (
          <label className="se-checkrow" key={category.key}>
            <input
              type="checkbox"
              checked={settings.categories[category.key]}
              disabled={busy !== null}
              onChange={(event) => update({ categories: { [category.key]: event.target.checked } })}
            />
            <span>
              <strong>{category.label}</strong>
              <small>{category.hint}</small>
            </span>
          </label>
        ))}

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

        {!anyCategory ? <p className="se-hint">No alert categories are switched on yet.</p> : null}
      </div>
    </Panel>
  );
}
