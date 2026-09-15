import type {
  AdminAuditLogDto,
  AdminRoundResultDto,
  AdminRoundsDto,
  AdminScheduleRoundInput,
} from '@streets/shared';
import { api } from './client.js';

const roundPath = (roundId: string, action: string) => `/admin/rounds/${encodeURIComponent(roundId)}/${action}`;

export const adminApi = {
  rounds: () => api.get<AdminRoundsDto>('/admin/rounds'),
  scheduleRound: (input: AdminScheduleRoundInput) => api.post<AdminRoundResultDto>('/admin/rounds', input),
  openRegistration: (roundId: string) => api.post<AdminRoundResultDto>(roundPath(roundId, 'open-registration')),
  startRound: (roundId: string, confirmHandoff: boolean) => api.post<AdminRoundResultDto>(roundPath(roundId, 'start'), { confirmHandoff }),
  endRoundEarly: (roundId: string, reason: string) => api.post<AdminRoundResultDto>(roundPath(roundId, 'end-early'), { reason }),
  archiveRound: (roundId: string) => api.post<AdminRoundResultDto>(roundPath(roundId, 'archive')),
  audit: (limit = 50) => api.get<AdminAuditLogDto>(`/admin/audit?limit=${limit}`),
};
