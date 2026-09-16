import { useEffect, useState } from 'react';
import type { NotificationCategory, NotificationSettingsDto, UpdateNotificationSettingsInput } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { notificationsApi } from '../api/notifications.js';
import { currentSubscription, deviceLabel, endpointHash, pushSupport, subscribeToPush, unsubscribeFromPush, type PushSupport } from '../utils/push.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

const CATEGORIES: Array<{ key: NotificationCategory; label: string; hint: string }> = [
  { key: 'attacks', label: 'Attacks on me', hint: 'Raids, drive-bys and every other hit on your empire.' },
  { key: 'turns', label: 'Turns are full', hint: 'Once each time your turns fill up, so none go to waste.' },
  { key: 'round', label: 'Round news', hint: 'A new round opens, the last day starts, or the round ends.' },
  { key: 'rank', label: 'Rank drops', hint: 'You lose national #1 or fall out of the top 10.' },
];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function NotificationsPanel() {
  const [settings, setSettings] = useState<NotificationSettingsDto | null>(null);
  const [support] = useState<PushSupport>(() => pushSupport());
  /** Hash of this browser's own push endpoint, when it has one. */
  const [thisHash, setThisHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const working = 'Finishing the last thing you asked for.';

  async function refresh() {
    setError(null);
    try {
      const [loaded, subscription] = await Promise.all([notificationsApi.settings(), currentSubscription().catch(() => null)]);
      setSettings(loaded);
      setThisHash(subscription ? await endpointHash(subscription.endpoint) : null);
    } catch {
      setError('Could not load your alert settings. Try again.');
    }
  }
  useEffect(() => { void refresh(); }, []);

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

  const enableThisDevice = () => run('enable', async () => {
    if (!settings?.push.vapidPublicKey) throw new Error('Phone alerts are not set up on this server yet.');
    const subscription = await subscribeToPush(settings.push.vapidPublicKey);
    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys.auth) {
      throw new Error('This browser did not hand over a push subscription. Try again.');
    }
    setSettings(await notificationsApi.subscribe({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      label: deviceLabel(),
    }));
    setThisHash(await endpointHash(subscription.endpoint));
    return 'Alerts are on for this device. Send a test to check.';
  });

  const removeDevice = (id: string, isThisDevice: boolean) => run(`remove:${id}`, async () => {
    if (isThisDevice) await unsubscribeFromPush();
    setSettings(await notificationsApi.removeDevice(id));
    if (isThisDevice) setThisHash(null);
    return 'Device removed.';
  });

  const sendTest = () => run('test', async () => {
    const result = await notificationsApi.test();
    // Devices the push service refused are gone now; show the list as it really is.
    setSettings(await notificationsApi.settings());
    return result.delivered
      ? `Test sent to ${result.delivered} of ${result.devices} device${result.devices === 1 ? '' : 's'}.`
      : 'The test did not reach any device. Devices that no longer accept alerts were removed; turn alerts on again.';
  });

  if (!settings) {
    return (
      <Panel title="Alerts">
        {error ? <Alert>{error}</Alert> : null}
        <button type="button" className="se-btn se-btn--ghost" onClick={refresh}>{error ? 'Retry' : 'Loading alerts...'}</button>
      </Panel>
    );
  }

  const devices = settings.push.devices;
  // This browser may hold a subscription the server has since dropped; then it needs turning on again.
  const thisDevice = thisHash ? devices.find((device) => device.endpointHash === thisHash) ?? null : null;
  const anyCategory = Object.values(settings.categories).some(Boolean);
  const off = busy !== null ? working : null;

  return (
    <Panel title="Alerts">
      <div className="se-alerts">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <p role="status" className="se-good">{notice}</p> : null}

        <p>Choose what's worth hearing about, then where it reaches you.</p>
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

        <h3 className="se-subhead">Phone & browser</h3>
        {!settings.push.available ? (
          <p className="se-muted">Phone alerts are coming soon.</p>
        ) : (
          <>
            {support === 'ios-needs-home-screen' ? (
              <div className="se-alerts-steps">
                <p>On iPhone and iPad, alerts only work from the Home Screen app:</p>
                <ol>
                  <li>Tap <strong>Share</strong> in Safari.</li>
                  <li>Tap <strong>Add to Home Screen</strong>.</li>
                  <li>Open StreetsEmpire from your Home Screen.</li>
                  <li>Come back here and tap <strong>Turn on alerts for this device</strong>.</li>
                </ol>
              </div>
            ) : support === 'unsupported' ? (
              <p className="se-muted">This browser can't receive alerts. Try Chrome, Edge, Firefox or Safari.</p>
            ) : support === 'denied' ? (
              <p className="se-muted">Notifications are blocked for StreetsEmpire. Allow them in your browser or phone settings, then reload.</p>
            ) : !thisDevice ? (
              <Button type="button" className="se-btn se-btn--primary se-btn--block" onClick={enableThisDevice} disabledReason={off}>
                {busy === 'enable' ? 'Turning on...' : 'Turn on alerts for this device'}
              </Button>
            ) : null}

            {devices.length ? (
              <div className="se-session-list">
                {devices.map((device) => (
                  <div className="se-session-row" key={device.id}>
                    <div>
                      <strong>
                        {device.label ?? 'Device'}
                        {device.id === thisDevice?.id ? <span className="se-tag se-tag--good">This device</span> : null}
                      </strong>
                      <small>Added {formatDate(device.createdAt)} · Last alert {formatDate(device.lastSuccessAt)}</small>
                    </div>
                    <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => removeDevice(device.id, device.id === thisDevice?.id)} disabledReason={off}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            {devices.length ? (
              <div className="se-actions-row">
                <label className="se-checkrow se-checkrow--inline">
                  <input type="checkbox" checked={settings.channels.push} disabled={busy !== null} onChange={(event) => update({ channels: { push: event.target.checked } })} />
                  <span><strong>Send alerts to these devices</strong></span>
                </label>
                <Button
                  type="button"
                  className="se-btn se-btn--ghost se-btn--sm"
                  onClick={sendTest}
                  disabledReason={off ?? (settings.channels.push ? null : 'Switch device alerts on first.')}
                >
                  {busy === 'test' ? 'Sending...' : 'Send test'}
                </Button>
              </div>
            ) : null}
          </>
        )}

        <h3 className="se-subhead">Discord</h3>
        <label className="se-checkrow se-checkrow--inline">
          <input
            type="checkbox"
            checked={settings.discordLinked && settings.channels.discord}
            disabled={busy !== null || !settings.discordLinked}
            onChange={(event) => update({ channels: { discord: event.target.checked } })}
          />
          <span>
            <strong>DM me on Discord</strong>
            <small>{settings.discordLinked ? 'Keep DMs from server members allowed in the StreetsEmpire server.' : 'Link Discord first to get alerts there.'}</small>
          </span>
        </label>

        {!anyCategory ? <p className="se-hint">No alerts are switched on yet.</p> : null}
      </div>
    </Panel>
  );
}
