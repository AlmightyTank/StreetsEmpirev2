import type { CrewPutToWorkResult, CrewRosterDto, GameActionResult } from '@streets/shared';
import { api } from './client.js';

export interface CrewRosterFilters {
  role?: 'THUG' | 'WORKER';
  status?: 'AVAILABLE' | 'ASSIGNED' | 'IN_TRANSIT' | 'RECOVERING' | 'RELEASED';
  assignment?: 'BUSINESS' | 'DEALER' | 'TURF' | 'CORNER_ENFORCER' | 'CORNER_LOOKOUT' | 'STASH_GUARD' | 'RUNNER' | 'BODYGUARD' | 'ESCORT';
  specialty?: 'GENERALIST' | 'ENFORCER' | 'WHEELMAN' | 'SCOUT' | 'DEALER' | 'SERVICE';
  limit?: number;
  offset?: number;
}

export const crewApi = {
  roster: (filters: CrewRosterFilters = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined) query.set(key, String(value));
    return api.get<CrewRosterDto>(`/game/crew${query.size ? `?${query.toString()}` : ''}`);
  },
  train: (memberId: string, actionId: string) => api.post('/game/crew/train', { memberId, actionId }),
  exchange: (memberId: string, replaceMemberId: string, actionId: string) => api.post('/game/crew/exchange', { memberId, replaceMemberId, actionId }),
  assignDealers: (crewId: string, memberIds: string[], actionId: string) =>
    api.post<GameActionResult<CrewPutToWorkResult>>(`/game/crew/dealers/${encodeURIComponent(crewId)}/assign`, { memberIds, actionId }),
  releaseDealers: (memberIds: string[], actionId: string) =>
    api.post<GameActionResult<CrewPutToWorkResult>>('/game/crew/dealers/release', { memberIds, actionId }),
  moveDealers: (crewId: string, memberIds: string[], actionId: string) =>
    api.post<GameActionResult<CrewPutToWorkResult>>(`/game/crew/dealers/${encodeURIComponent(crewId)}/move`, { memberIds, actionId }),
  postTurf: (district: string, memberIds: string[], actionId: string) =>
    api.post<GameActionResult<CrewPutToWorkResult>>('/game/crew/turf/post', { district, memberIds, actionId }),
  pullTurf: (district: string, memberIds: string[], actionId: string) =>
    api.post<GameActionResult<CrewPutToWorkResult>>('/game/crew/turf/pull', { district, memberIds, actionId }),
  moveTurf: (toDistrict: string, memberIds: string[], actionId: string) =>
    api.post<GameActionResult<CrewPutToWorkResult>>('/game/crew/turf/move', { toDistrict, memberIds, actionId }),
};
