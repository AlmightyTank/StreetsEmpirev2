import type { PrismaClient } from '@prisma/client';
import { classicOgV24A } from '@streets/rulesets';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { RandomEncounterTrigger, DistrictKey } from '@streets/rulesets';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService } from './admin-audit.service.js';
import { simulateTerritoryEncounter } from './random-encounter.service.js';
import type { Db } from '../utils/db.js';

const TEST_COSMETICS = ['territory-regional-governor', 'territory-national-kingpin', 'territory-national-kingpin-frame'] as const;

function requireBeta(): void {
  if (env.appEnvironment !== 'beta') throw AppError.notFound('NOT_FOUND', 'That page does not exist.');
}

export const AdminTerritoryTesterService = {
  async index(prisma: PrismaClient) {
    requireBeta();
    const accounts = await prisma.account.findMany({ where: { territoryTestAccount: true }, select: { id: true, username: true, territoryTestAccount: true }, orderBy: { usernameNormalized: 'asc' }, take: 100 });
    const pools = Object.fromEntries(Object.entries(classicOgV24A.randomEncounters?.triggers ?? {}).map(([trigger, definition]) => [trigger, definition.entries.filter((entry) => Boolean(entry.territory)).map((entry) => ({ key: entry.key, title: entry.title, territory: entry.territory }))]));
    return { enabled: true as const, accounts, pools };
  },

  async setTestAccount(prisma: PrismaClient, actor: { id: string; username: string }, accountId: string, enabled: boolean, reason: string) {
    requireBeta();
    return prisma.$transaction(async (tx) => {
      const before = await tx.account.findUnique({ where: { id: accountId }, select: { id: true, username: true, territoryTestAccount: true } });
      if (!before) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account does not exist.');
      if (!enabled) {
        const testerRewards = await tx.accountCosmeticUnlock.count({ where: { accountId, sourceQuestKey: { startsWith: 'territory-tester:' } } });
        if (testerRewards > 0) throw AppError.conflict('TEST_REWARDS_REMAIN', 'Revoke tester cosmetics before unmarking this account.');
      }
      const after = await tx.account.update({ where: { id: accountId }, data: { territoryTestAccount: enabled }, select: { id: true, username: true, territoryTestAccount: true } });
      await AdminAuditService.record(tx, actor, { action: 'territory.tester.account', targetType: 'account', targetId: accountId, reason, before, after });
      return after;
    });
  },

  async simulate(prisma: PrismaClient, actor: { id: string; username: string }, roundPlayerId: string, trigger: RandomEncounterTrigger, district: string | undefined, seed: string) {
    requireBeta();
    const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, include: { account: { select: { territoryTestAccount: true } }, round: true } });
    if (!player?.account.territoryTestAccount) throw AppError.forbidden('Territory encounter simulations require a marked test account.');
    const result = { roundPlayerId, trigger, district: district ?? null, seed, ...(await simulateTerritoryEncounter({ tx: prisma as unknown as Db, roundPlayerId, ruleset: loadRulesetForRound(player.round), trigger, district: district as DistrictKey | undefined, now: new Date(), seed })) };
    await AdminAuditService.record(prisma as unknown as Db, actor, { action: 'territory.tester.simulate', targetType: 'round-player', targetId: roundPlayerId, reason: `trigger=${trigger}; seed=${seed}`, after: result });
    return result;
  },

  async grantCosmetic(prisma: PrismaClient, actor: { id: string; username: string }, roundPlayerId: string, key: string, grant: boolean, reason: string) {
    requireBeta();
    const rewardKey = TEST_COSMETICS.find((candidate) => candidate === key);
    if (!rewardKey) throw AppError.badRequest('TEST_REWARD_INVALID', 'Choose a territory tester cosmetic.');
    return prisma.$transaction(async (tx) => {
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { id: true, accountId: true, account: { select: { territoryTestAccount: true, username: true } }, round: { select: { rulesetId: true, rulesetVersion: true } } } });
      if (!player?.account.territoryTestAccount) throw AppError.forbidden('Territory tester rewards can only be granted to marked test accounts.');
      const definition = classicOgV24A.cosmetics?.[rewardKey];
      if (!definition) throw AppError.conflict('TEST_REWARD_MISSING', 'This cosmetic is not in the beta tester catalog.');
      const before = await tx.accountCosmeticUnlock.findUnique({ where: { accountId_key: { accountId: player.accountId, key } } });
      let after = before;
      if (grant) {
        if (before && !before.sourceQuestKey?.startsWith('territory-tester:')) throw AppError.conflict('TEST_REWARD_ALREADY_EARNED', 'This account already owns the permanent reward outside the tester.');
        after = await tx.accountCosmeticUnlock.upsert({
          where: { accountId_key: { accountId: player.accountId, key } },
          create: { accountId: player.accountId, key, kind: definition.kind, title: definition.name, description: definition.description, rarity: definition.rarity, styleKey: 'styleKey' in definition ? definition.styleKey : null, sourceQuestKey: `territory-tester:${reason.slice(0, 120)}`, sourceRulesetId: player.round.rulesetId, sourceRulesetVersion: player.round.rulesetVersion },
          update: {},
        });
      } else if (before?.sourceQuestKey?.startsWith('territory-tester:')) {
        await tx.accountCosmeticUnlock.delete({ where: { accountId_key: { accountId: player.accountId, key } } });
        after = null;
      }
      await AdminAuditService.record(tx, actor, { action: grant ? 'territory.tester.reward.grant' : 'territory.tester.reward.revoke', targetType: 'account-cosmetic', targetId: `${player.accountId}:${key}`, reason, before, after });
      return { accountId: player.accountId, username: player.account.username, key, granted: Boolean(after) };
    });
  },
};
