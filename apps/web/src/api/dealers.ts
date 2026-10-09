import type {
  DealerCrewActionResult,
  DealerCrewEstablishInput,
  DealerCrewManageInput,
  DealerCrewOfferInput,
  DealerCrewStockInput,
  DealerPageDto,
  DealerStaffActionResult,
  GameActionResult,
} from '@streets/shared';
import { api } from './client.js';

/** 1.6.0-E. Dealer crews. */
export const dealersApi = {
  page: () => api.get<DealerPageDto>('/game/dealers'),
  establish: (input: DealerCrewEstablishInput) => api.post<GameActionResult<DealerCrewActionResult>>('/game/dealers', input),
  offer: (crewId: string, input: DealerCrewOfferInput) => api.post<GameActionResult<DealerCrewActionResult>>(`/game/dealers/${encodeURIComponent(crewId)}/offer`, input),
  stock: (crewId: string, input: DealerCrewStockInput) => api.post<GameActionResult<DealerCrewActionResult>>(`/game/dealers/${encodeURIComponent(crewId)}/stock`, input),
  manage: (crewId: string, input: DealerCrewManageInput) => api.post<GameActionResult<DealerCrewActionResult>>(`/game/dealers/${encodeURIComponent(crewId)}/manage`, input),
  addDealer: (crewId: string, actionId: string, staffId?: string) => api.post<GameActionResult<DealerStaffActionResult>>(`/game/supply/dealer-crews/${encodeURIComponent(crewId)}/staff`, { actionId, ...(staffId ? { staffId } : {}) }),
  releaseDealer: (staffId: string, actionId: string) => api.post<GameActionResult<DealerStaffActionResult>>(`/game/supply/dealer-staff/${encodeURIComponent(staffId)}/release`, { actionId }),
};
