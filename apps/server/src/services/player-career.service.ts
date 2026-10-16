import { Prisma, type PrismaClient } from '@prisma/client';
import type { CareerIdentityDto, CareerIdentityKey } from '@streets/shared';
import { ActivityService } from './activity.service.js';
import { AppError } from '../utils/errors.js';

export const CAREER_SWITCH_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1_000;

export const CAREER_PRESENTATION: Record<CareerIdentityKey, { title: string; contractCategories: string[] }> = {
  ENFORCER: { title: 'Enforcer', contractCategories: ['COMBAT', 'TURF'] },
  SMUGGLER: { title: 'Smuggler', contractCategories: ['TRAVEL', 'SUPPLY'] },
  FIXER: { title: 'Fixer', contractCategories: ['LAW', 'FACTION'] },
  BUSINESS_BOSS: { title: 'Business Boss', contractCategories: ['BUSINESS', 'ECONOMY'] },
  INTELLIGENCE_BROKER: { title: 'Intelligence Broker', contractCategories: ['INTEL', 'COMBAT'] },
};

export const CAREER_KEYS = Object.keys(CAREER_PRESENTATION) as CareerIdentityKey[];

function history(value: Prisma.JsonValue): CareerIdentityDto['history'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const key = 'key' in entry ? entry.key : null;
    const selectedAt = 'selectedAt' in entry ? entry.selectedAt : null;
    return typeof key === 'string' && CAREER_KEYS.includes(key as CareerIdentityKey) && typeof selectedAt === 'string'
      ? [{ key: key as CareerIdentityKey, selectedAt }]
      : [];
  });
}

function dto(row: { career: string; history: Prisma.JsonValue; selectedAt: Date; switchAvailableAt: Date }, now: Date): CareerIdentityDto {
  const key = row.career as CareerIdentityKey;
  return {
    key,
    ...CAREER_PRESENTATION[key],
    selectedAt: row.selectedAt.toISOString(),
    switchAvailableAt: row.switchAvailableAt.toISOString(),
    canSwitch: row.switchAvailableAt <= now,
    history: history(row.history),
  };
}

export const PlayerCareerService = {
  async get(prisma: PrismaClient, accountId: string, now = new Date()): Promise<CareerIdentityDto | null> {
    const row = await prisma.playerCareer.findUnique({ where: { accountId } });
    return row ? dto(row, now) : null;
  },

  async choose(prisma: PrismaClient, input: { accountId: string; roundPlayerId: string; key: CareerIdentityKey }, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.playerCareer.findUnique({ where: { accountId: input.accountId } });
      if (current?.career === input.key) return dto(current, now);
      if (current && current.switchAvailableAt > now) {
        throw AppError.conflict('CAREER_SWITCH_COOLDOWN', `You can change careers after ${current.switchAvailableAt.toISOString()}.`);
      }
      const nextHistory = [
        ...history(current?.history ?? []),
        { key: input.key, selectedAt: now.toISOString() },
      ];
      const row = await tx.playerCareer.upsert({
        where: { accountId: input.accountId },
        create: {
          accountId: input.accountId,
          career: input.key,
          history: nextHistory as Prisma.InputJsonValue,
          selectedAt: now,
          switchAvailableAt: new Date(now.getTime() + CAREER_SWITCH_COOLDOWN_MS),
        },
        update: {
          career: input.key,
          history: nextHistory as Prisma.InputJsonValue,
          selectedAt: now,
          switchAvailableAt: new Date(now.getTime() + CAREER_SWITCH_COOLDOWN_MS),
        },
      });
      await ActivityService.log(tx, input.roundPlayerId, 'CAREER_CHOSEN', { career: input.key, title: CAREER_PRESENTATION[input.key].title });
      return dto(row, now);
    });
  },
};
