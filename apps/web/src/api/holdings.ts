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
};
