import type {
  AccountDto,
  ActivityDto,
  LoginInput,
  RegisterInput,
  RoundDto,
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
  canJoin: boolean;
  recentActivity: ActivityDto[];

  /** Resolve who we are and which game is running. Runs once on mount. */
  bootstrap: () => Promise<void>;
  refreshRound: () => Promise<void>;
  /** Section 45/47. Pull the authoritative dashboard state. */
  refreshSnapshot: (options?: { background?: boolean }) => Promise<void>;

  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  join: () => Promise<RoundPlayerDto>;
}

export const useSession = create<SessionState>((set, get) => ({
  phase: 'booting',
  account: null,
  round: null,
  me: null,
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
    set({ round: current.round, me: current.me, canJoin: current.canJoin });
  },

  async refreshSnapshot(options = {}) {
    const snapshot = await gameApi.me(options);
    set({
      round: snapshot.round,
      me: snapshot.player,
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

  async logout() {
    await authApi.logout();
    set({ account: null, me: null, recentActivity: [], canJoin: false });
    await get().refreshRound();
  },

  async join() {
    const result = await roundsApi.join();
    set({ round: result.round, me: result.me, canJoin: result.canJoin });
    if (!result.me) throw new Error('Join succeeded but returned no player.');
    return result.me;
  },
}));
