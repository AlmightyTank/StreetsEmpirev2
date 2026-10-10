import type { PrismaClient } from '@prisma/client';
import type { CrewTrainingInput } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';

/** 1.7.0-D. Paid training can speed a tier already earned through completed work. */
export const CrewTrainingService = {
  train(prisma: PrismaClient, roundPlayerId: string, input: CrewTrainingInput) {
    return ActionService.run(prisma, roundPlayerId, {
      action: 'CREW_TRAINING', actionId: input.actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        const config = ruleset.crewRoster?.training;
        if (!ruleset.crewRoster?.enabled || !config) throw AppError.conflict('TRAINING_UNAVAILABLE', 'Crew training is not available in this round.');
        const member = await tx.crewMember.findFirst({ where: { id: input.memberId, roundPlayerId } });
        if (!member) throw AppError.notFound('CREW_MEMBER_NOT_FOUND', 'That crew member is not on your roster.');
        if (member.status !== 'AVAILABLE' || member.dealerStaffId || member.specialty === 'GENERALIST' || member.specialty === 'DEALER') {
          throw AppError.conflict('CREW_MEMBER_UNAVAILABLE', 'Only an available member with an earned specialty can train.');
        }
        const nextTier = ruleset.crewRoster.specialtyTierTwoExperience ?? Number.MAX_SAFE_INTEGER;
        if (member.specialtyExperiencePoints >= nextTier) throw AppError.conflict('TRAINING_COMPLETE', 'That member has reached the specialty cap.');
        const trainingCap = Math.floor(member.experiencePoints * config.earnedExperienceRatioPercent / 100);
        const availableTraining = trainingCap - member.trainingExperiencePoints;
        if (availableTraining <= 0) {
          throw AppError.conflict('TRAINING_CAP', 'This member needs more completed work before another training session.');
        }
        if (current.turns < config.turnCost) throw AppError.badRequest('NOT_ENOUGH_TURNS', `Training costs ${config.turnCost} turn.`);
        if (current.cashCents < BigInt(config.cashCostCents)) throw AppError.badRequest('NOT_ENOUGH_CASH', 'You do not have enough cash to pay for training.');
        const points = Math.min(config.experience, availableTraining, nextTier - member.specialtyExperiencePoints);
        await tx.crewMember.update({ where: { id: member.id }, data: { trainingExperiencePoints: { increment: points }, specialtyExperiencePoints: { increment: points } } });
        await tx.crewMemberEvent.create({ data: { memberId: member.id, roundPlayerId, kind: 'TRAINED', summary: `Training · +${points} ${member.specialty.toLowerCase()} XP.`, at: now } });
        return {
          next: { ...current, turns: current.turns - config.turnCost, cashCents: current.cashCents - BigInt(config.cashCostCents) },
          result: { memberId: member.id, specialty: member.specialty, experienceGained: points, specialtyExperiencePoints: member.specialtyExperiencePoints + points, tierTwoExperience: nextTier },
        };
      },
    });
  },
};
