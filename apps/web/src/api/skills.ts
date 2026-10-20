import type { StreetSkillsDto } from '@streets/shared';
import { api } from './client.js';

export const skillsApi = {
  mine: () => api.get<StreetSkillsDto>('/game/skills'),
};
