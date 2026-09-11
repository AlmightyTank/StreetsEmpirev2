import type { BattleReportDto, CombatPageDto, CombatReconInputDto, CombatReconResultDto, CombatTreatmentDto, CombatTreatmentInputDto, RaidInputDto } from '@streets/shared';
import { api } from './client.js';

export const combatApi = {
  page: (after = 0, background = false) => api.get<CombatPageDto>(`/game/combat?after=${after}&background=${background ? 1 : 0}`),
  raid: (input: RaidInputDto) => api.post<BattleReportDto>('/game/combat/raid', input),
  recon: (input: CombatReconInputDto) => api.post<CombatReconResultDto>('/game/combat/recon', input),
  treat: (input: CombatTreatmentInputDto) => api.post<CombatTreatmentDto>('/game/combat/treat', input),
  reports: (roundId: string, before?: string) => api.get<{ reports: BattleReportDto[]; nextBefore: string | null }>(
    `/game/combat/reports?roundId=${encodeURIComponent(roundId)}${before ? `&before=${encodeURIComponent(before)}` : ''}`),
};
