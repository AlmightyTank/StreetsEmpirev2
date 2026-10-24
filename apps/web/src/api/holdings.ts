import type { ProfitIntelligenceDto, ProfitIntelligenceReceiptsPageDto, UpdateProfitIntelligenceGoalsInput } from '@streets/shared';
import { api } from './client.js';

export interface HoldingCity {
  citySlug: string;
  cityName: string;
  corners: string[];
  fronts: number;
  warehouses: Array<{ id: string; name: string; kind: string; isActive: boolean; capacityUnits: number; stock: Array<{ productKey: string; quantity: number }>; paidThrough: string | null; upkeepCents: string; upkeepDue: boolean }>;
  safehouses: Array<{ isActive: boolean; paidThrough: string; upkeepCents: string; upkeepDue: boolean; footholdActive: boolean }>;
  crews: Array<{ id: string; districtKey: string; status: string; stock: Array<{ productKey: string; quantity: number }> }>;
  inbound: Array<{ id: string; warehouseId: string | null; productKey: string; quantity: number; status: string }>;
  pressure: { casePoints: number; stage: string };
}

export const holdingsApi = {
  page: () => api.get<{ cities: HoldingCity[]; modifiers: { dealerSalesPace: number; demand: number; upkeep: number } }>('/game/holdings'),
  profit: (days = 30) => api.get<ProfitIntelligenceDto>(`/game/profit-intelligence?days=${days}`),
  saveProfitGoals: (input: UpdateProfitIntelligenceGoalsInput) => api.put<UpdateProfitIntelligenceGoalsInput>('/game/profit-intelligence/goals', input),
  receipts: (params: { days: number; city?: string; source?: string; cursor?: string; limit?: number }) => {
    const query = new URLSearchParams({ days: String(params.days), limit: String(params.limit ?? 50) });
    if (params.city) query.set('city', params.city);
    if (params.source) query.set('source', params.source);
    if (params.cursor) query.set('cursor', params.cursor);
    return api.get<ProfitIntelligenceReceiptsPageDto>(`/game/profit-intelligence/receipts?${query.toString()}`);
  },
};
