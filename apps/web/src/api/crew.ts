import type { CrewRosterDto } from '@streets/shared';
import { api } from './client.js';

export interface CrewRosterFilters {
  role?: 'THUG' | 'WORKER';
  status?: 'AVAILABLE' | 'ASSIGNED' | 'IN_TRANSIT' | 'RECOVERING' | 'RELEASED';
  assignment?: 'BUSINESS' | 'DEALER' | 'TURF';
  specialty?: 'GENERALIST' | 'DEALER';
  limit?: number;
  offset?: number;
}

export const crewApi = {
  roster: (filters: CrewRosterFilters = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined) query.set(key, String(value));
    return api.get<CrewRosterDto>(`/game/crew${query.size ? `?${query.toString()}` : ''}`);
  },
};
