import { useEffect, useState } from 'react';
import type { AccountDto, ForumLinkStatusDto, NotificationSettingsDto } from '@streets/shared';
import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { forumApi } from '../api/forum.js';
import { notificationsApi } from '../api/notifications.js';
import {
  currentSubscription,
  deviceLabel,
  endpointHash,
  pushSupport,
  subscribeToPush,
  subscriptionMatchesKey,
  unsubscribeFromPush,
  type PushSupport,
} from '../utils/push.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Field } from './Field.js';
import { Panel } from './Panel.js';

interface ConnectedAccountsPanelProps {
  account: AccountDto;
  onConnectionsChanged?: () => void;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function ConnectedAccountsPanel({ account, onConnectionsChanged }: ConnectedAccountsPanelProps) {
  const [forum, setForum] = useState<ForumLinkStatusDto | null>(null);
  const [push, setPush] = useState<NotificationSettingsDto | null>(null);
  const [support] = useState<PushSupport>(() => pushSupport());
  const [thisHash, setThisHash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDiscord, setConfirmDiscord] = useState(false);
  const [confirmForum, setConfirmForum] = useState(false);
  const [discordPassword, setDiscordPassword] = useState('');
  const [discordPasswordError, setDiscordPasswordError] = useState<string | null>(null);
  const working = 'Finishing the last thing you asked for.';

  async function loadForum() {
    try {
      setForum(await forumApi.status());
    } catch {
      setError('Could not load the forum connection. Try again.');
    }
  }

  async function loadPush() {
    try {
      const [settings, subscription] = await Promise.all([
        notificationsApi.settings(),
        currentSubscription().catch(() => null),
      ]);
      setPush(settings);
      const usable = subscription
        && settings.push.vapidPublicKey
        && subscriptionMatchesKey(subscription, settings.push.vapidPublicKey);
      setThisHash(usable ? await endpointHash(subscription.endpoint) : null);
    } catch {
      setError('Could not load connected alert devices. Try again.');
    }
  }

  useEffect(() => {
    void loadForum();
    void loadPush();
  }, []);

  async function unlinkDiscord() {
    setBusy('discord');
    setError(null);
    setNotice(null);
    setDiscordPasswordError(null);
    try {
      const response = await authApi.unlinkDiscord({ currentPassword: discordPassword });
      setConfirmDiscord(false);
      setDiscordPassword('');
      window.location.assign(`/account?accountMessage=${encodeURIComponent(response.message)}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setDiscordPasswordError(caught.fields?.currentPassword ?? null);
      } else {
        setError('Could not unlink Discord. Try again.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function changeForum(unlink: boolean) {
    setBusy('forum');
    setError(null);
    setNotice(null);
    try {
      if (unlink) {
        await forumApi.unlink();
        setConfirmForum(false);
        setForum((current) => current && { ...current, link: null });
        setNotice('Forum account unlinked.');
      } else {
        const result = await forumApi.start();
        window.location.assign(result.url);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the forum connection. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function enableThisDevice() {
    setBusy('device-enable');
    setError(null);
    setNotice(null);
    try {
      if (!push?.push.vapidPublicKey) throw new Error('Phone alerts are not set up on this server yet.');
      const { subscription, replacedEndpoint } = await subscribeToPush(push.push.vapidPublicKey);
      if (replacedEndpoint) await notificationsApi.forget(replacedEndpoint).catch(() => undefined);
      if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys.auth) {
        throw new Error('This browser did not hand over a push subscription. Try again.');
      }
      const next = await notificationsApi.subscribe({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        label: deviceLabel(),
      });
      setPush(next);
      setThisHash(await endpointHash(subscription.endpoint));
      setNotice('This device is connected for StreetsEmpire alerts.');
      onConnectionsChanged?.();
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Could not connect this device. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function removeDevice(id: string, isThisDevice: boolean) {
    setBusy(`device-remove:${id}`);
    setError(null);
    setNotice(null);
    try {
      if (isThisDevice) await unsubscribeFromPush();
      const next = await notificationsApi.removeDevice(id);
      setPush(next);
      if (isThisDevice) setThisHash(null);
      setNotice('Alert device removed.');
      onConnectionsChanged?.();
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Could not remove that device. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const devices = push?.push.devices ?? [];
  const thisDevice = thisHash ? devices.find((device) => device.endpointHash === thisHash) ?? null : null;
  const off = busy !== null ? working : null;

  return (
    <Panel title="Connected accounts & devices">
      <p className="se-hint">
        Manage the outside accounts and devices attached to this StreetsEmpire account. Disconnecting one never deletes your game account.
      </p>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p role="status" className="se-good">{notice}</p> : null}

      <div className="se-connection-list">
        <section className="se-connection">
          <div className="se-connection__head">
            <div>
              <span className="se-connection__eyebrow">Account</span>
              <h3>Discord</h3>
            </div>
            <span className={`se-tag ${account.discordLinked ? 'se-tag--good' : ''}`}>
              {account.discordLinked ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <p>
            {account.discordLinked
              ? <>Connected{account.discordUsername ? <> as <strong>{account.discordUsername}</strong></> : ''}. Used for sign-in, bot commands, roles and optional DMs.</>
              : 'Connect Discord for sign-in, bot commands, server roles and optional alert DMs.'}
          </p>

          {account.discordLinked ? (
            <>
              <Button
                type="button"
                className="se-btn se-btn--ghost"
                onClick={() => {
                  setDiscordPasswordError(null);
                  setConfirmDiscord(true);
                }}
                disabledReason={off}
              >
                Unlink Discord
              </Button>
              {confirmDiscord ? (
                <div className="se-connection__confirm">
                  <p>Enter your current StreetsEmpire password to disconnect Discord. If you only use Discord to sign in, set a password with account recovery first.</p>
                  <Field
                    label="Current password"
                    name="discordCurrentPassword"
                    type="password"
                    value={discordPassword}
                    onChange={(event) => setDiscordPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    error={discordPasswordError ?? undefined}
                  />
                  <div className="se-actions-row">
                    <Button
                      type="button"
                      className="se-btn se-btn--ghost"
                      onClick={unlinkDiscord}
                      disabledReason={off ?? (discordPassword ? null : 'Enter your current password first.')}
                    >
                      {busy === 'discord' ? 'Unlinking...' : 'Yes, unlink Discord'}
                    </Button>
                    <Button
                      type="button"
                      className="se-btn se-btn--ghost"
                      onClick={() => {
                        setConfirmDiscord(false);
                        setDiscordPassword('');
                        setDiscordPasswordError(null);
                      }}
                      disabledReason={off}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <a className="se-btn se-btn--discord" href="/api/auth/discord?link=1">Link Discord</a>
          )}
        </section>

        <section className="se-connection">
          <div className="se-connection__head">
            <div>
              <span className="se-connection__eyebrow">Account</span>
              <h3>StreetsEmpire Forum</h3>
            </div>
            <span className={`se-tag ${forum?.link ? 'se-tag--good' : ''}`}>
              {!forum ? 'Loading' : forum.link ? 'Connected' : forum.enabled ? 'Not connected' : 'Unavailable'}
            </span>
          </div>

          {!forum ? (
            <Button type="button" className="se-btn se-btn--ghost" onClick={loadForum} disabledReason={off}>
              Loading forum...
            </Button>
          ) : forum.link ? (
            <>
              <p>Connected as <strong>{forum.link.username}</strong>. Your game and forum profiles link to each other across every round.</p>
              <div className="se-actions-row">
                <a className="se-btn se-btn--primary" href={forum.link.profileUrl}>Forum profile</a>
                <Button type="button" className="se-btn se-btn--ghost" onClick={() => setConfirmForum(true)} disabledReason={off}>
                  Unlink forum
                </Button>
              </div>
              {confirmForum ? (
                <div className="se-connection__confirm">
                  <p>Remove the public connection between these profiles? Your game account, forum account and forum posts stay intact.</p>
                  <div className="se-actions-row">
                    <Button type="button" className="se-btn se-btn--ghost" onClick={() => changeForum(true)} disabledReason={off}>
                      {busy === 'forum' ? 'Unlinking...' : 'Yes, unlink forum'}
                    </Button>
                    <Button type="button" className="se-btn se-btn--ghost" onClick={() => setConfirmForum(false)} disabledReason={off}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : forum.enabled ? (
            <>
              <p>Connect your forum account for profile links, forum roles and StreetsEmpire badge integration.</p>
              <Button type="button" className="se-btn se-btn--primary" onClick={() => changeForum(false)} disabledReason={off}>
                {busy === 'forum' ? 'Opening forum...' : 'Link forum account'}
              </Button>
            </>
          ) : (
            <p className="se-muted">Forum account linking is not configured on this server.</p>
          )}
        </section>

        <section className="se-connection">
          <div className="se-connection__head">
            <div>
              <span className="se-connection__eyebrow">Devices</span>
              <h3>Phone & browser alerts</h3>
            </div>
            <span className={`se-tag ${devices.length ? 'se-tag--good' : ''}`}>
              {devices.length ? `${devices.length} connected` : 'None connected'}
            </span>
          </div>

          {!push ? (
            <Button type="button" className="se-btn se-btn--ghost" onClick={loadPush} disabledReason={off}>
              Loading devices...
            </Button>
          ) : !push.push.available ? (
            <p className="se-muted">Phone and browser alert devices are not configured on this server.</p>
          ) : (
            <>
              <p>Connected devices can receive the alert categories you enable below. Remove old phones and browsers here when you no longer use them.</p>

              {support === 'ios-needs-home-screen' ? (
                <div className="se-alerts-steps">
                  <p>On iPhone and iPad, add StreetsEmpire to your Home Screen first, then open the installed app and return here.</p>
                </div>
              ) : support === 'unsupported' ? (
                <p className="se-muted">This browser cannot receive push alerts. Try Chrome, Edge, Firefox or Safari.</p>
              ) : support === 'denied' ? (
                <p className="se-muted">Notifications are blocked for StreetsEmpire in this browser or device settings.</p>
              ) : !thisDevice ? (
                <Button type="button" className="se-btn se-btn--primary" onClick={enableThisDevice} disabledReason={off}>
                  {busy === 'device-enable' ? 'Connecting...' : 'Connect this device'}
                </Button>
              ) : (
                <p className="se-good se-account-status">This device is connected.</p>
              )}

              {devices.length ? (
                <div className="se-connection-devices">
                  {devices.map((device) => (
                    <div className="se-session-row" key={device.id}>
                      <div>
                        <strong>
                          {device.label ?? 'Device'}
                          {device.id === thisDevice?.id ? <span className="se-tag se-tag--good">This device</span> : null}
                        </strong>
                        <small>Added {formatDate(device.createdAt)} · Last alert {formatDate(device.lastSuccessAt)}</small>
                      </div>
                      <Button
                        type="button"
                        className="se-btn se-btn--ghost se-btn--sm"
                        onClick={() => removeDevice(device.id, device.id === thisDevice?.id)}
                        disabledReason={off}
                      >
                        {busy === `device-remove:${device.id}` ? 'Removing...' : 'Remove'}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="se-connection se-connection--future">
          <div className="se-connection__head">
            <div>
              <span className="se-connection__eyebrow">Future providers</span>
              <h3>More connections</h3>
            </div>
            <span className="se-tag">Ready to extend</span>
          </div>
          <p className="se-muted">
            Future providers such as Google, Steam or other community services can use this same connect / disconnect pattern without adding another settings page.
          </p>
        </section>
      </div>
    </Panel>
  );
}
