import type { PrismaClient } from '@prisma/client';
import { validatePayoutPercent } from '@streets/rules-engine';
import type { GameActionResult, PayoutResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';

export interface PayoutChangeInput {
  percent: number;
  actionId?: string;
}

export const PayoutService = {
  /**
   * Section 31. Costs no turns, but whore happiness is recalculated the
   * moment it lands - which is the whole point of the control.
   */
  setPayout(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: PayoutChangeInput,
  ): Promise<GameActionResult<PayoutResult>> {
    return ActionService.run<PayoutResult>(prisma, roundPlayerId, {
      action: 'PAYOUT_CHANGE',
      actionId: input.actionId,

      execute: ({ current, ruleset }) => {
        const validation = validatePayoutPercent(input.percent, ruleset);
        if (!validation.ok) {
          throw AppError.badRequest('INVALID_PAYOUT', validation.message, {
            percent: validation.message,
          });
        }

        if (validation.percent === current.payoutPercent) {
          throw AppError.badRequest(
            'PAYOUT_UNCHANGED',
            `Your payout is already ${current.payoutPercent}%.`,
          );
        }

        return {
          next: { ...current, payoutPercent: validation.percent },
          result: { before: current.payoutPercent, after: validation.percent },
          activity: {
            type: 'PAYOUT_CHANGE',
            payload: { before: current.payoutPercent, after: validation.percent },
          },
        };
      },
    });
  },
};
