import {
  isItemRewardField,
  type ContactKey,
  type FactionKey,
  type QuestRewardDefinition,
  type QuestObjectiveDefinition,
  type QuestProgressMap,
  type Ruleset,
} from '@streets/rulesets';
import { formatCentsExact, type QuestRewardDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';
import type { PlayerState } from './action.service.js';
import { FavorInventoryService } from './favor-inventory.service.js';
import { PermanentUnlockService } from './permanent-unlock.service.js';
import { CRACK, ProductInventoryService } from './product-inventory.service.js';
import { QuestCosmeticService } from './quest-cosmetic.service.js';
import { CrownWalletService } from './crown-wallet.service.js';
import { DROP_ITEMS } from '@streets/rulesets';

/**
 * Paying out rewards, shared by Jobs and the Street Pass so both grant and
 * label a reward the same way.
 */

const CONTACT_MAX = 1000;

/** Each independently completed optional quest objective raises eligible numeric rewards by 10%. */
export const BONUS_OBJECTIVE_REWARD_PERCENT = 10;

export function completedBonusObjectiveCount(
  objectives: readonly QuestObjectiveDefinition[],
  progress: QuestProgressMap,
): number {
  return objectives.filter((objective) => progress[objective.id]?.completed === true).length;
}

const BONUS_SCALABLE_REWARD_KINDS = new Set<QuestRewardDefinition['kind']>([
  'CASH', 'TURNS', 'ITEM', 'PRODUCT', 'CONTACT_REP', 'FACTION_STANDING',
]);

/**
 * Scale only stackable numeric payouts. Permanent unlocks, one-off cosmetics,
 * weapon access and favor grants must never be multiplied by bonus objectives.
 */
export function bumpRewardsForCompletedBonuses(
  rewards: readonly QuestRewardDefinition[],
  completedBonuses: number,
): QuestRewardDefinition[] {
  const count = Number.isSafeInteger(completedBonuses) && completedBonuses > 0 ? completedBonuses : 0;
  if (!count) return [...rewards];
  const scale = 100 + count * BONUS_OBJECTIVE_REWARD_PERCENT;
  return rewards.map((reward) => {
    if (!BONUS_SCALABLE_REWARD_KINDS.has(reward.kind)
        || reward.amount === undefined
        || !Number.isSafeInteger(reward.amount)
        || reward.amount <= 0) return reward;
    return { ...reward, amount: Math.floor((reward.amount * scale) / 100) };
  });
}

export async function addContactRep(db: Db, roundPlayerId: string, contact: string, amount: number): Promise<number> {
  const current = await db.playerReputation.findUnique({
    where: { roundPlayerId_trader: { roundPlayerId, trader: contact } },
    select: { points: true },
  });
  const points = Math.min(CONTACT_MAX, Math.max(0, (current?.points ?? 0) + amount));
  await db.playerReputation.upsert({
    where: { roundPlayerId_trader: { roundPlayerId, trader: contact } },
    create: { roundPlayerId, trader: contact, points },
    update: { points },
  });
  return points;
}

/**
 * Rewards that only change the player's own columns. Everything here lands in
 * `next`, which the action writes back once, so nothing is overwritten.
 */
export function applyStateReward(next: PlayerState, reward: QuestRewardDefinition): void {
  const amount = reward.amount ?? 0;
  if (reward.kind === 'CASH') {
    next.cashCents += BigInt(amount);
    return;
  }
  if (reward.kind === 'TURNS') {
    next.turns += amount;
    return;
  }
  if (reward.kind === 'ITEM') {
    if (!isItemRewardField(reward.key)) throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid item reward.');
    next[reward.key] += amount;
    return;
  }
  if (reward.kind === 'WEAPON_ACCESS') {
    if (reward.key === 'SHOTGUN') next.shotgunUnlocked = true;
    else if (reward.key === 'TEK9') next.tek9Unlocked = true;
    else if (reward.key === 'AK47') next.ak47Unlocked = true;
    else throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid weapon reward.');
  }
}

export interface RewardGrantContext {
  tx: Db;
  roundPlayerId: string;
  accountId: string;
  ruleset: Ruleset;
  now: Date;
  /** What paid this out, recorded on favors, unlocks and cosmetics: a quest key or a pass tier. */
  sourceKey: string;
}

/**
 * Pay every reward. The caller holds the player's row lock and writes `next`
 * back afterwards. Crack lives on the player row, so a crack product reward
 * goes through `next` like the other columns; other products live in their
 * own rows and are written here.
 */
export async function grantRewards(
  ctx: RewardGrantContext,
  next: PlayerState,
  rewards: readonly QuestRewardDefinition[],
): Promise<void> {
  const { tx, roundPlayerId, accountId, ruleset, now, sourceKey } = ctx;
  const productChanges: Record<string, number> = {};
  for (const reward of rewards) {
    if (reward.kind === 'CROWNS') {
      const amount = reward.amount;
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
        throw AppError.conflict('QUEST_REWARD_INVALID', 'That reward has an invalid Crown amount.');
      }
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { roundId: true } });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player no longer exists.');
      await CrownWalletService.apply(tx, {
        accountId,
        kind: 'EARN',
        delta: amount,
        source: 'street-pass',
        externalRef: `earn:street-pass:${roundPlayerId}:${sourceKey}`,
        roundId: player.roundId,
        reason: `Street Pass reward · ${sourceKey}`,
      });
    } else if (reward.kind === 'CONTACT_REP') {
      if (!reward.key || !ruleset.contacts?.[reward.key as ContactKey]) {
        throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid contact reward.');
      }
      await addContactRep(tx, roundPlayerId, reward.key, reward.amount ?? 0);
    } else if (reward.kind === 'PERMANENT_UNLOCK') {
      if (!reward.key) throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid permanent unlock reward.');
      const unlock = await PermanentUnlockService.award(tx, roundPlayerId, ruleset, reward.key, sourceKey, now);
      if (unlock.effect.kind === 'WEAPON_ACCESS') {
        if (unlock.effect.weapon === 'SHOTGUN') next.shotgunUnlocked = true;
        else if (unlock.effect.weapon === 'TEK9') next.tek9Unlocked = true;
        else if (unlock.effect.weapon === 'AK47') next.ak47Unlocked = true;
      }
    } else if (reward.kind === 'FAVOR_ITEM') {
      if (!reward.key) throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid favor reward.');
      await FavorInventoryService.grant(tx, roundPlayerId, ruleset, reward.key, reward.amount ?? 0, sourceKey);
    } else if (reward.kind === 'COSMETIC_UNLOCK') {
      if (!reward.key) throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid cosmetic reward.');
      await QuestCosmeticService.award(tx, ctx.accountId, ruleset, reward.key, sourceKey, now);
    } else if (reward.kind === 'FACTION_STANDING') {
      // 1.4.0-B: the Job claim pays standing itself, with a receipt (FactionService).
    } else if (reward.kind === 'PRODUCT') {
      const amount = reward.amount ?? 0;
      if (!reward.key || !Number.isSafeInteger(amount) || amount <= 0) {
        throw AppError.conflict('QUEST_REWARD_INVALID', 'That reward has an invalid product.');
      }
      if (reward.key === CRACK) next.crack += amount;
      else productChanges[reward.key] = (productChanges[reward.key] ?? 0) + amount;
    } else {
      applyStateReward(next, reward);
    }
  }
  if (Object.keys(productChanges).length) {
    await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, productChanges);
  }
}

function contactFor(ruleset: Ruleset, key: string | null | undefined) {
  if (!key || !ruleset.contacts || !(key in ruleset.contacts)) return undefined;
  return ruleset.contacts[key as ContactKey];
}

/** Item rewards read as the column name, except hoes, which the game calls hoes. */
const ITEM_LABELS: Readonly<Record<string, string>> = { whores: 'hoes' };

export function rewardLabel(reward: QuestRewardDefinition, ruleset: Ruleset): string {
  const amount = reward.amount ?? 0;
  switch (reward.kind) {
    case 'CASH':
      return formatCentsExact(amount);
    case 'CROWNS':
      return `${amount.toLocaleString('en-US')} Crowns`;
    case 'TURNS':
      return `${amount.toLocaleString('en-US')} turns`;
    case 'ITEM': {
      const key = reward.key ?? 'item';
      return `${amount.toLocaleString('en-US')} ${ITEM_LABELS[key] ?? key}`;
    }
    case 'PRODUCT':
      return `${amount.toLocaleString('en-US')} ${(ruleset.products?.[reward.key ?? '']?.name ?? reward.key ?? 'product').toLowerCase()}`;
    case 'CONTACT_REP':
      return `+${amount} ${contactFor(ruleset, reward.key)?.shortName ?? reward.key ?? 'contact'} reputation`;
    case 'WEAPON_ACCESS':
      return `${reward.key ?? 'weapon'} purchasing access`;
    case 'PERMANENT_UNLOCK':
      return `${ruleset.permanentUnlocks?.[reward.key ?? '']?.name ?? reward.key ?? 'Permanent unlock'} unlocked`;
    case 'FAVOR_ITEM': {
      const favor = ruleset.favors?.[reward.key ?? ''];
      const name = favor?.name ?? reward.key ?? 'Favor';
      const prefix = favor?.rarity === 'LEGENDARY' ? '★ Legendary · ' : '';
      return `${prefix}${name} ×${amount.toLocaleString('en-US')}`;
    }
    case 'FACTION_STANDING':
      return `+${amount} ${ruleset.factions?.[reward.key as FactionKey]?.name ?? reward.key ?? 'faction'} standing`;
    case 'COSMETIC_UNLOCK': {
      if (reward.key === 'round-roll-call-cheap-drop-crate') return 'Random cheap Drop cosmetic crate';
      if (reward.key && DROP_ITEMS[reward.key]) return DROP_ITEMS[reward.key]!.name;
      const cosmetic = ruleset.cosmetics?.[reward.key ?? ''];
      return `Permanent cosmetic · ${cosmetic?.name ?? reward.key ?? 'Cosmetic'}`;
    }
  }
}

export function rewardDto(reward: QuestRewardDefinition, ruleset: Ruleset): QuestRewardDto {
  return {
    kind: reward.kind,
    key: reward.key ?? null,
    amount: reward.amount ?? null,
    label: rewardLabel(reward, ruleset),
  };
}
