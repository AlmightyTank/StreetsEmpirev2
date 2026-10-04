import type { PrismaClient } from '@prisma/client';
import {
  addLawPressure,
  corruptionCostCents,
  lawWantedTier,
  type LawPressureChange,
  type Ruleset,
} from '@streets/rules-engine';
import { lawCorruptionSchema, type GameActionResult, type LawDto } from '@streets/shared';
import type { LawAttentionSource } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';
import { ActionService, type PlayerState } from './action.service.js';
import { NetWorthService } from './net-worth.service.js';
import { HappinessService } from './happiness.service.js';

export interface LawCorruptionResult {
  attention: number;
  costCents: number;
  attentionBefore: number;
  attentionAfter: number;
  evidence: number;
  wantedLevel: number;
  wantedName: string;
}

export function toLawDto(attention: number, evidence: number, netWorthCents: bigint, ruleset: Ruleset): LawDto | null {
  const rules = ruleset.law;
  if (!rules) return null;
  const tier = lawWantedTier(rules, attention);
  return {
    attention,
    evidence,
    maxAttention: rules.maxAttention,
    maxEvidence: rules.investigation.maxEvidence,
    decayPerInterval: rules.decayPerTurnInterval,
    intervalMinutes: ruleset.turns.intervalMinutes,
    wantedLevel: tier.level,
    wantedName: tier.name,
    wantedDescription: tier.description,
    evidenceStartsAt: rules.investigation.evidenceStartsAt,
    warrantStartsAt: rules.investigation.warrantStartsAt,
    informantStartsAt: rules.investigation.informantStartsAt,
    warrantRisk: evidence >= rules.investigation.warrantStartsAt,
    informantRisk: evidence >= rules.investigation.informantStartsAt,
    corruptionCentsPerAttention: Number(corruptionCostCents(1, netWorthCents, rules)),
    corruptionDailyCap: rules.corruption.dailyAttentionCap,
  };
}

export const LawService = {
  apply(
    ruleset: Ruleset,
    state: Pick<PlayerState, 'lawAttention' | 'lawEvidence'>,
    source: LawAttentionSource,
    units: number,
  ): { next: Pick<PlayerState, 'lawAttention' | 'lawEvidence'>; pressure?: LawPressureChange } {
    if (!ruleset.law || units <= 0) return { next: state };
    const pressure = addLawPressure(
      ruleset.law,
      { attention: state.lawAttention, evidence: state.lawEvidence },
      source,
      units,
    );
    return {
      next: { lawAttention: pressure.attentionAfter, lawEvidence: pressure.evidenceAfter },
      pressure,
    };
  },

  async corruption(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown): Promise<GameActionResult<LawCorruptionResult>> {
    const input = lawCorruptionSchema.parse(rawInput);
    return ActionService.run<LawCorruptionResult>(prisma, roundPlayerId, {
      action: 'LAW_CORRUPTION',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset }) => {
        const rules = ruleset.law;
        if (!rules) throw AppError.conflict('LAW_DISABLED', 'The law is not tracking this round.');
        if (current.lawAttention <= 0) throw AppError.badRequest('NO_LAW_ATTENTION', 'Nobody has an active file worth paying off.');
        if (input.attention > current.lawAttention) {
          throw AppError.badRequest('TOO_MUCH_ATTENTION', `You only have ${current.lawAttention} attention to clear.`, { attention: `At most ${current.lawAttention}.` });
        }
        if (input.attention > rules.corruption.dailyAttentionCap) {
          throw AppError.badRequest('CORRUPTION_CAP', `You can only bury ${rules.corruption.dailyAttentionCap} attention at a time.`, { attention: `At most ${rules.corruption.dailyAttentionCap}.` });
        }
        const products = await HappinessService.otherProducts(tx, roundPlayerId, ruleset);
        const costCents = corruptionCostCents(
          input.attention,
          NetWorthService.calculate({ ...current, products }, ruleset),
          rules,
        );
        if (costCents > current.cashCents) {
          throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot cover that envelope.', { attention: 'Not enough cash.' });
        }
        const next = { ...current, cashCents: current.cashCents - costCents, lawAttention: current.lawAttention - input.attention };
        const tier = lawWantedTier(rules, next.lawAttention);
        const result: LawCorruptionResult = {
          attention: input.attention,
          costCents: Number(costCents),
          attentionBefore: current.lawAttention,
          attentionAfter: next.lawAttention,
          evidence: next.lawEvidence,
          wantedLevel: tier.level,
          wantedName: tier.name,
        };
        return {
          next,
          result,
          activity: { type: 'LAW_CORRUPTION', payload: result },
        };
      },
    });
  },
};
