import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';

export interface RecoverySettlement {
  recoveredThugs: number;
  woundedThugs: number;
  nextRecoveryAt: Date | null;
}

export interface RecoveryTreatment {
  treatedThugs: number;
  medicineUsed: number;
  woundedThugs: number;
  nextRecoveryAt: Date | null;
}

type InjuryRow = { id: string; thugs: number; recoverAt: Date };

export function medicineNeededForTreatment(
  thugs: number,
  medicinePerThug: number,
  efficiencyPercent = 0,
): number {
  if (thugs <= 0) return 0;
  const efficiency = Math.max(0, Math.min(50, Math.trunc(efficiencyPercent)));
  return Math.max(1, Math.ceil(thugs * medicinePerThug * (100 - efficiency) / 100));
}

function summarize(rows: readonly InjuryRow[]): Pick<RecoverySettlement, 'woundedThugs' | 'nextRecoveryAt'> {
  return {
    woundedThugs: rows.reduce((sum, row) => sum + row.thugs, 0),
    nextRecoveryAt: rows[0]?.recoverAt ?? null,
  };
}

export const CombatRecoveryService = {
  async settle(tx: Db, roundPlayerId: string, now: Date): Promise<RecoverySettlement> {
    const rows = await tx.combatInjury.findMany({
      where: { roundPlayerId },
      orderBy: [{ recoverAt: 'asc' }, { id: 'asc' }],
      select: { id: true, thugs: true, recoverAt: true },
    });
    const due = rows.filter((row) => row.recoverAt <= now);
    if (due.length) {
      await tx.combatInjury.deleteMany({ where: { id: { in: due.map((row) => row.id) } } });
    }
    const remaining = rows.filter((row) => row.recoverAt > now);
    return {
      recoveredThugs: due.reduce((sum, row) => sum + row.thugs, 0),
      ...summarize(remaining),
    };
  },

  /** `battleId` is null for wounds from a 0.5.0-E convoy fight, which has no battle row. */
  async add(tx: Db, roundPlayerId: string, battleId: string | null, thugs: number, recoverAt: Date): Promise<void> {
    if (thugs <= 0) return;
    await tx.combatInjury.create({ data: { roundPlayerId, battleId, thugs, recoverAt } });
  },

  async treat(
    tx: Db,
    roundPlayerId: string,
    thugs: number,
    medicineAvailable: number,
    medicinePerThug: number,
    efficiencyPercent = 0,
  ): Promise<RecoveryTreatment> {
    if (!Number.isSafeInteger(thugs) || thugs <= 0) {
      throw AppError.badRequest('INVALID_TREATMENT', 'Choose how many wounded thugs to treat.');
    }
    if (medicinePerThug <= 0) throw AppError.conflict('RECOVERY_DISABLED', 'Treatment is not available in this round.');
    const medicineNeeded = medicineNeededForTreatment(thugs, medicinePerThug, efficiencyPercent);
    if (medicineAvailable < medicineNeeded) {
      throw AppError.badRequest('NOT_ENOUGH_MEDICINE', `You need ${medicineNeeded} medicine to treat that many thugs.`);
    }

    const rows = await tx.combatInjury.findMany({
      where: { roundPlayerId },
      orderBy: [{ recoverAt: 'asc' }, { id: 'asc' }],
      select: { id: true, thugs: true, recoverAt: true },
    });
    const wounded = rows.reduce((sum, row) => sum + row.thugs, 0);
    if (wounded <= 0) throw AppError.conflict('NO_WOUNDED_THUGS', 'Nobody needs treatment.');
    if (thugs > wounded) throw AppError.badRequest('INVALID_TREATMENT', `Only ${wounded} wounded thugs need treatment.`);

    let remainingToTreat = thugs;
    const remainingRows: InjuryRow[] = [];
    for (const row of rows) {
      if (remainingToTreat <= 0) {
        remainingRows.push(row);
      } else if (row.thugs <= remainingToTreat) {
        remainingToTreat -= row.thugs;
        await tx.combatInjury.delete({ where: { id: row.id } });
      } else {
        await tx.combatInjury.update({ where: { id: row.id }, data: { thugs: row.thugs - remainingToTreat } });
        remainingRows.push({ ...row, thugs: row.thugs - remainingToTreat });
        remainingToTreat = 0;
      }
    }

    return {
      treatedThugs: thugs,
      medicineUsed: medicineNeeded,
      ...summarize(remainingRows),
    };
  },
};
