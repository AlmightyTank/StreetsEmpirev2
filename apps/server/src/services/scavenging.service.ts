import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { CacheOddsDto, ScavengeCacheDto, ScavengeComponentDto, ScavengePageDto, ScavengeRarityDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { recordHideoutEconomy } from './hideout-economy-telemetry.service.js';

export type CacheQuality = ScavengeCacheDto['quality'];
type ComponentDefinition = { key: string; name: string; rarity: ScavengeRarityDto; purpose: string; themes: string[] };
type StoredCache = Omit<ScavengeCacheDto, 'opened' | 'rewards'> & { opened: boolean; rewards?: ScavengeComponentDto[] };

export const COMPONENTS: readonly ComponentDefinition[] = [
  { key: 'SCRAP_METAL', name: 'Scrap metal', rarity: 'COMMON', purpose: 'Workshop repairs and storage upgrades.', themes: ['industrial', 'waterfront'] },
  { key: 'WIRING', name: 'Wiring', rarity: 'COMMON', purpose: 'Workshop repairs and generator work.', themes: ['industrial', 'downtown'] },
  { key: 'TOOL_KIT', name: 'Tool kit', rarity: 'COMMON', purpose: 'Workshop recipes and vehicle repairs.', themes: ['industrial', 'residential'] },
  { key: 'BOTTLES', name: 'Bottles', rarity: 'COMMON', purpose: 'House Brew and trade goods.', themes: ['commercial', 'waterfront'] },
  { key: 'LABELS', name: 'Labels', rarity: 'COMMON', purpose: 'Packaging and House Brew recipes.', themes: ['commercial', 'downtown'] },
  { key: 'PACKAGING', name: 'Packaging', rarity: 'COMMON', purpose: 'Crafting and preserving trade goods.', themes: ['commercial', 'residential'] },
  { key: 'LUMBER', name: 'Lumber', rarity: 'COMMON', purpose: 'Storage and hideout construction.', themes: ['residential', 'waterfront'] },
  { key: 'FASTENERS', name: 'Fasteners', rarity: 'COMMON', purpose: 'Storage, workshop, and garage upgrades.', themes: ['residential', 'industrial'] },
  { key: 'CLOTH', name: 'Cloth', rarity: 'COMMON', purpose: 'Medical and field kit recipes.', themes: ['residential', 'medical'] },
  { key: 'BASIC_MEDICINE', name: 'Basic medicine', rarity: 'UNCOMMON', purpose: 'Field first-aid kits and recovery.', themes: ['medical', 'residential'] },
  { key: 'FUEL_CAN', name: 'Fuel can', rarity: 'UNCOMMON', purpose: 'Generator fuel for powered turns.', themes: ['waterfront', 'industrial'] },
  { key: 'RADIO', name: 'Radio', rarity: 'UNCOMMON', purpose: 'Intel room upgrades and scouting clues.', themes: ['commercial', 'downtown'] },
  { key: 'MOTOR_ASSEMBLY', name: 'Motor assembly', rarity: 'RARE', purpose: 'Garage repairs and vehicle upgrades.', themes: ['industrial', 'waterfront'] },
  { key: 'REPAIR_SUPPLIES', name: 'Repair supplies', rarity: 'RARE', purpose: 'Vehicle repair and workshop upgrades.', themes: ['residential', 'medical'] },
  { key: 'SPECIALTY_CONTAINER', name: 'Specialty container', rarity: 'RARE', purpose: 'High-value packaging and storage upgrades.', themes: ['commercial', 'waterfront'] },
  { key: 'PRECISION_PARTS', name: 'Precision parts', rarity: 'EPIC', purpose: 'Advanced workshop and generator upgrades.', themes: ['industrial', 'downtown'] },
  { key: 'ADVANCED_MEDICAL', name: 'Advanced medical component', rarity: 'EPIC', purpose: 'Advanced clinic recipes.', themes: ['medical'] },
  { key: 'HIGH_CAPACITY_FUEL_CELL', name: 'High-capacity fuel cell', rarity: 'LEGENDARY', purpose: 'Generator capacity upgrades.', themes: ['waterfront'] },
  { key: 'SPECIALIST_CIRCUITRY', name: 'Specialist circuitry', rarity: 'LEGENDARY', purpose: 'Intel room and advanced workshop upgrades.', themes: ['downtown'] },
];

const ODDS: Record<CacheQuality, CacheOddsDto> = {
  STREET_STASH: { COMMON: 70, UNCOMMON: 22, RARE: 7, EPIC: 1, LEGENDARY: 0 },
  SUPPLY_CACHE: { COMMON: 50, UNCOMMON: 30, RARE: 14, EPIC: 5, LEGENDARY: 1 },
  SECURED_CACHE: { COMMON: 30, UNCOMMON: 35, RARE: 22, EPIC: 10, LEGENDARY: 3 },
  BLACK_MARKET_CACHE: { COMMON: 15, UNCOMMON: 30, RARE: 30, EPIC: 18, LEGENDARY: 7 },
};
/** Components a scouting trip brings home: one for every two turns, at least one per trip. */
export function scavengeFindCount(turns: number): number { return turns > 0 ? Math.ceil(turns / 2) : 0; }

const QUALITY_LABEL: Record<CacheQuality, string> = { STREET_STASH: 'Street stash', SUPPLY_CACHE: 'Supply cache', SECURED_CACHE: 'Secured cache', BLACK_MARKET_CACHE: 'Black-market cache' };
const DISTRICT_THEME: Record<string, { theme: string; common: string[]; scarce: string[] }> = {
  CASINO: { theme: 'commercial', common: ['Bottles', 'Labels', 'Packaging'], scarce: ['Radios', 'Specialty containers'] },
  NIGHTCLUB: { theme: 'downtown', common: ['Wiring', 'Labels', 'Packaging'], scarce: ['Radios', 'Specialist circuitry'] },
  LOW_RENT: { theme: 'residential', common: ['Lumber', 'Fasteners', 'Cloth'], scarce: ['Basic medicine', 'Repair supplies'] },
  URBAN_GHETTO: { theme: 'industrial', common: ['Scrap metal', 'Wiring', 'Tool kits'], scarce: ['Motor assemblies', 'Precision parts'] },
  WINO_SLUMS: { theme: 'waterfront', common: ['Fuel cans', 'Scrap metal', 'Bottles'], scarce: ['Motor assemblies', 'High-capacity fuel cells'] },
};

export function districtSupplyClue(key: string) { return DISTRICT_THEME[key] ?? { theme: 'street', common: ['Scrap metal', 'Packaging'], scarce: ['Repair supplies'] }; }
export function cacheQualityForTurns(turns: number): CacheQuality { return turns >= 10 ? 'BLACK_MARKET_CACHE' : turns >= 6 ? 'SECURED_CACHE' : turns >= 3 ? 'SUPPLY_CACHE' : 'STREET_STASH'; }
export function cacheOdds(quality: CacheQuality): CacheOddsDto { return { ...ODDS[quality] }; }

export function jsonObject(value: Prisma.JsonValue, fallback: Record<string, number>): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback };
  return Object.fromEntries(Object.entries(value).filter(([, n]) => typeof n === 'number' && n > 0)) as Record<string, number>;
}
function jsonCaches(value: Prisma.JsonValue): StoredCache[] {
  return Array.isArray(value)
    ? value.filter((row) => !!row && typeof row === 'object' && !Array.isArray(row) && typeof (row as { id?: unknown }).id === 'string')
      .map((row) => row as unknown as StoredCache)
    : [];
}
export function componentDto(key: string, quantity: number): ScavengeComponentDto {
  const definition = COMPONENTS.find((row) => row.key === key);
  if (!definition) throw new Error(`Unknown scavenge component ${key}`);
  return { key, name: definition.name, quantity, rarity: definition.rarity, purpose: definition.purpose, footprint: { width: 1, height: 1 } };
}
function cacheDto(cache: StoredCache): ScavengeCacheDto { return { ...cache, odds: { ...cache.odds }, eligiblePool: cache.eligiblePool.map((row) => ({ ...row })), ...(cache.rewards ? { rewards: cache.rewards.map((row) => ({ ...row })) } : {}) }; }

export function eligiblePool(theme: string): ComponentDefinition[] {
  return COMPONENTS.filter((item) => item.themes.includes(theme));
}

export function makeCache(districtKey: string, districtName: string, turns: number, now = new Date()): StoredCache {
  const quality = cacheQualityForTurns(turns);
  const theme = districtSupplyClue(districtKey).theme;
  const pool = eligiblePool(theme);
  return {
    id: randomUUID(), quality, label: QUALITY_LABEL[quality], districtKey, districtName,
    createdAt: now.toISOString(), opened: false, odds: cacheOdds(quality),
     eligiblePool: pool.map(({ key, name, rarity, purpose }) => ({ key, name, rarity, purpose, footprint: { width: 1, height: 1 } })),
  };
}

export function rollRarity(odds: CacheOddsDto, rng: () => number): ScavengeRarityDto {
  const value = Math.max(0, Math.min(0.999999, rng())) * 100;
  let cursor = 0;
  for (const rarity of ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const) { cursor += odds[rarity]; if (value < cursor) return rarity; }
  return 'COMMON';
}
export function openCache(cache: StoredCache, rng = Math.random): ScavengeComponentDto[] {
  if (cache.opened) return cache.rewards ?? [];
  const rarity = rollRarity(cache.odds, rng);
  const candidates = cache.eligiblePool.filter((row) => row.rarity === rarity);
  const pool = candidates.length ? candidates : cache.eligiblePool.filter((row) => row.rarity === 'COMMON');
  const chosen = pool[Math.floor(rng() * pool.length)] ?? cache.eligiblePool[0];
  return chosen ? [componentDto(chosen.key, rarity === 'COMMON' ? 2 : 1)] : [];
}

export const ScavengingService = {
  async page(prisma: PrismaClient, roundPlayerId: string): Promise<ScavengePageDto> {
    const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { scavengedComponents: true, scavengedCaches: true } });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
    const components = jsonObject(player.scavengedComponents, {});
     return {
       components: Object.entries(components).map(([key, quantity]) => componentDto(key, quantity)),
       // Older builds could leave an opened cache in the JSON list. Treat it
       // as consumed on read so refreshes cannot resurrect it in the UI.
       caches: jsonCaches(player.scavengedCaches).filter((cache) => !cache.opened).map(cacheDto),
     };
  },
  async addFinds(tx: Prisma.TransactionClient, roundPlayerId: string, player: { scavengedComponents: Prisma.JsonValue; scavengedCaches: Prisma.JsonValue }, districtKey: string, districtName: string, turns: number, rng = Math.random): Promise<{ components: ScavengeComponentDto[]; cache: ScavengeCacheDto | null }> {
    const theme = districtSupplyClue(districtKey).theme;
    const pool = eligiblePool(theme);
    const found: Record<string, number> = {};
    const count = scavengeFindCount(turns);
    for (let i = 0; i < count; i += 1) { const item = pool[Math.floor(rng() * pool.length)]; if (item) found[item.key] = (found[item.key] ?? 0) + 1; }
    const components = jsonObject(player.scavengedComponents, {});
    for (const [key, quantity] of Object.entries(found)) components[key] = (components[key] ?? 0) + quantity;
    const caches = jsonCaches(player.scavengedCaches);
    const cache = turns >= 2 && rng() < Math.min(0.85, 0.2 + turns * 0.04) ? makeCache(districtKey, districtName, turns) : null;
    if (cache) caches.push(cache);
    if (Object.keys(found).length) {
      // Components are stackable, so only a previously unseen component needs
      // a new stash cell. Keep loot transactional: a full stash rejects the
      // whole scouting action instead of silently dropping materials.
      const { StashService } = await import('./stash.service.js');
      const stash = await StashService.page(tx, roundPlayerId);
      const newStacks = Object.keys(found).filter((key) => !stash.items.some((item) => item.key === key));
        if (newStacks.length > stash.totalCells - stash.usedCells) {
          throw AppError.conflict('STASH_FULL', 'There is no room in the stash for these scavenged components. Upgrade Storage or clear a slot.');
       }
    }
     await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { scavengedComponents: components as Prisma.InputJsonValue, scavengedCaches: caches as unknown as Prisma.InputJsonValue } });
     for (const [key, quantity] of Object.entries(found)) await recordHideoutEconomy(tx, roundPlayerId, 'COMPONENT_SCAVENGED', { itemKey: key, quantity, payload: { districtKey, turns } });
     if (cache) await recordHideoutEconomy(tx, roundPlayerId, 'CACHE_FOUND', { rarity: cache.quality, payload: { districtKey, turns, cacheId: cache.id } });
    return { components: Object.entries(found).map(([key, quantity]) => componentDto(key, quantity)), cache: cache ? cacheDto(cache) : null };
  },

  async open(prisma: PrismaClient, roundPlayerId: string, cacheId: string): Promise<import('@streets/shared').OpenScavengeCacheResult> {
    return prisma.$transaction(async (tx) => {
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { scavengedComponents: true, scavengedCaches: true } });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
      const caches = jsonCaches(player.scavengedCaches);
      const cache = caches.find((row) => row.id === cacheId);
      if (!cache) throw AppError.notFound('CACHE_NOT_FOUND', 'That cache is no longer available.');
       if (cache.opened) {
         await tx.roundPlayer.update({
           where: { id: roundPlayerId },
           data: { scavengedCaches: caches.filter((entry) => entry.id !== cacheId) as unknown as Prisma.InputJsonValue },
         });
         return { cache: cacheDto(cache), rewards: cache.rewards ?? [] };
       }

      const rewards = openCache(cache);
      cache.opened = true;
      cache.rewards = rewards;
      const components = jsonObject(player.scavengedComponents, {});
      for (const reward of rewards) components[reward.key] = (components[reward.key] ?? 0) + reward.quantity;
       await tx.roundPlayer.update({
         where: { id: roundPlayerId },
         data: {
           scavengedComponents: components as Prisma.InputJsonValue,
           // A cache is consumed by opening it. The returned cache still
           // carries the reward for the reveal animation, but it no longer
           // remains in the player's pending cache list.
           scavengedCaches: caches.filter((entry) => entry.id !== cacheId) as unknown as Prisma.InputJsonValue,
         },
       });
      for (const reward of rewards) await recordHideoutEconomy(tx, roundPlayerId, 'CACHE_OPENED', { itemKey: reward.key, quantity: reward.quantity, rarity: reward.rarity, payload: { cacheId, quality: cache.quality } });
      return { cache: cacheDto(cache), rewards };
    });
  },
};
