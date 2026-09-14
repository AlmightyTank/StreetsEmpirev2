import type {
  AccountDto,
  ActivityDto,
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
import { roundsApi } from '../api/rounds.js';
import { ApiError } from '../api/client.js';

type Phase = 'booting' | 'ready';

interface SessionState {
  phase: Phase;

  account: AccountDto | null;
  round: RoundDto | null;
  me: RoundPlayerDto | null;
  roundOver: RoundOverDto | null;
  canJoin: boolean;
  recentActivity: ActivityDto[];

  /** Resolve who we are and which game is running. Runs once on mount. */
  bootstrap: () => Promise<void>;
  refreshRound: () => Promise<void>;
  /** Section 45/47. Pull the authoritative dashboard state. */
  refreshSnapshot: (options?: { background?: boolean }) => Promise<void>;

  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  resetPassword: (input: ResetPasswordInput) => Promise<void>;
  verifyEmailToken: (input: VerifyEmailTokenInput) => Promise<string>;
  logout: () => Promise<void>;
  join: () => Promise<RoundPlayerDto>;
}

export const useSession = create<SessionState>((set, get) => ({
  phase: 'booting',
  account: null,
  round: null,
  me: null,
  roundOver: null,
  canJoin: false,
  recentActivity: [],

  async bootstrap() {
    // A 401 here is the normal signed-out case, not an error worth surfacing.
    const account = await authApi
      .me()
      .then((r) => r.account)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.isUnauthenticated) return null;
        throw error;
      });

    set({ account });
    await get().refreshRound();
    set({ phase: 'ready' });
  },

  async refreshRound() {
    const current = await roundsApi.current();
    set({ round: current.round, me: current.me, canJoin: current.canJoin, roundOver: current.roundOver });
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
      canJoin: false,
    });
  },

  async register(input) {
    const { account } = await authApi.register(input);
    set({ account });
    await get().refreshRound();
  },

  async login(input) {
    const { account } = await authApi.login(input);
    set({ account });
    await get().refreshRound();
  },

  async resetPassword(input) {
    const { account } = await authApi.resetPassword(input);
    set({ account });
    await get().refreshRound();
  },

  async verifyEmailToken(input) {
    const response = await authApi.verifyEmailToken(input);
    if (response.account) set({ account: response.account });
    return response.message;
  },

  async logout() {
    await authApi.logout();
    set({ account: null, me: null, roundOver: null, recentActivity: [], canJoin: false });
    await get().refreshRound();
  },

  async join() {
    const result = await roundsApi.join();
    set({ round: result.round, me: result.me, canJoin: result.canJoin, roundOver: result.roundOver });
    if (!result.me) throw new Error('Join succeeded but returned no player.');
    return result.me;
  },
}));
