import type { PrismaClient } from '@prisma/client';
import type { DealerStaffActionResult, DealerStaffAssignInput, DealerStaffReleaseInput } from '@streets/shared';
import { dealerRules } from '@streets/rules-engine';
import { ActionService, fitThugs } from './action.service.js';
import { AppError } from '../utils/errors.js';

function staffDto(row: { id: string; dealerCrewId: string | null; experiencePoints: number; assignedAt: Date; releasedAt: Date | null }) {
  return {
    id: row.id,
    crewId: row.dealerCrewId,
    experiencePoints: row.experiencePoints,
    assignedAt: row.assignedAt.toISOString(),
    releasedAt: row.releasedAt?.toISOString() ?? null,
  };
}

export const DealerStaffService = {
  assign(prisma: PrismaClient, roundPlayerId: string, crewId: string, input: DealerStaffAssignInput) {
    return ActionService.run<DealerStaffActionResult>(prisma, roundPlayerId, {
      action: 'DEALER_STAFF_ASSIGN',
      actionId: input.actionId,
      execute: async ({ tx, current, round, ruleset, now }) => {
        if (!ruleset.supplyNetwork?.enabled) throw AppError.notFound('SUPPLY_DISABLED', 'Dealer assignments are not available in this round.');
        const crew = await tx.dealerCrew.findFirst({ where: { id: crewId, roundPlayerId, status: { in: ['ACTIVE', 'PAUSED'] } } });
        if (!crew) throw AppError.notFound('DEALER_CREW_NOT_FOUND', 'That active dealer crew is not yours.');
        // 1.6.0-E: a crew has room for so many dealers, and each brings what he can hold.
        const rules = dealerRules(ruleset);
        if (rules) {
          const posted = await tx.dealerStaff.count({ where: { dealerCrewId: crew.id, releasedAt: null } });
          if (posted >= rules.maxDealersPerCrew) throw AppError.conflict('DEALER_CREW_FULL', `A crew takes at most ${rules.maxDealersPerCrew} dealers.`);
        }
        const activeCareers = await tx.dealerStaff.count({ where: { roundPlayerId, dealerCrewId: { not: null }, releasedAt: null } });
        if (activeCareers !== current.dealerThugs) {
          throw AppError.conflict('DEALER_STAFF_OUT_OF_SYNC', 'Dealer assignments need an operator review before another thug can be assigned.');
        }
        if (fitThugs(current) < 1) throw AppError.conflict('NO_AVAILABLE_THUGS', 'You have no available thug to assign as a dealer.');

        const staff = input.staffId
          ? await tx.dealerStaff.findFirst({ where: { id: input.staffId, roundPlayerId, dealerCrewId: null, releasedAt: { not: null } } })
          : null;
        if (input.staffId && !staff) {
          throw AppError.conflict('DEALER_CAREER_UNAVAILABLE', 'That dealer career is not released and available to reassign.');
        }
        const assigned = staff
          ? await tx.dealerStaff.update({ where: { id: staff.id }, data: { dealerCrewId: crew.id, assignedAt: now, releasedAt: null } })
          : await tx.dealerStaff.create({ data: { roundPlayerId, dealerCrewId: crew.id, experiencePoints: 0, assignedAt: now } });
        if (rules) await tx.dealerCrew.update({ where: { id: crew.id }, data: { capacityUnits: { increment: rules.unitsPerDealer } } });
        const next = { ...current, dealerThugs: current.dealerThugs + 1 };
        return {
          next,
          result: { staff: staffDto(assigned), dealerThugs: next.dealerThugs, availableThugs: fitThugs(next), replayed: false },
          ledger: [],
        };
      },
    });
  },

  release(prisma: PrismaClient, roundPlayerId: string, staffId: string, input: DealerStaffReleaseInput) {
    return ActionService.run<DealerStaffActionResult>(prisma, roundPlayerId, {
      action: 'DEALER_STAFF_RELEASE',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        if (!ruleset.supplyNetwork?.enabled) throw AppError.notFound('SUPPLY_DISABLED', 'Dealer assignments are not available in this round.');
        const activeCareers = await tx.dealerStaff.count({ where: { roundPlayerId, dealerCrewId: { not: null }, releasedAt: null } });
        if (activeCareers !== current.dealerThugs) {
          throw AppError.conflict('DEALER_STAFF_OUT_OF_SYNC', 'Dealer assignments need an operator review before a thug can be released.');
        }
        const staff = await tx.dealerStaff.findFirst({ where: { id: staffId, roundPlayerId, dealerCrewId: { not: null }, releasedAt: null } });
        if (!staff) throw AppError.notFound('DEALER_STAFF_NOT_FOUND', 'That active dealer career is not yours.');
        // 1.6.0-E: what the crew holds has to fit in the hands that stay.
        const rules = dealerRules(ruleset);
        if (rules && staff.dealerCrewId) {
          const crew = await tx.dealerCrew.findUniqueOrThrow({ where: { id: staff.dealerCrewId }, include: { inventory: true } });
          const inventory = crew.inventory.reduce((sum, row) => sum + row.quantity, 0);
          const capacity = Math.max(0, crew.capacityUnits - rules.unitsPerDealer);
          if (inventory > capacity) throw AppError.conflict('DEALER_CREW_OVERFULL', `The crew would hold more than its dealers can carry. Return ${inventory - capacity} units to storage first.`);
          await tx.dealerCrew.update({ where: { id: crew.id }, data: { capacityUnits: capacity } });
        }
        const released = await tx.dealerStaff.update({ where: { id: staff.id }, data: { dealerCrewId: null, releasedAt: now } });
        const next = { ...current, dealerThugs: current.dealerThugs - 1 };
        return {
          next,
          result: { staff: staffDto(released), dealerThugs: next.dealerThugs, availableThugs: fitThugs(next), replayed: false },
          ledger: [],
        };
      },
    });
  },
};
