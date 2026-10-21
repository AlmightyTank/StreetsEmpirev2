import type {
  AllianceDetailDto,
  AllianceRankingsDto,
  AdminAlliancesDto,
  AllianceSettingsInputDto,
  CreateAllianceInputDto,
  MyAllianceDto,
  GameActionResult,
  TerritoryAccessUseResult,
  TerritoryYieldCollection,
  TerritoryEmpireDto,
} from '@streets/shared';
import { api } from './client.js';

const player = (targetPublicPimpId: number) => ({ targetPublicPimpId });

export const allianceApi = {
  mine: () => api.get<MyAllianceDto>('/game/alliance'),
  empire: () => api.get<TerritoryEmpireDto>('/game/alliance/empire'),
  selectRegionalPower: (regionKey: string) => api.post<TerritoryEmpireDto>('/game/alliance/empire/select-region', { regionKey }),
  collectTerritoryYield: (input: { scope: 'city' | 'district'; citySlug: string; district?: string; actionId: string }) => api.post<GameActionResult<TerritoryYieldCollection>>('/game/alliance/empire/collect', input),
  useTerritoryAccess: (input: { scope: 'city' | 'district'; citySlug: string; district?: string; accessKey: string; paymentKind?: 'CASH' | 'AMMO' | 'VEHICLE_PARTS'; actionId: string }) => api.post<GameActionResult<TerritoryAccessUseResult>>('/game/alliance/empire/access', input),
  rankings: () => api.get<AllianceRankingsDto>('/game/alliances'),
  detail: (tag: string) => api.get<{ alliance: AllianceDetailDto }>(`/game/alliances/${encodeURIComponent(tag)}`),
  create: (input: CreateAllianceInputDto) => api.post<MyAllianceDto>('/game/alliance/create', input),
  invite: (publicPimpId: number) => api.post<MyAllianceDto>('/game/alliance/invite', player(publicPimpId)),
  revoke: (publicPimpId: number) => api.post<MyAllianceDto>('/game/alliance/revoke', player(publicPimpId)),
  accept: (tag: string) => api.post<MyAllianceDto>('/game/alliance/accept', { tag }),
  decline: (tag: string) => api.post<MyAllianceDto>('/game/alliance/decline', { tag }),
  kick: (publicPimpId: number) => api.post<MyAllianceDto>('/game/alliance/kick', player(publicPimpId)),
  transfer: (publicPimpId: number) => api.post<MyAllianceDto>('/game/alliance/transfer', player(publicPimpId)),
  settings: (input: AllianceSettingsInputDto) => api.post<MyAllianceDto>('/game/alliance/settings', input),
  leave: () => api.post<MyAllianceDto>('/game/alliance/leave', {}),
  postForumThread: (pitch: string) => api.post<MyAllianceDto>('/game/alliance/forum-thread', pitch.trim() ? { pitch } : {}),
};

export const adminAllianceApi = {
  list: (roundId: string) => api.get<AdminAlliancesDto>(`/admin/rounds/${encodeURIComponent(roundId)}/alliances`),
  rename: (allianceId: string, input: { reason: string; name?: string; tag?: string }) =>
    api.post<{ ok: true }>(`/admin/alliances/${encodeURIComponent(allianceId)}/rename`, input),
  disband: (allianceId: string, reason: string) =>
    api.post<{ ok: true }>(`/admin/alliances/${encodeURIComponent(allianceId)}/disband`, { reason }),
};
