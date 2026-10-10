import type { PrismaClient } from '@prisma/client';
import type { DistrictKey, PermanentUnlockDefinition, Ruleset, WeaponUnlockKey } from '@streets/rulesets';
import type { QuestLinkDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

export const PermanentUnlockService = {
  async keys(db: Db | PrismaClient, roundPlayerId: string): Promise<Set<string>> {
    const rows = await db.playerUnlock.findMany({
      where: { roundPlayerId },
      select: { key: true },
    });
    return new Set(rows.map((row) => row.key));
  },

  definition(ruleset: Ruleset, key: string): PermanentUnlockDefinition {
    const definition = ruleset.permanentUnlocks?.[key];
    if (!definition) {
      throw AppError.conflict('QUEST_REWARD_INVALID', `Unknown permanent unlock: ${key}.`);
    }
    return definition;
  },

  async award(
    db: Db,
    roundPlayerId: string,
    ruleset: Ruleset,
    key: string,
    sourceQuestKey: string,
    awardedAt = new Date(),
  ): Promise<PermanentUnlockDefinition> {
    const definition = this.definition(ruleset, key);
    await db.playerUnlock.upsert({
      where: { roundPlayerId_key: { roundPlayerId, key } },
      create: { roundPlayerId, key, sourceQuestKey, awardedAt },
      update: {},
    });
    return definition;
  },

  productPurchaseUnlock(ruleset: Ruleset, productKey: string): PermanentUnlockDefinition | null {
    return Object.values(ruleset.permanentUnlocks ?? {}).find((definition) =>
      definition.effect.kind === 'PRODUCT_PURCHASE_ACCESS'
      && definition.effect.productKey === productKey
    ) ?? null;
  },

  /**
   * The products this player may not buy from Pip yet, with the unlock each needs: at his home
   * counter and at his counter in every other city alike. The high markets sell to anyone.
   */
  async lockedProducts(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<Map<string, PermanentUnlockDefinition>> {
    const locked = new Map<string, PermanentUnlockDefinition>();
    const gated = Object.values(ruleset.permanentUnlocks ?? {}).filter((definition) => definition.effect.kind === 'PRODUCT_PURCHASE_ACCESS');
    if (!gated.length) return locked;
    const keys = await PermanentUnlockService.keys(db, roundPlayerId);
    for (const definition of gated) {
      if (definition.effect.kind === 'PRODUCT_PURCHASE_ACCESS' && !keys.has(definition.key)) locked.set(definition.effect.productKey, definition);
    }
    return locked;
  },

  productProductionUnlock(ruleset: Ruleset, productKey: string): PermanentUnlockDefinition | null {
    return Object.values(ruleset.permanentUnlocks ?? {}).find((definition) => definition.effect.kind === 'PRODUCT_PRODUCTION_ACCESS' && definition.effect.productKey === productKey) ?? null;
  },

  async lockedProductionRecipes(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<Map<string, PermanentUnlockDefinition>> {
    const locked = new Map<string, PermanentUnlockDefinition>();
    const gated = Object.values(ruleset.permanentUnlocks ?? {}).filter((definition) => definition.effect.kind === 'PRODUCT_PRODUCTION_ACCESS');
    if (!gated.length) return locked;
    const keys = await PermanentUnlockService.keys(db, roundPlayerId);
    for (const definition of gated) if (definition.effect.kind === 'PRODUCT_PRODUCTION_ACCESS' && !keys.has(definition.key)) locked.set(definition.effect.productKey, definition);
    return locked;
  },

  async districtAccess(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<Map<DistrictKey, { unlock: PermanentUnlockDefinition; unlocked: boolean }>> {
    const access = new Map<DistrictKey, { unlock: PermanentUnlockDefinition; unlocked: boolean }>();
    const gated = Object.values(ruleset.permanentUnlocks ?? {}).filter((definition) => definition.effect.kind === 'DISTRICT_ACCESS');
    if (!gated.length) return access;
    const keys = await PermanentUnlockService.keys(db, roundPlayerId);
    for (const definition of gated) if (definition.effect.kind === 'DISTRICT_ACCESS') access.set(definition.effect.districtKey, { unlock: definition, unlocked: keys.has(definition.key) });
    return access;
  },

  async assertCanAccessDistrict(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, districtKey: DistrictKey): Promise<void> {
    const access = (await PermanentUnlockService.districtAccess(db, roundPlayerId, ruleset)).get(districtKey);
    if (!access || access.unlocked) return;
    const quest = PermanentUnlockService.questFor(ruleset, access.unlock.key);
    throw AppError.conflict('DISTRICT_SCOUT_LOCKED', quest ? `Finish "${quest.title}"${quest.giverName ? ` for ${quest.giverName}` : ''} to unlock scouting in ${access.unlock.name}.` : `Complete the required job to unlock scouting in ${access.unlock.name}.`);
  },

  async assertCanProduceProduct(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, productKey: string): Promise<void> {
    const required = (await PermanentUnlockService.lockedProductionRecipes(db, roundPlayerId, ruleset)).get(productKey);
    if (!required) return;
    const quest = PermanentUnlockService.questFor(ruleset, required.key);
    throw AppError.conflict('PRODUCT_RECIPE_LOCKED', quest ? `Finish "${quest.title}"${quest.giverName ? ` for ${quest.giverName}` : ''} to unlock the ${required.name} recipe.` : `Complete the required job to unlock the ${required.name} recipe.`);
  },

  /**
   * The job that grants an unlock, so a locked shelf can say exactly what to do. The first quest
   * in the catalog that pays it wins; null when only a seasonal or admin source grants it.
   */
  questFor(ruleset: Ruleset, unlockKey: string): QuestLinkDto | null {
    const quest = Object.values(ruleset.questDefinitions ?? {}).find((definition) =>
      definition.rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK' && reward.key === unlockKey));
    if (!quest) return null;
    const giver = quest.contactKey ? ruleset.contacts?.[quest.contactKey as keyof typeof ruleset.contacts] : undefined;
    return { key: quest.key, title: quest.title, giverName: giver?.shortName ?? giver?.name ?? null };
  },

  /** The quest behind a weapon rack, for a round where racks open through jobs. */
  weaponQuest(ruleset: Ruleset, weapon: WeaponUnlockKey): { unlock: PermanentUnlockDefinition; quest: QuestLinkDto | null } | null {
    const unlock = Object.values(ruleset.permanentUnlocks ?? {}).find((definition) =>
      definition.effect.kind === 'WEAPON_ACCESS' && definition.effect.weapon === weapon);
    return unlock ? { unlock, quest: PermanentUnlockService.questFor(ruleset, unlock.key) } : null;
  },

  /** 1.5.0-E2. The vehicle classes Charlie will not sell this player yet, with the unlock each needs. */
  async lockedVehicles(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<Map<'SEDAN' | 'VAN', PermanentUnlockDefinition>> {
    const locked = new Map<'SEDAN' | 'VAN', PermanentUnlockDefinition>();
    const gated = Object.values(ruleset.permanentUnlocks ?? {}).filter((definition) => definition.effect.kind === 'VEHICLE_PURCHASE_ACCESS');
    if (!gated.length) return locked;
    const keys = await PermanentUnlockService.keys(db, roundPlayerId);
    for (const definition of gated) {
      if (definition.effect.kind === 'VEHICLE_PURCHASE_ACCESS' && !keys.has(definition.key)) locked.set(definition.effect.classId, definition);
    }
    return locked;
  },

  /** 1.5.0-E2. Refuse a Sedan or Van the player has not unlocked. */
  async assertCanBuyVehicle(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, classId: 'SEDAN' | 'VAN'): Promise<void> {
    const required = (await PermanentUnlockService.lockedVehicles(db, roundPlayerId, ruleset)).get(classId);
    if (!required) return;
    const quest = PermanentUnlockService.questFor(ruleset, required.key);
    throw AppError.conflict('VEHICLE_PURCHASE_LOCKED', quest
      ? `Finish "${quest.title}"${quest.giverName ? ` for ${quest.giverName}` : ''} to unlock ${required.name}.`
      : `Complete the required job to unlock ${required.name}.`);
  },

  /** Refuse buying from Pip a product the player has not unlocked, in any city. */
  async assertCanBuyProduct(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, productKey: string): Promise<void> {
    const required = (await PermanentUnlockService.lockedProducts(db, roundPlayerId, ruleset)).get(productKey);
    if (required) throw AppError.conflict('PRODUCT_PURCHASE_LOCKED', `Complete the required job to unlock ${required.name}.`);
  },
};
