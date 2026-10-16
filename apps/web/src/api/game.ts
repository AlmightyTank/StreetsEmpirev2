import type { GameSnapshotDto, PlayerExperienceDto, PlayerExperienceEventDto } from '@streets/shared';
import { api } from './client.js';

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
      // Slice A: a foreground game entry counts once per round day. The server
      // deduplicates all extra calls; passive dashboard polling never counts.
      // Attendance must never prevent the main game screen from loading.
      try {
        await api.post('/game/round-roll-call/check-in');
      } catch {
        // Retry opportunistically on the next foreground snapshot.
      }
    }
    return snapshot;
  },
};
