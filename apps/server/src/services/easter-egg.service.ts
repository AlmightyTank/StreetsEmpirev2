import type { PrismaClient } from '@prisma/client';
import {
  ACTIVITY_EXPERIENCE,
  EASTER_EGGS,
  ITEM_COSMETIC_STYLES,
  easterEggDayNear,
  type ClientEasterEggId,
  type EasterEggDefinition,
  type EasterEggId,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { createPlayerActivity } from './in-app-notification.service.js';
import { PlayerExperienceService } from './player-experience.service.js';

/** Stored as the unlock's source, so an audit can tell eggs from quest rewards. */
const SOURCE_RULESET_ID = 'easter-eggs';
const SOURCE_RULESET_VERSION = '1';

interface DiscoverInput {
  accountId: string;
  /** Where the bell notice goes. Without one the title is still granted. */
  roundPlayerId?: string | null;
  id: EasterEggId;
  at?: Date;
}

export interface EasterEggDiscovery {
  egg: EasterEggDefinition;
  /** False when the account already had it: nothing was written. */
  isNew: boolean;
  /** The item style the egg unlocks, if any. */
  collection?: { key: string; label: string };
}

function collectionFor(egg: EasterEggDefinition): { key: string; label: string; description: string } | null {
  if (!egg.collection) return null;
  const style = ITEM_COSMETIC_STYLES.find((candidate) => candidate.key === egg.collection);
  return style ? { key: style.key, label: style.label, description: style.description } : null;
}

export const EasterEggService = {
  /**
   * Grants the egg's title once per account. Safe to call on every qualifying
   * action and inside the action's transaction: a repeat is a no-op.
   */
  async discover(db: Db, input: DiscoverInput): Promise<EasterEggDiscovery> {
    const egg = EASTER_EGGS[input.id];
    const at = input.at ?? new Date();
    const inserted = await db.accountCosmeticUnlock.createMany({
      data: [{
        accountId: input.accountId,
        key: egg.key,
        kind: 'TITLE_BADGE',
        title: egg.title,
        description: egg.description,
        rarity: egg.rarity,
        styleKey: null,
        sourceQuestKey: `EASTER_EGG:${input.id}`,
        sourceRulesetId: SOURCE_RULESET_ID,
        sourceRulesetVersion: SOURCE_RULESET_VERSION,
        awardedAt: at,
      }],
      skipDuplicates: true,
    });
    const isNew = inserted.count > 0;
    if (isNew) {
      await PlayerExperienceService.award(db, {
        accountId: input.accountId, sourceKey: `discovery:${input.id}`, source: 'DISCOVERY', amount: ACTIVITY_EXPERIENCE.discovery, awardedAt: at,
      });
    }
    // Its own row, so an account that found the egg before the style shipped
    // still gets the style the next time it finds the egg.
    const collection = collectionFor(egg);
    if (collection) {
      await db.accountCosmeticUnlock.createMany({
        data: [{
          accountId: input.accountId,
          key: `${egg.key}:${collection.key}`,
          kind: 'ITEM_COLLECTION',
          title: collection.label,
          description: collection.description,
          rarity: egg.rarity,
          styleKey: collection.key,
          sourceQuestKey: `EASTER_EGG:${input.id}`,
          sourceRulesetId: SOURCE_RULESET_ID,
          sourceRulesetVersion: SOURCE_RULESET_VERSION,
          awardedAt: at,
        }],
        skipDuplicates: true,
      });
    }
    if (isNew && input.roundPlayerId) {
      await createPlayerActivity(db, input.roundPlayerId, 'EASTER_EGG_FOUND', {
        key: egg.key,
        title: egg.title,
        description: egg.description,
        rarity: egg.rarity,
        ...(collection ? { collection: collection.label } : {}),
      });
    }
    return { egg, isNew, ...(collection ? { collection: { key: collection.key, label: collection.label } } : {}) };
  },

  /** discover() for a round player, looking up the account. */
  async discoverForPlayer(db: Db, roundPlayerId: string, id: EasterEggId, at?: Date): Promise<EasterEggDiscovery | null> {
    const player = await db.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { accountId: true } });
    if (!player) return null;
    return EasterEggService.discover(db, { accountId: player.accountId, roundPlayerId, id, at });
  },

  /**
   * Eggs the browser reports (the Konami code, the 404 page, the joke days).
   * Date eggs are checked against the server clock, so a changed system date
   * finds nothing.
   */
  async discoverFromClient(prisma: PrismaClient, accountId: string, id: ClientEasterEggId, at = new Date()): Promise<EasterEggDiscovery> {
    if (id === 'APRIL_FOOL' && !easterEggDayNear(at, 'APRIL_FOOLS')) {
      throw AppError.badRequest('EASTER_EGG_NOT_TODAY', 'Nice try. Come back on the first of April.');
    }
    if (id === 'FRIDAY_THE_13TH' && !easterEggDayNear(at, 'FRIDAY_THE_13TH')) {
      throw AppError.badRequest('EASTER_EGG_NOT_TODAY', 'Nice try. Come back on Friday the 13th.');
    }
    if (id === 'GREAT_SCOTT' && !easterEggDayNear(at, 'BACK_TO_THE_FUTURE')) {
      throw AppError.badRequest('EASTER_EGG_NOT_TODAY', 'Wrong year, Doc. Come back on the 21st of October.');
    }
    const player = await prisma.roundPlayer.findFirst({
      where: { accountId, round: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, lastActiveAt: true },
    });
    if (id === 'GREAT_SCOTT' && (!player || !easterEggDayNear(player.lastActiveAt, 'BACK_TO_THE_FUTURE'))) {
      throw AppError.badRequest('EASTER_EGG_NOT_PLAYED', 'Wrong timeline, Doc. The Time Machine paint job only unlocks if you played on the 21st of October.');
    }
    return prisma.$transaction((tx) => EasterEggService.discover(tx, { accountId, roundPlayerId: player?.id ?? null, id, at }));
  },
};
