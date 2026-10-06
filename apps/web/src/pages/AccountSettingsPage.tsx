import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  AccountProfileSettingsResponseDto,
  AccountSessionDto,
  DefaultLanding,
  MoneyFormat,
  ProfileAccent,
  ProfileEffect,
  UiDensity,
} from '@streets/shared';
import { CREW_NAME_MAX, DEFAULT_CREW_COSMETICS, RELEASED_CREW_COSMETIC_STYLES, RELEASED_ITEM_COSMETIC_STYLES, collectionOptions, PROFILE_BIO_MAX, PROFILE_IMAGE_URL_MAX, formatNumber, formatProfileName } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { CloseAccountPanel } from '../components/CloseAccountPanel.js';
import { YourDataPanel } from '../components/YourDataPanel.js';
import { TwoFactorPanel } from '../components/TwoFactorPanel.js';
import { ConnectedAccountsPanel } from '../components/ConnectedAccountsPanel.js';
import { NotificationsPanel } from '../components/NotificationsPanel.js';
import { ItemCrewCosmeticsEditor } from '../components/ItemCrewCosmeticsEditor.js';
import { Panel, Row } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { DEFAULT_PROFILE_SETTINGS, useSession } from '../stores/session.js';
import { ReplayTutorial } from '../components/onboarding/ReplayTutorial.js';
import { formatWhen } from '../utils/time.js';

/** Sessions listed before "Show all": this one first, then the most recently used. */
const SESSIONS_SHOWN = 5;
/** Used when settings fail to load: only Classic is known to be owned. */
const FALLBACK_ITEM_STYLES = collectionOptions(RELEASED_ITEM_COSMETIC_STYLES, new Set());
const FALLBACK_CREW_STYLES = collectionOptions(RELEASED_CREW_COSMETIC_STYLES, new Set());

function formatDate(value: string | null): string {
  return value ? formatWhen(value) : 'Never';
}

function sessionDevice(session: AccountSessionDto): string {
  const agent = session.userAgent ?? '';
  if (agent.includes('Edg/')) return 'Edge browser';
  if (agent.includes('Chrome/')) return 'Chrome browser';
  if (agent.includes('Firefox/')) return 'Firefox browser';
  if (agent.includes('Safari/') && !agent.includes('Chrome/')) return 'Safari browser';
  return session.userAgent ? 'Browser session' : 'Unknown device';
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

export function AccountSettingsPage() {
  const account = useSession((s) => s.account)!;
  const me = useSession((s) => s.me);
  // Players keep the game menu here; an account still verifying or accepting the rules gets the plain shell.
  const canPlay = useSession((s) => Boolean(s.me && !s.account?.verificationRequired && !s.account?.rulesAcceptanceRequired));
  const Frame = canPlay ? GameLayout : Shell;
  const round = useSession((s) => s.round);
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
  // The list grows with every sign-in; show the latest few until asked for all.
  const [showAllSessions, setShowAllSessions] = useState(false);
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
              frames: [],
              themes: [],
              effects: [
                { key: 'none', label: 'No effect', description: null },
                { key: 'neon-pulse', label: 'Neon pulse', description: null },
                { key: 'scanlines', label: 'Scanlines', description: null },
                { key: 'spotlight', label: 'Spotlight', description: null },
                { key: 'glitch', label: 'Glitch', description: null },
                { key: 'ember-sparks', label: 'Ember sparks', description: null },
                { key: 'cash-shimmer', label: 'Cash shimmer', description: null },
                { key: 'sirens', label: 'Sirens', description: null },
                { key: 'smoke', label: 'Smoke', description: null },
              ],
              itemStyles: FALLBACK_ITEM_STYLES,
              crewStyles: FALLBACK_CREW_STYLES,
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
      // An unverified address is corrected at once; the account comes back with it.
      if (response.account) useSession.setState({ account: response.account });
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
      const response = await authApi.updateProfileSettings({
        ...cosmetics,
        itemCosmetics: cosmetics.itemCosmetics ?? {},
        crewCosmetics: cosmetics.crewCosmetics ?? DEFAULT_CREW_COSMETICS,
      });
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

  const selectedAccent = profileSettings?.options.accents.find((option) => option.key === cosmetics.profileAccent);
  const selectedTitle = profileSettings?.options.titles.find((option) => option.key === cosmetics.activeTitleKey);
  const selectedFrame = profileSettings?.options.frames.find((option) => option.key === cosmetics.activeProfileFrameKey);
  const displayName = me?.displayName ?? account.username;
  const previewCity = me?.city.name ?? 'Your city';
  const previewRank = me ? `#${me.publicPimpId.toLocaleString()}` : 'Preview';

  return (
    <Frame>
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

          <Panel title="Set a password by email">
            <p>
              Signed up with Discord, or forgot your current password? We will email a link to{' '}
              <strong>{account.email}</strong> to set a new one.
            </p>
            <Button type="button" className="se-btn se-btn--ghost se-btn--block" onClick={sendRecovery} disabledReason={busy !== null ? working : null}>
              {busy === 'recovery' ? 'Sending...' : 'Email me a link'}
            </Button>
            <p className="se-hint">
              Know your password? Use Change password instead. The link works for one hour.
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
                hint={account.emailVerifiedAt ? "A confirmation link will be sent to the new email address." : "Fixes a mistyped address now, and sends the verification link there."}
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

      <TwoFactorPanel focusCodes={searchParams.get('twoFactor') === 'codes'} />

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
            {(() => {
              const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
              return showAllSessions ? ordered : ordered.slice(0, SESSIONS_SHOWN);
            })().map((session) => (
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
                  <small>
                    {session.method === 'DISCORD' ? 'Discord' : 'Password'}{session.twoFactor ? ' + code' : ''}
                    {' · '}{session.remember ? 'Kept signed in' : 'Until the browser closes'}
                  </small>
                  <small>
                    Signed in {formatDate(session.createdAt)} · Ends {formatDate(session.expiresAt)} if unused
                    {session.remember ? ` · by ${formatDate(session.endsBy)} at the latest` : ''}
                  </small>
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
            {sessions.length > SESSIONS_SHOWN ? (
              <button type="button" className="se-btn se-btn--ghost se-btn--sm se-session-more" onClick={() => setShowAllSessions((value) => !value)}>
                {showAllSessions ? 'Show fewer' : `Show all ${sessions.length} sessions`}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="se-muted">Session details are not available right now.</p>
        )}
      </Panel>

      <Panel title="Tutorial">
        <p>Replay the first-login intro, see every page intro again and bring back the getting-started goals. Every page also has a "How this page works" panel.</p>
        <ReplayTutorial className="se-btn se-btn--ghost" />
      </Panel>

      <Panel title="Cosmetics & interface">
        {!profileSettings ? (
          <p className="se-muted">Loading your unlocked badges...</p>
        ) : (
          <form onSubmit={saveCosmetics} noValidate>
            <div className="se-account-cosmetics">
              <div>
                <div className="se-field">
                  <label className="se-label" htmlFor="crew-name">Crew name</label>
                  <input
                    id="crew-name"
                    className="se-input"
                    value={cosmetics.crewName ?? ''}
                    maxLength={CREW_NAME_MAX}
                    placeholder="No crew name"
                    autoComplete="off"
                    onChange={(event) => setCosmetics((current) => ({
                      ...current,
                      crewName: event.target.value,
                    }))}
                  />
                  {fields.crewName ? <p className="se-error" role="alert">{fields.crewName}</p> : <p className="se-hint">Shown on your profile and searchable in the Players directory. It carries across seasons; leave it blank for none.</p>}
                </div>

                <div className="se-field">
                  <label className="se-label" htmlFor="profile-bio">About me</label>
                  <textarea
                    id="profile-bio"
                    className="se-input se-textarea"
                    value={cosmetics.profileBio ?? ''}
                    maxLength={PROFILE_BIO_MAX}
                    rows={5}
                    placeholder="Tell players who they are dealing with."
                    onChange={(event) => setCosmetics((current) => ({
                      ...current,
                      profileBio: event.target.value,
                    }))}
                  />
                  {fields.profileBio
                    ? <p className="se-error" role="alert">{fields.profileBio}</p>
                    : <p className="se-hint">Plain text only. Shown on your public profile. {formatNumber((cosmetics.profileBio ?? '').length)} / {formatNumber(PROFILE_BIO_MAX)}</p>}
                </div>

                <div className="se-field">
                  <label className="se-label" htmlFor="profile-image-url">Profile image URL</label>
                  <input
                    id="profile-image-url"
                    className="se-input"
                    value={cosmetics.profileImageUrl ?? ''}
                    maxLength={PROFILE_IMAGE_URL_MAX}
                    placeholder="https://i.imgur.com/your-avatar.png"
                    inputMode="url"
                    autoComplete="off"
                    onChange={(event) => setCosmetics((current) => ({
                      ...current,
                      profileImageUrl: event.target.value,
                    }))}
                  />
                  {fields.profileImageUrl
                    ? <p className="se-error" role="alert">{fields.profileImageUrl}</p>
                    : <p className="se-hint">Use a direct HTTPS image link from Imgur or your own host. Leave blank for initials.</p>}
                </div>

                <div className="se-field">
                  <label className="se-label" htmlFor="profile-banner-url">Profile banner URL</label>
                  <input
                    id="profile-banner-url"
                    className="se-input"
                    value={cosmetics.profileBannerUrl ?? ''}
                    maxLength={PROFILE_IMAGE_URL_MAX}
                    placeholder="https://your-site.com/banner.jpg"
                    inputMode="url"
                    autoComplete="off"
                    onChange={(event) => setCosmetics((current) => ({
                      ...current,
                      profileBannerUrl: event.target.value,
                    }))}
                  />
                  {fields.profileBannerUrl
                    ? <p className="se-error" role="alert">{fields.profileBannerUrl}</p>
                    : <p className="se-hint">This becomes the background banner on your profile card and public profile.</p>}
                </div>

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
                  {fields.activeTitleKey ? <p className="se-error" role="alert">{fields.activeTitleKey}</p> : <p className="se-hint">Sir, Madam, Don, and Donna are always available. Other titles come from achievements, season feats, legacy awards, and quests. Titles are cosmetic only.</p>}
                  {(() => {
                    const title = profileSettings.options.titles.find((option) => option.key === cosmetics.activeTitleKey)?.label;
                    const name = me?.displayName ?? account.username;
                    if (!title) return null;
                    const preview = formatProfileName(name, title, cosmetics.titlePlacement);
                    return <p className="se-hint">Preview: <strong>{preview}</strong></p>;
                  })()}
                </div>

                <div className="se-field">
                  <label className="se-label" htmlFor="title-placement">Title position</label>
                  <select
                    id="title-placement"
                    className="se-input"
                    value={cosmetics.titlePlacement}
                    onChange={(event) => setCosmetics((current) => ({
                      ...current,
                      titlePlacement: event.target.value as typeof current.titlePlacement,
                    }))}
                  >
                    <option value="prefix">Before my name · The Quiet Ghost AMightyTank</option>
                    <option value="suffix">After my name · AMightyTank, Quiet Ghost</option>
                  </select>
                  <p className="se-hint">Choose how your selected title appears on your public profile.</p>
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
                  {fields.profileAccent ? <p className="se-error" role="alert">{fields.profileAccent}</p> : <p className="se-hint">Sets the color shown on your profile card, profile page, and player-facing highlights.</p>}
                </div>

                <div className="se-field">
                  <label className="se-label" htmlFor="profile-frame">Profile frame</label>
                  <select
                    id="profile-frame"
                    className="se-input"
                    value={cosmetics.activeProfileFrameKey ?? ''}
                    onChange={(event) => setCosmetics((current) => ({
                      ...current,
                      activeProfileFrameKey: event.target.value || null,
                    }))}
                  >
                    <option value="">No frame</option>
                    {profileSettings.options.frames.map((option) => (
                      <option value={option.key} key={option.key}>{option.label}</option>
                    ))}
                  </select>
                  {fields.activeProfileFrameKey
                    ? <p className="se-error" role="alert">{fields.activeProfileFrameKey}</p>
                    : <p className="se-hint">{profileSettings.options.frames.length ? 'Frames are permanent quest-earned profile cosmetics.' : 'Complete qualifying Contact finales to unlock profile frames.'}</p>}
                </div>

                <div className="se-field">
                  <label className="se-label" htmlFor="profile-effect">Profile effect</label>
                  <select
                    id="profile-effect"
                    className="se-input"
                    value={cosmetics.profileEffect}
                    onChange={(event) => setCosmetics((current) => ({
                      ...current,
                      profileEffect: event.target.value as ProfileEffect,
                    }))}
                  >
                    {profileSettings.options.effects.map((option) => (
                      <option value={option.key} key={option.key}>{option.label}</option>
                    ))}
                  </select>
                  {fields.profileEffect
                    ? <p className="se-error" role="alert">{fields.profileEffect}</p>
                    : <p className="se-hint">Discord-style card effects for your public profile. Reduced-motion visitors see a calmer version.</p>}
                </div>

                <div className="se-field">
                  <label className="se-label" htmlFor="site-theme">Site theme</label>
                  <select
                    id="site-theme"
                    className="se-input"
                    value={cosmetics.activeSiteThemeKey ?? ''}
                    onChange={(event) => setCosmetics((current) => ({
                      ...current,
                      activeSiteThemeKey: event.target.value || null,
                    }))}
                  >
                    <option value="">No site theme</option>
                    {profileSettings.options.themes.map((option) => (
                      <option value={option.key} key={option.key}>{option.label}</option>
                    ))}
                  </select>
                  {fields.activeSiteThemeKey
                    ? <p className="se-error" role="alert">{fields.activeSiteThemeKey}</p>
                    : <p className="se-hint">{profileSettings.options.themes.length ? 'Themes reskin the player-facing game shell, panels, controls and background atmosphere.' : 'Seasonal and event themes will appear here after you unlock them.'}</p>}
                </div>
              </div>

              <div className="se-account-cosmetics__side">
                <div className={`se-profile-card-preview se-profile-accent se-profile-accent--${cosmetics.profileAccent}${cosmetics.activeProfileFrameKey ? ` se-profile-frame se-profile-frame--${cosmetics.activeProfileFrameKey}` : ''} se-profile-effect se-profile-effect--${cosmetics.profileEffect}`}>
                  <div
                    className="se-profile-card-preview__banner"
                    style={cosmetics.profileBannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(5, 8, 8, 0.52), rgba(5, 8, 8, 0.86)), url("${cosmetics.profileBannerUrl}")` } : undefined}
                  >
                    <span>Street Empire</span>
                  </div>
                  <div className="se-profile-card-preview__identity">
                    <span className="se-profile-card-preview__avatar" aria-hidden="true">
                      {cosmetics.profileImageUrl ? <img src={cosmetics.profileImageUrl} alt="" /> : initials(displayName)}
                    </span>
                    <div>
                      {selectedTitle ? <span className="se-profile-card-preview__title">{selectedTitle.label}</span> : null}
                      <strong>{displayName}</strong>
                      <small>Player {previewRank}</small>
                    </div>
                  </div>
                  {cosmetics.profileBio ? <p className="se-profile-card-preview__bio">{cosmetics.profileBio}</p> : null}
                  <p>{previewCity}{round ? ` · ${round.name}` : ''}</p>
                  <div className="se-profile-card-preview__chips">
                    <span>{selectedAccent?.label ?? 'StreetsEmpire'} accent</span>
                    {selectedFrame ? <span>{selectedFrame.label} frame</span> : null}
                    {cosmetics.profileEffect !== 'none' ? <span>{profileSettings.options.effects.find((option) => option.key === cosmetics.profileEffect)?.label ?? 'Profile effect'}</span> : null}
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
                  {fields.featuredBadgeKeys ? <p className="se-error" role="alert">{fields.featuredBadgeKeys}</p> : <p className="se-hint">Pick up to six. They appear first on your public profile.</p>}
                </div>
              </div>
            </div>

            <ItemCrewCosmeticsEditor
              settings={cosmetics}
              styles={profileSettings.options.itemStyles ?? FALLBACK_ITEM_STYLES}
              crewStyles={profileSettings.options.crewStyles ?? FALLBACK_CREW_STYLES}
              onChange={setCosmetics}
            />

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

      <YourDataPanel />

      <CloseAccountPanel />
    </Frame>
  );
}
