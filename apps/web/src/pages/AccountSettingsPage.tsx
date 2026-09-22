import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  AccountProfileSettingsResponseDto,
  AccountSessionDto,
  DefaultLanding,
  MoneyFormat,
  ProfileAccent,
  UiDensity,
} from '@streets/shared';
import { ApiError } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { ConnectedAccountsPanel } from '../components/ConnectedAccountsPanel.js';
import { NotificationsPanel } from '../components/NotificationsPanel.js';
import { Panel, Row } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { DEFAULT_PROFILE_SETTINGS, useSession } from '../stores/session.js';

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function sessionDevice(session: AccountSessionDto): string {
  const agent = session.userAgent ?? '';
  if (agent.includes('Edg/')) return 'Edge browser';
  if (agent.includes('Chrome/')) return 'Chrome browser';
  if (agent.includes('Firefox/')) return 'Firefox browser';
  if (agent.includes('Safari/') && !agent.includes('Chrome/')) return 'Safari browser';
  return session.userAgent ? 'Browser session' : 'Unknown device';
}

export function AccountSettingsPage() {
  const account = useSession((s) => s.account)!;
  const me = useSession((s) => s.me);
  const setSessionProfileSettings = useSession((s) => s.setProfileSettings);
  const [searchParams] = useSearchParams();
  const accountMessage = searchParams.get('accountMessage');

  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [revokeOtherSessionsOnPasswordChange, setRevokeOtherSessionsOnPasswordChange] = useState(true);
  const [connectionsVersion, setConnectionsVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(accountMessage);
  const [tone, setTone] = useState<'error' | 'info'>('info');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'recovery' | 'verify' | 'email' | 'password' | 'sessions' | 'cosmetics' | null>(null);
  /** One line for every button while another request is in flight. */
  const working = 'Finishing the last thing you asked for.';
  const [sessions, setSessions] = useState<AccountSessionDto[]>([]);
  const [profileSettings, setProfileSettings] = useState<AccountProfileSettingsResponseDto | null>(null);
  const [cosmetics, setCosmetics] = useState(DEFAULT_PROFILE_SETTINGS);

  useEffect(() => {
    let active = true;
    authApi.profileSettings()
      .then((response) => {
        if (!active) return;
        setProfileSettings(response);
        setCosmetics(response.settings);
      })
      .catch(() => {
        if (active) {
          setProfileSettings({
            settings: cosmetics,
            options: {
              titles: [],
              badges: [],
              accents: [{ key: 'default', label: 'StreetsEmpire', description: null }],
              densities: [
                { key: 'comfortable', label: 'Comfortable', description: null },
                { key: 'compact', label: 'Compact', description: null },
              ],
              moneyFormats: [
                { key: 'full', label: 'Full money', description: null },
                { key: 'compact', label: 'Compact money', description: null },
              ],
              defaultLandings: [
                { key: 'game', label: 'Dashboard', description: null },
                { key: 'profile', label: 'Profile', description: null },
                { key: 'rankings', label: 'Rankings', description: null },
                { key: 'news', label: 'News', description: null },
              ],
            },
          });
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    authApi.sessions()
      .then((response) => {
        if (active) setSessions(response.sessions);
      })
      .catch(() => {
        if (active) setSessions([]);
      });
    return () => { active = false; };
  }, []);

  async function sendRecovery() {
    setBusy('recovery');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.forgotPassword({ email: account.email });
      setTone('info');
      setMessage(response.message);
    } catch (error) {
      setTone('error');
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong. Try that again.');
    } finally {
      setBusy(null);
    }
  }

  async function verifyCurrentEmail() {
    setBusy('verify');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.requestEmailVerification();
      setTone('info');
      setMessage(response.message);
    } catch (error) {
      setTone('error');
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong. Try that again.');
    } finally {
      setBusy(null);
    }
  }

  async function requestEmailChange(event: FormEvent) {
    event.preventDefault();
    setBusy('email');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.requestEmailChange({ email: newEmail });
      setTone('info');
      setMessage(response.message);
      setNewEmail('');
    } catch (error) {
      setTone('error');
      if (error instanceof ApiError) {
        setMessage(error.message);
        setFields(error.fields ?? {});
      } else {
        setMessage('Something went wrong. Try that again.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy('password');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.changePassword({
        currentPassword,
        password: newPassword,
        revokeOtherSessions: revokeOtherSessionsOnPasswordChange,
      });
      await refreshSessions();
      setTone('info');
      setMessage(response.message);
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      setTone('error');
      if (error instanceof ApiError) {
        setMessage(error.message);
        setFields(error.fields ?? {});
      } else {
        setMessage('Something went wrong. Try that again.');
      }
    } finally {
      setBusy(null);
    }
  }

  function toggleFeaturedBadge(key: string) {
    setCosmetics((current) => {
      const selected = current.featuredBadgeKeys.includes(key)
        ? current.featuredBadgeKeys.filter((candidate) => candidate !== key)
        : [...current.featuredBadgeKeys, key].slice(0, 6);
      return { ...current, featuredBadgeKeys: selected };
    });
  }

  async function saveCosmetics(event: FormEvent) {
    event.preventDefault();
    setBusy('cosmetics');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.updateProfileSettings(cosmetics);
      setProfileSettings(response);
      setCosmetics(response.settings);
      setSessionProfileSettings(response.settings);
      setTone('info');
      setMessage('Settings saved.');
    } catch (error) {
      setTone('error');
      if (error instanceof ApiError) {
        setMessage(error.message);
        setFields(error.fields ?? {});
      } else {
        setMessage('Something went wrong. Try that again.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function refreshSessions() {
    const response = await authApi.sessions();
    setSessions(response.sessions);
    return response.sessions;
  }

  async function revokeSession(sessionId: string) {
    setBusy('sessions');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.revokeSession(sessionId);
      await refreshSessions();
      setTone('info');
      setMessage(response.revoked ? 'That session was logged out.' : 'That session was already gone.');
    } catch (error) {
      setTone('error');
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong. Try that again.');
    } finally {
      setBusy(null);
    }
  }

  async function revokeOtherSessions() {
    setBusy('sessions');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.revokeOtherSessions();
      await refreshSessions();
      setTone('info');
      setMessage(response.revoked ? `Logged out ${response.revoked} other session${response.revoked === 1 ? '' : 's'}.` : 'There were no other sessions to log out.');
    } catch (error) {
      setTone('error');
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong. Try that again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Shell>
      <div className="se-pagehead">
        <div>
          <p className="se-eyebrow">Private account</p>
          <h1 className="se-title">Login & settings</h1>
        </div>
        {me ? <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/profile">Public profile</Link> : null}
      </div>

      {message ? <Alert tone={tone}>{message}</Alert> : null}

      <div className="se-account-columns">
        <div className="se-account-column">
          <Panel title="Login identity" flush>
            <div className="se-rows">
              <Row label="Pimp name" value={account.username} strong />
              <Row label="Email" value={account.email} />
              <Row label="Email status" value={account.emailVerifiedAt ? 'Verified' : 'Unverified'} />
              <Row label="Discord" value={account.discordLinked ? account.discordUsername ?? 'Linked' : 'Not linked'} />
            </div>
          </Panel>

          <Panel title="Recovery">
            <p>
              Password recovery sends a one-hour reset link to your private account email.
              The address is used for login and recovery only.
            </p>
            <Button type="button" className="se-btn se-btn--primary se-btn--block" onClick={sendRecovery} disabledReason={busy !== null ? working : null}>
              {busy === 'recovery' ? 'Sending...' : 'Send recovery email'}
            </Button>
            <p className="se-hint">
              Check your inbox after sending. Recovery links expire after one hour.
            </p>
          </Panel>

          <Panel title="Change password">
            <form onSubmit={changePassword} noValidate>
              <Field
                label="Current password"
                name="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                error={fields.currentPassword}
              />
              <Field
                label="New password"
                name="password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                error={fields.password}
                hint="Use at least 8 characters."
              />
              <label className="se-checkrow se-checkrow--inline">
                <input
                  type="checkbox"
                  checked={revokeOtherSessionsOnPasswordChange}
                  onChange={(event) => setRevokeOtherSessionsOnPasswordChange(event.target.checked)}
                />
                <span>
                  <strong>Log out other sessions</strong>
                  <small>Keep this device signed in and revoke every other browser session.</small>
                </span>
              </label>
              <Button className="se-btn se-btn--primary se-btn--block" disabledReason={busy !== null ? working : null}>
                {busy === 'password' ? 'Changing...' : 'Change password'}
              </Button>
            </form>
          </Panel>

          <Panel title="Account record" flush>
            <div className="se-rows">
              <Row label="Created" value={formatDate(account.createdAt)} />
              <Row label="Last login" value={formatDate(account.lastLoginAt)} />
            </div>
          </Panel>
        </div>

        <div className="se-account-column">
          <ConnectedAccountsPanel
            account={account}
            onConnectionsChanged={() => setConnectionsVersion((current) => current + 1)}
          />

          <NotificationsPanel refreshKey={connectionsVersion} />

          <Panel title="Current email verification">
            <p>
              Verify your current email before changing it. This proves you control the recovery address already on the account.
            </p>
            <Button
              type="button"
              className="se-btn se-btn--primary se-btn--block"
              onClick={verifyCurrentEmail}
              disabledReason={busy !== null ? working : account.emailVerifiedAt ? 'This address is already verified. Nothing to send.' : null}
            >
              {account.emailVerifiedAt ? 'Email verified' : busy === 'verify' ? 'Sending...' : 'Verify current email'}
            </Button>
          </Panel>

          <Panel title="Change email">
            <form onSubmit={requestEmailChange} noValidate>
              <Field
                label="New email"
                name="email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
                required
                error={fields.email}
                hint="A confirmation link will be sent to the new email address."
              />
              <Button className="se-btn se-btn--primary se-btn--block" disabledReason={busy !== null ? working : null}>
                {busy === 'email' ? 'Sending...' : 'Send change confirmation'}
              </Button>
            </form>
          </Panel>

          <Panel title="Profile shortcuts">
            <p>Your game profile is where other players see your public record, awards and achievements.</p>
            <div className="se-actions-row">
              {me ? <Link className="se-btn se-btn--primary" to="/game/profile">Open public profile</Link> : <Link className="se-btn se-btn--primary" to="/join">Join the round</Link>}
              <Link className="se-btn se-btn--ghost" to="/game">Back to game</Link>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Login sessions">
        <div className="se-session-head">
          <p className="se-hint">These are active browser sessions for this account.</p>
          <Button
            type="button"
            className="se-btn se-btn--ghost se-btn--sm"
            onClick={revokeOtherSessions}
            disabledReason={busy !== null ? working : sessions.some((session) => !session.current) ? null : 'This is the only session signed in.'}
          >
            {busy === 'sessions' ? 'Working...' : 'Log out other sessions'}
          </Button>
        </div>

        {sessions.length ? (
          <div className="se-session-list">
            {sessions.map((session) => (
              <div className="se-session-row" key={session.id}>
                <div>
                  <strong>
                    {session.current ? 'This session' : sessionDevice(session)}
                    {session.current ? <span className="se-tag se-tag--good">Current</span> : null}
                  </strong>
                  <small>
                    Last seen {formatDate(session.lastSeenAt)}
                    {session.ip ? ` · ${session.ip}` : ''}
                  </small>
                  <small>Created {formatDate(session.createdAt)} · Expires {formatDate(session.expiresAt)}</small>
                </div>
                {session.current ? null : (
                  <Button
                    type="button"
                    className="se-btn se-btn--ghost se-btn--sm"
                    onClick={() => revokeSession(session.id)}
                    disabledReason={busy !== null ? working : null}
                  >
                    Log out
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="se-muted">Session details are not available right now.</p>
        )}
      </Panel>

      <Panel title="Cosmetics & interface">
        {!profileSettings ? (
          <p className="se-muted">Loading your unlocked badges...</p>
        ) : (
          <form onSubmit={saveCosmetics} noValidate>
            <div className="se-account-cosmetics">
              <div>
                <div className="se-field">
                  <label className="se-label" htmlFor="active-title">Profile title</label>
                  <select
                    id="active-title"
                    className="se-input"
                    value={cosmetics.activeTitleKey ?? ''}
                    onChange={(event) => setCosmetics((current) => ({
                      ...current,
                      activeTitleKey: event.target.value || null,
                    }))}
                  >
                    <option value="">No title</option>
                    {profileSettings.options.titles.map((option) => (
                      <option value={option.key} key={option.key}>{option.label}</option>
                    ))}
                  </select>
                  {fields.activeTitleKey ? <p className="se-error">{fields.activeTitleKey}</p> : <p className="se-hint">Titles come from achievements and legacy badges you have unlocked.</p>}
                </div>

                <div className="se-field">
                  <span className="se-label">Profile accent</span>
                  <div className="se-swatch-row" role="group" aria-label="Profile accent">
                    {profileSettings.options.accents.map((option) => (
                      <button
                        type="button"
                        key={option.key}
                        className={`se-swatch se-swatch--${option.key}${cosmetics.profileAccent === option.key ? ' se-swatch--on' : ''}`}
                        aria-pressed={cosmetics.profileAccent === option.key}
                        title={option.description ?? option.label}
                        onClick={() => setCosmetics((current) => ({ ...current, profileAccent: option.key as ProfileAccent }))}
                      >
                        <span aria-hidden="true" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="se-field">
                <span className="se-label">Featured badges</span>
                {profileSettings.options.badges.length ? (
                  <div className="se-cosmetic-list se-cosmetic-list--wide">
                    {profileSettings.options.badges.map((option) => {
                      const checked = cosmetics.featuredBadgeKeys.includes(option.key);
                      return (
                        <label className="se-checkrow" key={option.key}
                          title={!checked && cosmetics.featuredBadgeKeys.length >= 6 ? 'Six badges is the most a profile shows. Clear one to swap this in.' : undefined}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!checked && cosmetics.featuredBadgeKeys.length >= 6}
                            onChange={() => toggleFeaturedBadge(option.key)}
                          />
                          <span>
                            <strong>{option.label}</strong>
                            <small>{option.permanent ? 'Permanent' : 'This round'} · {option.rarity.charAt(0).toUpperCase() + option.rarity.slice(1)}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="se-muted">Unlock achievements or finish a season to feature badges here.</p>
                )}
                {fields.featuredBadgeKeys ? <p className="se-error">{fields.featuredBadgeKeys}</p> : <p className="se-hint">Pick up to six. They appear first on your public profile.</p>}
              </div>
            </div>

            <div className="se-interface-preferences">
              <div className="se-field">
                <label className="se-label" htmlFor="ui-density">Interface density</label>
                <select
                  id="ui-density"
                  className="se-input"
                  value={cosmetics.uiDensity}
                  onChange={(event) => setCosmetics((current) => ({
                    ...current,
                    uiDensity: event.target.value as UiDensity,
                  }))}
                >
                  {profileSettings.options.densities.map((option) => (
                    <option value={option.key} key={option.key}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="se-field">
                <label className="se-label" htmlFor="money-format">Money display</label>
                <select
                  id="money-format"
                  className="se-input"
                  value={cosmetics.moneyFormat}
                  onChange={(event) => setCosmetics((current) => ({
                    ...current,
                    moneyFormat: event.target.value as MoneyFormat,
                  }))}
                >
                  {profileSettings.options.moneyFormats.map((option) => (
                    <option value={option.key} key={option.key}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="se-field">
                <label className="se-label" htmlFor="default-landing">After login</label>
                <select
                  id="default-landing"
                  className="se-input"
                  value={cosmetics.defaultLanding}
                  onChange={(event) => setCosmetics((current) => ({
                    ...current,
                    defaultLanding: event.target.value as DefaultLanding,
                  }))}
                >
                  {profileSettings.options.defaultLandings.map((option) => (
                    <option value={option.key} key={option.key}>{option.label}</option>
                  ))}
                </select>
              </div>

              <label className="se-checkrow se-checkrow--toggle">
                <input
                  type="checkbox"
                  checked={cosmetics.reducedMotion}
                  onChange={(event) => setCosmetics((current) => ({
                    ...current,
                    reducedMotion: event.target.checked,
                  }))}
                />
                <span>
                  <strong>Reduced motion</strong>
                  <small>Limit interface animation and transitions.</small>
                </span>
              </label>
            </div>

            <Button className="se-btn se-btn--primary se-btn--block" disabledReason={busy !== null ? working : null}>
              {busy === 'cosmetics' ? 'Saving...' : 'Save settings'}
            </Button>
          </form>
        )}
      </Panel>
    </Shell>
  );
}
