import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  AccountProfileSettingsDto,
  AccountProfileSettingsResponseDto,
  AccountSessionDto,
  AvatarParts,
  DefaultLanding,
  MoneyFormat,
  ProfileAccent,
  ProfileEffect,
  ProfileSurface,
  UiDensity,
  UsernameChangeStatusDto,
} from '@streets/shared';
import { USERNAME_MAX, CREW_NAME_MAX, DEFAULT_AVATAR_PARTS, DEFAULT_CREW_COSMETICS, RELEASED_CREW_COSMETIC_STYLES, RELEASED_ITEM_COSMETIC_STYLES, collectionOptions, PROFILE_BIO_MAX, PROFILE_IMAGE_URL_MAX, formatNumber, profileNameParts, SIGNATURE_CARD_FRAME_KEY } from '@streets/shared';
import { siteThemeCompanionLook } from '@streets/rulesets';
import { ApiError } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { Alert } from '../components/Alert.js';
import { NameWithSupporterMark } from '../components/SupporterMark.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { CloseAccountPanel } from '../components/CloseAccountPanel.js';
import { YourDataPanel } from '../components/YourDataPanel.js';
import { TwoFactorPanel } from '../components/TwoFactorPanel.js';
import { ConnectedAccountsPanel } from '../components/ConnectedAccountsPanel.js';
import { NotificationsPanel } from '../components/NotificationsPanel.js';
import { ItemCrewCosmeticsEditor } from '../components/ItemCrewCosmeticsEditor.js';
import { AvatarBuilder } from '../components/AvatarBuilder.js';
import { AvatarPortrait } from '../components/BuiltAvatar.js';
import { Panel, Row } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { DEFAULT_PROFILE_SETTINGS, useSession } from '../stores/session.js';
import { isBoolean, isString, readRemembered, rememberedKey, useRememberedState } from '../utils/remembered.js';
import { ReplayTutorial } from '../components/onboarding/ReplayTutorial.js';
import { formatWhen } from '../utils/time.js';

/** Sessions listed before "Show all": this one first, then the most recently used. */
const SESSIONS_SHOWN = 5;
/** Used when settings fail to load: only Classic is known to be owned. */
const FALLBACK_ITEM_STYLES = collectionOptions(RELEASED_ITEM_COSMETIC_STYLES, new Set());
const FALLBACK_CREW_STYLES = collectionOptions(RELEASED_CREW_COSMETIC_STYLES, new Set());
type AvatarMode = 'initials' | 'image' | 'built';

const AVATAR_MODES: { key: AvatarMode; label: string }[] = [
  { key: 'initials', label: 'Initials' },
  { key: 'image', label: 'Image link' },
  { key: 'built', label: 'Build one' },
];

function avatarModeOf(settings: AccountProfileSettingsDto): AvatarMode {
  if (settings.profileImageUrl) return 'image';
  return settings.profileAvatar ? 'built' : 'initials';
}

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

/** The name-change rule in one line, with when the player may change it next. */
function usernameChangeHint(status: UsernameChangeStatusDto | null): string {
  if (!status) return 'Letters, numbers, underscores and hyphens. You can change it again after 3 new rounds or 90 days.';
  const rule = `After a change, you can change it again once ${status.cooldownRounds} new rounds start or ${status.cooldownDays} days pass, whichever comes first. Your old name is held for you for ${status.holdDays} days.`;
  if (status.canChange) return status.lastChangedAt ? `You can change your name now. ${rule}` : `Your first change is free. ${rule}`;
  const left = status.cooldownRounds - status.roundsSinceChange;
  return `Next change after ${left} more round${left === 1 ? '' : 's'} start, or on ${formatDate(status.availableAt)}.`;
}

function isAvatarMode(value: unknown): value is AvatarMode {
  return value === 'initials' || value === 'image' || value === 'built';
}

function isAvatarParts(value: unknown): value is AvatarParts {
  if (!value || typeof value !== 'object') return false;
  const parts = value as Record<string, unknown>;
  return parts.base === 'boy' || parts.base === 'girl';
}

function isCosmeticsDraft(value: unknown): value is AccountProfileSettingsDto {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.profileAccent === 'string' && typeof draft.uiDensity === 'string' && typeof draft.moneyFormat === 'string';
}

const SETTING_SECTIONS = [
  'settings-account',
  'settings-connections',
  'settings-alerts',
  'settings-security',
  'settings-game',
  'settings-profile',
  'settings-data',
] as const;

function isSettingSection(value: unknown): value is string {
  return typeof value === 'string' && (SETTING_SECTIONS as readonly string[]).includes(value);
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

  const accountId = account.id;
  const cosmeticsKey = rememberedKey('account-settings:cosmetics', accountId);
  // Captured before useRememberedState writes: true only when an unsaved draft survived navigation.
  const hadCosmeticsDraft = useRef(readRemembered(cosmeticsKey, { accept: isCosmeticsDraft }).found).current;

  // Non-sensitive drafts survive leaving the page and coming back (per browser, per account).
  // Passwords and one-time codes stay ephemeral on purpose and are never remembered.
  const [newEmail, setNewEmail] = useRememberedState(rememberedKey('account-settings:newEmail', accountId), '', { accept: isString });
  const [newUsername, setNewUsername] = useRememberedState(rememberedKey('account-settings:newUsername', accountId), '', { accept: isString });
  const [usernameStatus, setUsernameStatus] = useState<UsernameChangeStatusDto | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [revokeOtherSessionsOnPasswordChange, setRevokeOtherSessionsOnPasswordChange] = useRememberedState(rememberedKey('account-settings:revokeOthers', accountId), true, { accept: isBoolean });
  const [connectionsVersion, setConnectionsVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(accountMessage);
  const [tone, setTone] = useState<'error' | 'info'>('info');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'recovery' | 'verify' | 'email' | 'username' | 'password' | 'sessions' | 'cosmetics' | null>(null);
  /** One line for every button while another request is in flight. */
  const working = 'Finishing the last thing you asked for.';
  const [sessions, setSessions] = useState<AccountSessionDto[]>([]);
  // The list grows with every sign-in; show the latest few until asked for all.
  const [showAllSessions, setShowAllSessions] = useRememberedState(rememberedKey('account-settings:showAllSessions', accountId), false, { accept: isBoolean });
  const [profileSettings, setProfileSettings] = useState<AccountProfileSettingsResponseDto | null>(null);
  const [cosmetics, setCosmetics] = useRememberedState<AccountProfileSettingsDto>(cosmeticsKey, DEFAULT_PROFILE_SETTINGS, { accept: isCosmeticsDraft });
  const [avatarMode, setAvatarMode] = useRememberedState<AvatarMode>(rememberedKey('account-settings:avatarMode', accountId), 'initials', { accept: isAvatarMode });
  // What each avatar choice holds, so trying another one and coming back loses nothing.
  const [imageDraft, setImageDraft] = useRememberedState(rememberedKey('account-settings:imageDraft', accountId), '', { accept: isString });
  const [avatarDraft, setAvatarDraft] = useRememberedState<AvatarParts>(rememberedKey('account-settings:avatarDraft', accountId), DEFAULT_AVATAR_PARTS.boy, { accept: isAvatarParts });
  const [lastSection, setLastSection] = useRememberedState(rememberedKey('account-settings:section', accountId), 'settings-account', { accept: isSettingSection });

  useEffect(() => {
    let active = true;
    authApi.profileSettings()
      .then((response) => {
        if (!active) return;
        setProfileSettings(response);
        // An unsaved draft left on the page wins over the saved server copy.
        if (hadCosmeticsDraft) return;
        setCosmetics(response.settings);
        setAvatarMode(avatarModeOf(response.settings));
        setImageDraft(response.settings.profileImageUrl ?? '');
        if (response.settings.profileAvatar) setAvatarDraft(response.settings.profileAvatar);
      })
      .catch(() => {
        if (active) {
          setProfileSettings({
            settings: cosmetics,
            convenience: { hasRewards: false, presetSlots: 1, loadoutSlots: 1 },
            options: {
              titles: [],
              badges: [],
              accents: [{ key: 'default', label: 'StreetsEmpire', description: null }],
              frames: [],
              themes: [],
              effects: [
                { key: 'none', label: 'No effect', description: null },
                { key: 'chrome-serpent', label: 'Chrome Serpent', description: null },
                { key: 'phantom-convoy', label: 'Phantom Convoy', description: null },
                { key: 'lantern-district', label: 'Lantern District', description: null },
                { key: 'siren-breaker', label: 'Siren Breaker', description: null },
                { key: 'block-sovereign', label: 'Block Sovereign', description: null },
                { key: 'gilded-house', label: 'Gilded House', description: null },
                { key: 'dead-or-alive', label: 'Dead-or-Alive', description: null },
                { key: 'laurel-ascendant', label: 'Laurel Ascendant', description: null },
                { key: 'snowstorm', label: 'Snowstorm', description: null },
                { key: 'inferno', label: 'Inferno', description: null },
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
    authApi.usernameStatus()
      .then((response) => { if (active) setUsernameStatus(response.status); })
      .catch(() => { if (active) setUsernameStatus(null); });
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

  // Coming back lands where you left off: without a #hash in the URL, restore the last section.
  useEffect(() => {
    if (window.location.hash) {
      const seen = window.location.hash.slice(1);
      if ((SETTING_SECTIONS as readonly string[]).includes(seen)) setLastSection(seen);
      return;
    }
    if (lastSection && lastSection !== 'settings-account') {
      document.getElementById(lastSection)?.scrollIntoView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onHash = () => {
      const seen = window.location.hash.slice(1);
      if ((SETTING_SECTIONS as readonly string[]).includes(seen)) setLastSection(seen);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [setLastSection]);

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

  async function changeUsername(username: string) {
    setBusy('username');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.changeUsername({ username });
      useSession.setState({ account: response.account });
      setUsernameStatus(response.status);
      // The name in the current round changes too.
      if (me) await useSession.getState().refreshRound();
      setTone('info');
      setMessage(response.message);
      setNewUsername('');
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

  function chooseAvatarMode(mode: AvatarMode) {
    setAvatarMode(mode);
    setCosmetics((current) => ({
      ...current,
      profileImageUrl: mode === 'image' ? imageDraft : null,
      profileAvatar: mode === 'built' ? avatarDraft : null,
    }));
  }

  function changeBuiltAvatar(parts: AvatarParts) {
    setAvatarDraft(parts);
    setCosmetics((current) => ({ ...current, profileAvatar: parts }));
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
        activeProfileFrameKey: null,
        itemCosmetics: cosmetics.itemCosmetics ?? {},
        crewCosmetics: cosmetics.crewCosmetics ?? DEFAULT_CREW_COSMETICS,
        showThemeOnProfile: cosmetics.showThemeOnProfile ?? true,
        showLookOnProfile: cosmetics.showLookOnProfile ?? true,
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
  const selectedAvatarFrame = profileSettings?.options.frames.find((option) => option.key === cosmetics.activeAvatarFrameKey);
  // Signature Profile Card (supporter reward): on while its frame is the avatar frame.
  const signature = cosmetics.activeAvatarFrameKey === SIGNATURE_CARD_FRAME_KEY;
  const surfaceOptions = profileSettings?.options.surfaces ?? [];
  const selectedSurface = surfaceOptions.find((option) => option.key === (cosmetics.profileSurface ?? 'brushed'));
  const displayName = me?.displayName ?? account.username;
  const previewCity = me?.city.name ?? 'Your city';
  const previewRank = me ? `#${me.publicPimpId.toLocaleString()}` : 'Preview';

  return (
    <Frame>
      <header className="se-settings-hero">
        <div className="se-settings-hero__copy">
          <p className="se-eyebrow">Private account · Command center</p>
          <h1 className="se-title">Your settings</h1>
          <p>Shape how StreetsEmpire looks, feels and reaches you. Your criminal record stays on the streets; everything here is yours alone.</p>
        </div>
        <div className="se-settings-hero__identity">
          <span className={`se-settings-hero__avatar${cosmetics.activeAvatarFrameKey ? ' se-settings-hero__avatar--framed' : ''}`} aria-hidden="true">
            <AvatarPortrait imageUrl={cosmetics.profileImageUrl} avatar={cosmetics.profileAvatar} fallback={initials(displayName)} frameKey={cosmetics.activeAvatarFrameKey} />
          </span>
          <div className="se-settings-hero__player">
            <span className="se-settings-hero__label">Signed in as</span>
            <strong>{displayName}</strong>
            <small>{previewCity}{round ? ` · ${round.name}` : ''}</small>
          </div>
          <div className="se-settings-hero__status" aria-label="Account status">
            <span className={account.emailVerifiedAt ? 'is-ready' : 'is-attention'}>{account.emailVerifiedAt ? 'Email verified' : 'Verify email'}</span>
            <span className={account.twoFactorEnabled ? 'is-ready' : ''}>{account.twoFactorEnabled ? '2-step on' : '2-step off'}</span>
          </div>
          {me ? <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/profile">View public profile</Link> : null}
        </div>
      </header>

      {message ? <Alert tone={tone}>{message}</Alert> : null}

      <div className="se-settings-layout">
        <aside className="se-settings-nav" aria-label="Settings categories">
          <span className="se-settings-nav__eyebrow">Settings index</span>
          <nav>
            <a href="#settings-account"><span>01</span>Account</a>
            <a href="#settings-connections"><span>02</span>Connections</a>
            <a href="#settings-alerts"><span>03</span>Alerts</a>
            <a href="#settings-security"><span>04</span>Security</a>
            <a href="#settings-game"><span>05</span>Game</a>
            <a href="#settings-profile"><span>06</span>Profile & look</a>
            <a href="#settings-data"><span>07</span>Data & privacy</a>
          </nav>
          <p>Changes to your look and interface are saved together. Account and alert actions save as you make them.</p>
        </aside>

        <div className="se-settings-content">
      <section id="settings-account" className="se-settings-section" aria-labelledby="settings-account-title">
        <header className="se-settings-section__head">
          <div><span>01</span><h2 id="settings-account-title">Account</h2></div>
          <p>Your identity, sign-in details and recovery address.</p>
        </header>
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

          <Panel title="Change pimp name">
            <form onSubmit={(event) => { event.preventDefault(); void changeUsername(newUsername); }} noValidate>
              <Field
                label="New pimp name"
                name="username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                autoComplete="username"
                required
                maxLength={USERNAME_MAX}
                error={fields.username}
                hint={usernameChangeHint(usernameStatus)}
              />
              <Button
                className="se-btn se-btn--primary se-btn--block"
                disabledReason={busy !== null ? working : usernameStatus && !usernameStatus.canChange ? usernameChangeHint(usernameStatus) : null}
              >
                {busy === 'username' ? 'Changing...' : 'Change name'}
              </Button>
            </form>
            {usernameStatus?.reclaim ? (
              <>
                <p className="se-hint">
                  <strong>{usernameStatus.reclaim.username}</strong> is held for you until {formatDate(usernameStatus.reclaim.until)}.
                  Nobody else can take it, and taking it back is free.
                </p>
                <Button
                  type="button"
                  className="se-btn se-btn--ghost se-btn--block"
                  onClick={() => void changeUsername(usernameStatus.reclaim!.username)}
                  disabledReason={busy !== null ? working : null}
                >
                  {`Take back ${usernameStatus.reclaim.username}`}
                </Button>
              </>
            ) : null}
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
          <div id="settings-connections" className="se-settings-anchor">
            <ConnectedAccountsPanel
              account={account}
              onConnectionsChanged={() => setConnectionsVersion((current) => current + 1)}
            />
          </div>

          <div id="settings-alerts" className="se-settings-anchor">
            <NotificationsPanel refreshKey={connectionsVersion} />
          </div>

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
      </section>

      <section id="settings-security" className="se-settings-section" aria-labelledby="settings-security-title">
        <header className="se-settings-section__head">
          <div><span>04</span><h2 id="settings-security-title">Security</h2></div>
          <p>Protect the account and review every place it is signed in.</p>
        </header>
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
      </section>

      <section id="settings-game" className="se-settings-section" aria-labelledby="settings-game-title">
        <header className="se-settings-section__head">
          <div><span>05</span><h2 id="settings-game-title">Game</h2></div>
          <p>Reset guidance and manage the extras that travel with your account.</p>
        </header>
      <Panel title="Tutorial">
        <p>Replay the first-login intro, see every page intro again and bring back the getting-started goals. Every page also has a "How this page works" panel.</p>
        <ReplayTutorial className="se-btn se-btn--ghost" />
      </Panel>

      <Panel title="Supporting">
        <p>
          Supporter status, rewards, billing, gifts and supporter votes now live on their own page with a full rewards showcase.
        </p>
        <Link className="se-btn se-btn--primary" to={`/game/supporter${searchParams.get('supporter') ? `?supporter=${encodeURIComponent(searchParams.get('supporter')!)}` : ''}`}>
          Open supporter page
        </Link>
      </Panel>
      </section>

      <section id="settings-profile" className="se-settings-section" aria-labelledby="settings-profile-title">
        <header className="se-settings-section__head">
          <div><span>06</span><h2 id="settings-profile-title">Profile & look</h2></div>
          <p>Build your public identity, collection loadout and everyday interface.</p>
        </header>
      <Panel title="Cosmetics & interface">
        {!profileSettings ? (
          <p className="se-muted">Loading your unlocked badges...</p>
        ) : (
          <form onSubmit={saveCosmetics} noValidate>
            <p className="se-hint">
              {profileSettings.convenience.hasRewards
                ? `Supporter rewards active: ${formatNumber(profileSettings.convenience.presetSlots)} profile presets and ${formatNumber(profileSettings.convenience.loadoutSlots)} cosmetic loadout slots are available.`
                : `Free account limits: ${formatNumber(profileSettings.convenience.presetSlots)} profile preset and ${formatNumber(profileSettings.convenience.loadoutSlots)} cosmetic loadout slot. Supporting expands both to 4.`}
            </p>
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
                  <span className="se-label" id="avatar-mode-label">Avatar</span>
                  <div className="se-avatar-mode" role="radiogroup" aria-labelledby="avatar-mode-label">
                    {AVATAR_MODES.map((mode) => (
                      <button
                        type="button"
                        role="radio"
                        key={mode.key}
                        aria-checked={avatarMode === mode.key}
                        className={`se-avatar-mode__option${avatarMode === mode.key ? ' is-active' : ''}`}
                        onClick={() => chooseAvatarMode(mode.key)}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  {avatarMode === 'image' ? (
                    <>
                      <input
                        id="profile-image-url"
                        aria-label="Profile image URL"
                        className="se-input"
                        value={cosmetics.profileImageUrl ?? ''}
                        maxLength={PROFILE_IMAGE_URL_MAX}
                        placeholder="https://i.imgur.com/your-avatar.png"
                        inputMode="url"
                        autoComplete="off"
                        onChange={(event) => {
                          setImageDraft(event.target.value);
                          setCosmetics((current) => ({
                            ...current,
                            profileImageUrl: event.target.value,
                          }));
                        }}
                      />
                      {fields.profileImageUrl
                        ? <p className="se-error" role="alert">{fields.profileImageUrl}</p>
                        : <p className="se-hint">Use a direct HTTPS image link from Imgur or your own host.</p>}
                    </>
                  ) : avatarMode === 'built' ? (
                    <>
                      <AvatarBuilder value={cosmetics.profileAvatar ?? avatarDraft} onChange={changeBuiltAvatar} />
                      {fields.profileAvatar
                        ? <p className="se-error" role="alert">{fields.profileAvatar}</p>
                        : <p className="se-hint">No picture needed. Pick a boy or girl base, then mix face pieces, hair and a shirt. Save settings to put it on.</p>}
                    </>
                  ) : (
                    <p className="se-hint">Your initials sit in the avatar circle.</p>
                  )}
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
                  {fields.activeTitleKey ? <p className="se-error" role="alert">{fields.activeTitleKey}</p> : <p className="se-hint">Sir, Madam, Don, and Donna appear before your name. Earned titles appear after it. Titles are cosmetic only.</p>}
                  {(() => {
                    const title = profileSettings.options.titles.find((option) => option.key === cosmetics.activeTitleKey)?.label;
                    const name = me?.displayName ?? account.username;
                    if (!title) return null;
                    return (
                      <p className="se-hint">Preview: <strong className="se-profile-name-preview">
                        {profileNameParts(name, title).map((part, index) => (
                          <span className={`se-profile-name-preview__${part.kind}`} key={index}>{part.text}</span>
                        ))}
                      </strong></p>
                    );
                  })()}
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
                  <label className="se-label" htmlFor="avatar-frame">Avatar frame</label>
                  <select
                    id="avatar-frame"
                    className="se-input"
                    value={cosmetics.activeAvatarFrameKey ?? ''}
                    onChange={(event) => setCosmetics((current) => ({
                      ...current,
                      activeAvatarFrameKey: event.target.value || null,
                    }))}
                  >
                    <option value="">No avatar frame</option>
                    {profileSettings.options.frames.map((option) => (
                      <option value={option.key} key={option.key}>{option.label}</option>
                    ))}
                  </select>
                  {fields.activeAvatarFrameKey
                    ? <p className="se-error" role="alert">{fields.activeAvatarFrameKey}</p>
                    : <p className="se-hint">{profileSettings.options.frames.length ? 'Frames are permanent and appear anywhere your profile picture is shown.' : 'Complete qualifying Contact finales or unlock a site theme to earn avatar frames.'}</p>}
                </div>

                {surfaceOptions.length ? (
                  <div className="se-field">
                    <label className="se-label" htmlFor="profile-surface">Card surface</label>
                    <select
                      id="profile-surface"
                      className="se-input"
                      value={cosmetics.profileSurface ?? 'brushed'}
                      onChange={(event) => setCosmetics((current) => ({
                        ...current,
                        profileSurface: event.target.value as ProfileSurface,
                      }))}
                    >
                      {surfaceOptions.map((option) => (
                        <option value={option.key} key={option.key}>{option.label}</option>
                      ))}
                    </select>
                    {fields.profileSurface
                      ? <p className="se-error" role="alert">{fields.profileSurface}</p>
                      : <p className="se-hint">The finish behind your Signature Profile Card. It shows while the Midnight Chrome Signature Card is your avatar frame.</p>}
                  </div>
                ) : null}

                <div className="se-field">
                  <label className="se-label" htmlFor="profile-effect">Popup animation</label>
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
                    : <p className="se-hint">This changes how your profile card pops open. Each animation unlocks with its site theme, and reduced-motion visitors see a still version.</p>}
                </div>

                <div className="se-field">
                  <label className="se-label" htmlFor="site-theme">Site theme</label>
                  <select
                    id="site-theme"
                    className="se-input"
                    value={cosmetics.activeSiteThemeKey ?? ''}
                    onChange={(event) => {
                      const themeKey = event.target.value || null;
                      // Put on the theme's matching avatar frame and popup animation; either can be changed after to mix.
                      const look = themeKey ? siteThemeCompanionLook(themeKey) : undefined;
                      const frameKey = look && profileSettings.options.frames.some((option) => option.key === look.frameKey) ? look.frameKey : null;
                      const effect = look && profileSettings.options.effects.some((option) => option.key === look.effect) ? look.effect as ProfileEffect : null;
                      setCosmetics((current) => ({
                        ...current,
                        activeSiteThemeKey: themeKey,
                        ...(frameKey ? { activeAvatarFrameKey: frameKey } : {}),
                        ...(effect ? { profileEffect: effect } : {}),
                      }));
                    }}
                  >
                    <option value="">No site theme</option>
                    {profileSettings.options.themes.map((option) => (
                      <option value={option.key} key={option.key}>{option.label}</option>
                    ))}
                  </select>
                  {fields.activeSiteThemeKey
                    ? <p className="se-error" role="alert">{fields.activeSiteThemeKey}</p>
                    : <p className="se-hint">{profileSettings.options.themes.length ? 'Choose the whole game-shell look. Picking a theme also puts on its matching avatar frame and popup animation; change either afterwards to mix.' : 'Seasonal and event themes will appear here after you unlock them, with their matching avatar frame and popup animation.'}</p>}
                </div>
              </div>

              <div className="se-account-cosmetics__side">
                <div
                  className={`se-profile-card-preview se-profile-accent se-profile-accent--${cosmetics.profileAccent} se-profile-effect se-profile-effect--${cosmetics.profileEffect}${signature ? ' se-signature-card' : ''}`}
                  data-avatar-frame={cosmetics.activeAvatarFrameKey ?? 'none'}
                  data-surface={signature ? cosmetics.profileSurface ?? 'brushed' : undefined}
                >
                  <div
                    className="se-profile-card-preview__banner"
                    style={cosmetics.profileBannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(5, 8, 8, 0.52), rgba(5, 8, 8, 0.86)), url("${cosmetics.profileBannerUrl}")` } : undefined}
                  >
                    <span>Street Empire</span>
                  </div>
                  <div className="se-profile-card-preview__identity">
                    <span className="se-profile-card-preview__avatar" aria-hidden="true" title={selectedAvatarFrame?.label}>
                      <AvatarPortrait
                        imageUrl={cosmetics.profileImageUrl}
                        avatar={cosmetics.profileAvatar}
                        fallback={initials(displayName)}
                        frameKey={cosmetics.activeAvatarFrameKey}
                      />
                    </span>
                    <div>
                      <strong className="se-profile-card-preview__name">
                        {profileNameParts(displayName, selectedTitle?.label).map((part, index, parts) => (
                          <span className={`se-profile-card-preview__namepart se-profile-card-preview__namepart--${part.kind}`} key={index}>
                            {signature && index === parts.length - 1 ? <NameWithSupporterMark text={part.text} /> : part.text}
                          </span>
                        ))}
                      </strong>
                      <small>Player {previewRank}</small>
                    </div>
                  </div>
                  {cosmetics.profileBio ? <p className="se-profile-card-preview__bio">{cosmetics.profileBio}</p> : null}
                  <p>{previewCity}{round ? ` · ${round.name}` : ''}</p>
                  <div className="se-profile-card-preview__chips">
                    <span>{selectedAccent?.label ?? 'StreetsEmpire'} accent</span>
                    {selectedAvatarFrame ? <span>{signature ? selectedAvatarFrame.label : `${selectedAvatarFrame.label} avatar frame`}</span> : null}
                    {signature && selectedSurface ? <span>{selectedSurface.label} surface</span> : null}
                    {cosmetics.profileEffect !== 'none' ? <span>{profileSettings.options.effects.find((option) => option.key === cosmetics.profileEffect)?.label ?? 'Frame animation'}</span> : null}
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
              <label className="se-checkrow se-checkrow--toggle">
                <input
                  type="checkbox"
                  checked={cosmetics.showThemeOnProfile ?? true}
                  onChange={(event) => setCosmetics((current) => ({
                    ...current,
                    showThemeOnProfile: event.target.checked,
                  }))}
                />
                <span>
                  <strong>Show my theme on my profile</strong>
                  <small>Visitors see your profile in your site theme.</small>
                </span>
              </label>
              <label className="se-checkrow se-checkrow--toggle">
                <input
                  type="checkbox"
                  checked={cosmetics.showLookOnProfile ?? true}
                  onChange={(event) => setCosmetics((current) => ({
                    ...current,
                    showLookOnProfile: event.target.checked,
                  }))}
                />
                <span>
                  <strong>Show my look on my profile</strong>
                  <small>Visitors see your item and crew collections. Never your counts.</small>
                </span>
              </label>
            </div>

            <Button className="se-btn se-btn--primary se-btn--block" disabledReason={busy !== null ? working : null}>
              {busy === 'cosmetics' ? 'Saving...' : 'Save settings'}
            </Button>
          </form>
        )}
      </Panel>
      </section>

      <section id="settings-data" className="se-settings-section se-settings-section--danger" aria-labelledby="settings-data-title">
        <header className="se-settings-section__head">
          <div><span>07</span><h2 id="settings-data-title">Data & privacy</h2></div>
          <p>Take a copy of your records or make permanent account changes.</p>
        </header>
      <YourDataPanel />

      <CloseAccountPanel />
      </section>
        </div>
      </div>
    </Frame>
  );
}
