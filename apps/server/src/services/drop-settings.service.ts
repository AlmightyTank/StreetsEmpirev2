import type { DropSettings, PrismaClient } from '@prisma/client';
import { CROWN_EARN_RULES } from '@streets/rulesets';
import type { AdminDropSettingsDto, DropSwitchesDto } from '@streets/shared';
import { env } from '../config/env.js';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

export const DROP_SETTINGS_ID = 'global';

/** What a fresh install runs on, before an admin saves anything. */
export const DEFAULT_DROP_SETTINGS: Omit<DropSettings, 'id' | 'updatedAt' | 'updatedByUsername'> = {
  storefrontEnabled: true,
  purchasesEnabled: true,
  earningEnabled: true,
  checkoutEnabled: false,
  streetPassSkipsEnabled: true,
  dailyOfferCount: 4,
  dailyResetHourUtc: 0,
  autoFeatured: true,
  roundEarnCap: CROWN_EARN_RULES.roundCap,
  largeAdjustmentThreshold: 1000,
};

export type DropSettingsValues = typeof DEFAULT_DROP_SETTINGS;

export function settingsDto(settings: DropSettingsValues): AdminDropSettingsDto {
  return {
    storefront: settings.storefrontEnabled,
    purchases: settings.purchasesEnabled,
    earning: settings.earningEnabled,
    checkout: settings.checkoutEnabled,
    streetPassSkips: settings.streetPassSkipsEnabled,
    dailyOfferCount: settings.dailyOfferCount,
    dailyResetHourUtc: settings.dailyResetHourUtc,
    autoFeatured: settings.autoFeatured,
    roundEarnCap: settings.roundEarnCap,
    largeAdjustmentThreshold: settings.largeAdjustmentThreshold,
  };
}

/**
 * The switches players see. Each one is off when the whole Drop is off by
 * environment, and checkout is also off until Crown packs are configured.
 */
export function switchesFor(settings: DropSettingsValues): DropSwitchesDto {
  const on = env.drop.enabled;
  return {
    storefront: on && settings.storefrontEnabled,
    purchases: on && settings.storefrontEnabled && settings.purchasesEnabled,
    earning: on && settings.earningEnabled,
    checkout: on && settings.checkoutEnabled && env.drop.crownPacksConfigured,
    streetPassSkips: on && settings.purchasesEnabled && settings.streetPassSkipsEnabled,
  };
}

export const DropSettingsService = {
  async get(db: Db | PrismaClient): Promise<DropSettingsValues> {
    const row = await db.dropSettings.findUnique({ where: { id: DROP_SETTINGS_ID } });
    if (!row) return { ...DEFAULT_DROP_SETTINGS };
    const { id: _id, updatedAt: _updatedAt, updatedByUsername: _by, ...values } = row;
    return values;
  },

  async update(db: Db, patch: Partial<DropSettingsValues>, username: string): Promise<{ before: DropSettingsValues; after: DropSettingsValues }> {
    const before = await DropSettingsService.get(db);
    const after = { ...before, ...patch };
    if (!Number.isInteger(after.dailyOfferCount) || after.dailyOfferCount < 0 || after.dailyOfferCount > 12) {
      throw AppError.badRequest('DROP_SETTINGS_INVALID', 'Daily offers must be between 0 and 12.');
    }
    if (!Number.isInteger(after.dailyResetHourUtc) || after.dailyResetHourUtc < 0 || after.dailyResetHourUtc > 23) {
      throw AppError.badRequest('DROP_SETTINGS_INVALID', 'The daily reset hour must be 0 to 23 UTC.');
    }
    if (!Number.isInteger(after.roundEarnCap) || after.roundEarnCap < 0 || after.roundEarnCap > 5000) {
      throw AppError.badRequest('DROP_SETTINGS_INVALID', 'The round earning cap must be 0 to 5,000 Crowns.');
    }
    if (!Number.isInteger(after.largeAdjustmentThreshold) || after.largeAdjustmentThreshold < 1) {
      throw AppError.badRequest('DROP_SETTINGS_INVALID', 'The second-approval threshold must be at least 1 Crown.');
    }
    await db.dropSettings.upsert({
      where: { id: DROP_SETTINGS_ID },
      create: { id: DROP_SETTINGS_ID, ...after, updatedByUsername: username },
      update: { ...after, updatedByUsername: username },
    });
    return { before, after };
  },
};

/** Refuse a Drop route when the environment switch is off: no partial API on production. */
export function requireDropEnabled(): void {
  if (!env.drop.enabled) throw AppError.notFound('NOT_FOUND', 'Not found.');
}
