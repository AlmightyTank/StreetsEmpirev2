import type { StreetSkillKeyDto, StreetSkillsDto } from '@streets/shared';
import { api } from './client.js';

export const skillsApi = {
  mine: () => api.get<StreetSkillsDto>('/game/skills'),
  choose: (skill: StreetSkillKeyDto, threshold: number, choice: string) => api.post<unknown>(`/game/skills/${skill}/choice`, { threshold, choice }),
  respec: (skill: StreetSkillKeyDto) => api.post<unknown>(`/game/skills/${skill}/respec`),
};
