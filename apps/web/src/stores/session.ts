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
  crewName: null,
  activeProfileFrameKey: null,
  activeSiteThemeKey: null,
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

  /** Resolve who we are and which game is running. Runs once on mount. */
  bootstrap: () => Promise<void>;
  refreshProfileSettings: () => Promise<AccountProfileSettingsDto>;
  setProfileSettings: (settings: AccountProfileSettingsDto) => void;
  refreshRound: () => Promise<void>;
  /** Section 45/47. Pull the authoritative dashboard state. */
  refreshSnapshot: (options?: { background?: boolean }) => Promise<void>;

  register: (input: RegisterInput) => Promise<string | null>;
  login: (input: LoginInput) => Promise<void>;
  resetPassword: (input: ResetPasswordInput) => Promise<void>;
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

  async bootstrap() {
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
    const { account } = await authApi.login(input);
    set({ account });
    await get().refreshProfileSettings();
    await get().refreshRound();
  },

  async resetPassword(input) {
    const { account } = await authApi.resetPassword(input);
    set({ account });
    await get().refreshProfileSettings();
    await get().refreshRound();
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
