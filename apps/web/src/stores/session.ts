import type { NotificationCategory, PlatformMetaDto } from '@streets/shared';
import { platformApi } from '../api/platform.js';
import type {
  AccountDto,
  AccountProfileSettingsDto,
  ActivityDto,
  DefaultLanding,
  GameSnapshotDto,
  VerifyEmailTokenInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  RoundDto,
  RoundOverDto,
  RoundPlayerDto,
} from '@streets/shared';
import { create } from 'zustand';
import { authApi } from '../api/auth.js';
import { gameApi } from '../api/game.js';
import { notificationsApi } from '../api/notifications.js';
import { roundsApi } from '../api/rounds.js';
import { ApiError } from '../api/client.js';
import { unsubscribeFromPush } from '../utils/push.js';

type Phase = 'booting' | 'ready';

export const DEFAULT_PROFILE_SETTINGS: AccountProfileSettingsDto = {
  activeTitleKey: null,
  titlePlacement: 'prefix',
  crewName: null,
  profileBio: null,
  profileImageUrl: null,
  profileBannerUrl: null,
  profileEffect: 'none',
  activeProfileFrameKey: null,
  activeAvatarFrameKey: null,
  activeSiteThemeKey: null,
  itemCosmetics: {},
  crewCosmetics: { THUG: 'classic', HOE: 'classic' },
  showThemeOnProfile: true,
  showLookOnProfile: true,
  featuredBadgeKeys: [],
  profileAccent: 'default',
  uiDensity: 'comfortable',
  reducedMotion: false,
  moneyFormat: 'full',
  defaultLanding: 'game',
};

const LANDING_PATHS: Record<DefaultLanding, string> = {
  game: '/game',
  profile: '/game/profile',
  rankings: '/game/rankings',
  news: '/game/news',
};

export function landingPath(setting: DefaultLanding, hasPlayer: boolean): string {
  if (!hasPlayer && setting !== 'news') return '/join';
  return LANDING_PATHS[setting];
}

/** The /meta read in flight, so the shell and a form mounting together share one. */
let platformLoad: Promise<void> | null = null;

interface SessionState {
  phase: Phase;

  account: AccountDto | null;
  profileSettings: AccountProfileSettingsDto;
  round: RoundDto | null;
  me: RoundPlayerDto | null;
  roundOver: RoundOverDto | null;
  canJoin: boolean;
  recentActivity: ActivityDto[];
  /** Player whose activity list has completed its first authoritative snapshot load. */
  activityHydratedForPlayerId: string | null;
  /** 0.9.0-G. Categories muted in the bell; their live toasts are skipped too. */
  bellMuted: NotificationCategory[];
  setBellMuted: (muted: NotificationCategory[]) => void;
  /** 1.0.0-A. Build, environment, ruleset and season of this game host. */
  platform: PlatformMetaDto | null;

  /** Resolve who we are and which game is running. Runs once on mount. */
  bootstrap: () => Promise<void>;
  /** Read (or re-read) the server's public settings: build, season, the bot-check site key. */
  loadPlatform: () => Promise<void>;
  /** Re-read the signed-in account (after verifying an email in another tab, say). */
  refreshAccount: () => Promise<void>;
  refreshProfileSettings: () => Promise<AccountProfileSettingsDto>;
  setProfileSettings: (settings: AccountProfileSettingsDto) => void;
  refreshRound: () => Promise<void>;
  /** Section 45/47. Pull the authoritative dashboard state. */
  refreshSnapshot: (options?: { background?: boolean }) => Promise<void>;

  register: (input: RegisterInput) => Promise<string | null>;
  /** rc.3: resolves `twoFactorRequired` when the sign-in waits for an authenticator code. */
  login: (input: LoginInput) => Promise<{ twoFactorRequired: boolean }>;
  resetPassword: (input: ResetPasswordInput) => Promise<{ twoFactorRequired: boolean }>;
  /** rc.3. Finishes a sign-in that waits for its code. Returns how many recovery codes are left when one was used. */
  completeTwoFactor: (code: string, trustDevice?: boolean) => Promise<{ recoveryCodesLeft: number | null }>;
  verifyEmailToken: (input: VerifyEmailTokenInput) => Promise<string>;
  logout: () => Promise<void>;
  join: () => Promise<RoundPlayerDto>;
}

export const useSession = create<SessionState>((set, get) => ({
  phase: 'booting',
  account: null,
  profileSettings: DEFAULT_PROFILE_SETTINGS,
  round: null,
  me: null,
  roundOver: null,
  canJoin: false,
  recentActivity: [],
  activityHydratedForPlayerId: null,
  bellMuted: [],
  platform: null,

  setBellMuted(muted) {
    set({ bellMuted: muted });
  },

  loadPlatform() {
    platformLoad ??= platformApi.meta()
      .then((platform) => set({ platform }))
      .catch(() => undefined)
      .finally(() => { platformLoad = null; });
    return platformLoad;
  },

  async bootstrap() {
    // Never blocks sign-in: an older server simply has no /meta.
    void get().loadPlatform();
    // A 401 here is the normal signed-out case, not an error worth surfacing.
    const account = await authApi
      .me()
      .then((r) => r.account)
      .catch((error: unknown) => {
        if (error instanceof ApiError && (error.isUnauthenticated || error.code === 'BETA_APPROVAL_REQUIRED')) return null;
        throw error;
      });

    set({ account });
    if (account) await get().refreshProfileSettings();
    await get().refreshRound();
    set({ phase: 'ready' });
  },

  async refreshAccount() {
    const account = await authApi.me().then((r) => r.account).catch(() => null);
    if (!account) return;
    const wasBlocked = get().account?.verificationRequired ?? false;
    set({ account });
    // Just cleared to play: pick up the season they may already be in.
    if (wasBlocked && !account.verificationRequired) await get().refreshRound();
  },

  async refreshProfileSettings() {
    const settings = await authApi
      .profileSettings()
      .then((r) => r.settings)
      .catch(() => DEFAULT_PROFILE_SETTINGS);
    set({ profileSettings: settings });
    return settings;
  },

  setProfileSettings(profileSettings) {
    set({ profileSettings });
  },

  async refreshRound() {
    const current = await roundsApi.current();
    const previousPlayerId = get().me?.id ?? null;
    const nextPlayerId = current.me?.id ?? null;
    set({
      round: current.round,
      me: current.me,
      canJoin: current.canJoin,
      roundOver: current.roundOver,
      ...(previousPlayerId === nextPlayerId
        ? {}
        : { recentActivity: [], activityHydratedForPlayerId: null }),
    });
  },

  async refreshSnapshot(options = {}) {
    let snapshot: GameSnapshotDto;
    try {
      snapshot = await gameApi.me(options);
    } catch (error) {
      if (error instanceof ApiError && ['NOT_IN_ROUND', 'NO_ACTIVE_ROUND', 'ROUND_ENDED'].includes(error.code)) {
        await get().refreshRound();
      }
      throw error;
    }
    set({
      round: snapshot.round,
      me: snapshot.player,
      roundOver: null,
      recentActivity: snapshot.recentActivity,
      activityHydratedForPlayerId: snapshot.player.id,
      canJoin: false,
    });
  },

  async register(input) {
    const response = await authApi.register(input);
    if (response.approvalRequired) {
      set({ account: null });
      return response.message ?? 'Your beta account is waiting for admin approval.';
    }
    set({ account: response.account });
    await get().refreshProfileSettings();
    await get().refreshRound();
    return null;
  },

  async login(input) {
    const response = await authApi.login(input);
    if ('twoFactorRequired' in response) return { twoFactorRequired: true };
    set({ account: response.account });
    await get().refreshProfileSettings();
    await get().refreshRound();
    return { twoFactorRequired: false };
  },

  async resetPassword(input) {
    const response = await authApi.resetPassword(input);
    if ('twoFactorRequired' in response) return { twoFactorRequired: true };
    set({ account: response.account });
    await get().refreshProfileSettings();
    await get().refreshRound();
    return { twoFactorRequired: false };
  },

  async completeTwoFactor(code, trustDevice = false) {
    const response = await authApi.verifyTwoFactor(code, trustDevice);
    set({ account: response.account });
    await get().refreshProfileSettings();
    await get().refreshRound();
    return { recoveryCodesLeft: response.recoveryCodesLeft ?? null };
  },

  async verifyEmailToken(input) {
    const response = await authApi.verifyEmailToken(input);
    if (response.account) {
      set({ account: response.account });
      await get().refreshProfileSettings();
    }
    return response.message;
  },

  async logout() {
    // A shared phone should stop getting this player's alerts. Best effort: never block signing out.
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await notificationsApi.forget(endpoint);
    } catch {
      // The device stays listed until removed or its push service drops it.
    }
    await authApi.logout();
    set({
      account: null,
      profileSettings: DEFAULT_PROFILE_SETTINGS,
      me: null,
      roundOver: null,
      recentActivity: [],
      activityHydratedForPlayerId: null,
      canJoin: false,
    });
    await get().refreshRound();
  },

  async join() {
    const result = await roundsApi.join();
    set({
      round: result.round,
      me: result.me,
      canJoin: result.canJoin,
      roundOver: result.roundOver,
      recentActivity: [],
      activityHydratedForPlayerId: null,
    });
    if (!result.me) throw new Error('Join succeeded but returned no player.');
    return result.me;
  },
}));
