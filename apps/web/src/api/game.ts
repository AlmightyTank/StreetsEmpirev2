import type { GameSnapshotDto, PlayerExperienceDto, PlayerExperienceEventDto } from '@streets/shared';
import { api } from './client.js';
import { noteRoundRollCallContinuity, publishRoundRollCallStamp, roundRollCallApi } from './roundRollCall.js';

export const gameApi = {
  /** Authenticated lightweight player check-in; never settles game state. */
  presenceHeartbeat: () => api.post<{ ok: true }>('/game/presence/heartbeat'),
  /** Account-wide lifetime XP, available even when not in an active season. */
  experience: () => api.get<{ experience: PlayerExperienceDto; events: PlayerExperienceEventDto[] }>('/game/experience'),

  /**
   * Section 45. The whole dashboard in one request.
   *
   * `background` marks a keep-alive poll rather than the player arriving, so
   * a tab left open does not keep resetting the away-bonus clock.
   */
  me: async (options: { background?: boolean } = {}) => {
    const snapshot = await api.get<GameSnapshotDto>(`/game/me${options.background ? '?background=1' : ''}`);
    if (!options.background) {
      // A: only foreground game visits count; repeated visits cannot double-pay.
      try {
        const checkIn = await roundRollCallApi.checkIn();
        // The next round day checks itself in. Reloading for an update does not
        // clear stamps; the server still owns the attendance ledger.
        noteRoundRollCallContinuity(checkIn);
        if (checkIn.recorded) {
          publishRoundRollCallStamp({ stamps: checkIn.stamps, requiredStamps: checkIn.requiredStamps });
          // The snapshot was read before this stamp; count its new reward so the badge is current.
          const rollCall = snapshot.player.roundRollCall;
          if (rollCall) snapshot.player.roundRollCall = { claimable: rollCall.claimable + 1 };
        }
      } catch {
        // A transient attendance error must never prevent the game from opening.
      }
    }
    return snapshot;
  },
};
