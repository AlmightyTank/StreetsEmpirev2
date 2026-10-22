import type { Prisma, PrismaClient } from '@prisma/client';
import type { HideoutGeneratorDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';

const BASE_CAPACITY = 10;
const FUEL_CHARGES_PER_CAN = 10;
const MAX_CAPACITY_LEVEL = 3;
const MAX_EFFICIENCY_LEVEL = 2;

type GeneratorRow = {
  generatorPowered: boolean;
  generatorFuel: number;
  generatorCapacityLevel: number;
  generatorEfficiencyLevel: number;
  scavengedComponents: Prisma.JsonValue;
};

export type GeneratorUpdate = {
  powered?: boolean;
  refuelCans?: number;
  upgrade?: 'CAPACITY' | 'EFFICIENCY';
};

export function generatorCapacity(level: number): number { return BASE_CAPACITY + Math.max(0, level) * 5; }
export function generatorFuelPerTurn(efficiencyLevel: number): number { return Math.max(1, 2 - Math.max(0, efficiencyLevel)); }

function componentBalances(value: Prisma.JsonValue): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, quantity]) => typeof quantity === 'number' && quantity >= 0)) as Record<string, number>;
}

function upgrades(row: GeneratorRow): HideoutGeneratorDto['upgrades'] {
  const result: HideoutGeneratorDto['upgrades'] = [];
  if (row.generatorCapacityLevel < MAX_CAPACITY_LEVEL) {
    const next = row.generatorCapacityLevel + 1;
    result.push({ key: 'CAPACITY', level: row.generatorCapacityLevel, nextLevel: next, costCents: next * 50_000, components: [{ key: 'SCRAP_METAL', quantity: next * 5 }, { key: 'WIRING', quantity: next * 2 }], benefit: `Raises fuel capacity to ${generatorCapacity(next)} charges.` });
  }
  if (row.generatorEfficiencyLevel < MAX_EFFICIENCY_LEVEL) {
    const next = row.generatorEfficiencyLevel + 1;
    result.push({ key: 'EFFICIENCY', level: row.generatorEfficiencyLevel, nextLevel: next, costCents: next * 75_000, components: [{ key: 'WIRING', quantity: next * 4 }, { key: 'PRECISION_PARTS', quantity: next }], benefit: `Uses ${generatorFuelPerTurn(next)} fuel charge per powered turn.` });
  }
  return result;
}

export function generatorDto(row: GeneratorRow): HideoutGeneratorDto {
  const fuelPerTurn = generatorFuelPerTurn(row.generatorEfficiencyLevel);
  return {
    powered: row.generatorPowered,
    fuel: row.generatorFuel,
    capacity: generatorCapacity(row.generatorCapacityLevel),
    fuelPerTurn,
    estimatedPoweredTurns: Math.floor(row.generatorFuel / fuelPerTurn),
    capacityLevel: row.generatorCapacityLevel,
    efficiencyLevel: row.generatorEfficiencyLevel,
    upgrades: upgrades(row),
  };
}

export function consumeGeneratorFuel<T extends { generatorPowered?: boolean; generatorFuel?: number; generatorEfficiencyLevel?: number }>(state: T, turnsSpent: number): T {
  const powered = state.generatorPowered ?? false;
  const fuel = state.generatorFuel ?? 0;
  const efficiencyLevel = state.generatorEfficiencyLevel ?? 0;
  if (!powered || turnsSpent <= 0 || fuel <= 0) {
    return powered && fuel <= 0 ? { ...state, generatorPowered: false } : state;
  }
  const fuelUsed = Math.min(fuel, turnsSpent * generatorFuelPerTurn(efficiencyLevel));
  return { ...state, generatorFuel: fuel - fuelUsed, generatorPowered: fuel > fuelUsed };
}

const select = { generatorPowered: true, generatorFuel: true, generatorCapacityLevel: true, generatorEfficiencyLevel: true, scavengedComponents: true } as const;

export const GeneratorService = {
  async page(prisma: PrismaClient, roundPlayerId: string): Promise<HideoutGeneratorDto> {
    const row = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select });
    if (!row) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
    return generatorDto(row);
  },

  async update(prisma: PrismaClient, roundPlayerId: string, input: GeneratorUpdate): Promise<HideoutGeneratorDto> {
    return prisma.$transaction(async (tx) => {
      const row = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { ...select, cashCents: true } });
      if (!row) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
      const balances = componentBalances(row.scavengedComponents);
      const data: Record<string, unknown> = {};

      if (input.powered !== undefined) data.generatorPowered = input.powered && row.generatorFuel > 0;
      if (input.refuelCans !== undefined) {
        if (!Number.isInteger(input.refuelCans) || input.refuelCans < 0) throw AppError.badRequest('INVALID_REFUEL', 'Refuel cans must be a non-negative whole number.');
        if ((balances.FUEL_CAN ?? 0) < input.refuelCans) throw AppError.badRequest('NOT_ENOUGH_FUEL_CANS', 'You do not have enough fuel cans.');
        const added = Math.min(input.refuelCans * FUEL_CHARGES_PER_CAN, generatorCapacity(row.generatorCapacityLevel) - row.generatorFuel);
        balances.FUEL_CAN = (balances.FUEL_CAN ?? 0) - Math.ceil(added / FUEL_CHARGES_PER_CAN);
        data.generatorFuel = row.generatorFuel + added;
        data.scavengedComponents = balances as Prisma.InputJsonValue;
      }
      if (input.upgrade) {
        const next = input.upgrade === 'CAPACITY' ? row.generatorCapacityLevel + 1 : row.generatorEfficiencyLevel + 1;
        const max = input.upgrade === 'CAPACITY' ? MAX_CAPACITY_LEVEL : MAX_EFFICIENCY_LEVEL;
        if (next > max) throw AppError.conflict('GENERATOR_MAXED', 'That generator upgrade is already maxed.');
        const costCents = BigInt(next * (input.upgrade === 'CAPACITY' ? 50_000 : 75_000));
        const requirements = input.upgrade === 'CAPACITY' ? { SCRAP_METAL: next * 5, WIRING: next * 2 } : { WIRING: next * 4, PRECISION_PARTS: next };
        if (row.cashCents < costCents) throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot afford that generator upgrade.');
        for (const [key, quantity] of Object.entries(requirements)) if ((balances[key] ?? 0) < quantity) throw AppError.badRequest('MISSING_COMPONENTS', `You need more ${key.toLowerCase().replaceAll('_', ' ')}.`);
        for (const [key, quantity] of Object.entries(requirements)) balances[key] = (balances[key] ?? 0) - quantity;
        data.cashCents = row.cashCents - costCents;
        data.scavengedComponents = balances as Prisma.InputJsonValue;
        data[input.upgrade === 'CAPACITY' ? 'generatorCapacityLevel' : 'generatorEfficiencyLevel'] = next;
      }
      if (!Object.keys(data).length) return generatorDto(row);
      const updated = await tx.roundPlayer.update({ where: { id: roundPlayerId }, data, select });
      return generatorDto(updated);
    });
  },
};
