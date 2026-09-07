import type { GameSnapshotDto } from '@streets/shared';
import { api } from './client.js';

export const gameApi = {
  /**
   * Section 45. The whole dashboard in one request.
   *
   * `background` marks a keep-alive poll rather than the player arriving, so
   * a tab left open does not keep resetting the away-bonus clock.
   */
  me: (options: { background?: boolean } = {}) =>
    api.get<GameSnapshotDto>(`/game/me${options.background ? '?background=1' : ''}`),
};
