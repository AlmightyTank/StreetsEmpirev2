import type { Prisma } from '@prisma/client';
import type { Db } from '../utils/db.js';

export type HideoutEconomyEvent =
  | 'COMPONENT_SCAVENGED'
  | 'CACHE_FOUND'
  | 'CACHE_OPENED'
  | 'STASH_FULL'
  | 'FUEL_USED'
  | 'RECIPE_COMPLETED'
  | 'COMPONENT_SPENT';

export async function recordHideoutEconomy(
  db: Db,
  roundPlayerId: string,
  event: HideoutEconomyEvent,
  input: { itemKey?: string; quantity?: number; rarity?: string; payload?: Prisma.InputJsonValue } = {},
): Promise<void> {
  await db.hideoutEconomyTelemetry.create({
    data: {
      roundPlayerId,
      event,
      itemKey: input.itemKey,
      quantity: input.quantity,
      rarity: input.rarity,
      payload: input.payload ?? {},
    },
  });
}
