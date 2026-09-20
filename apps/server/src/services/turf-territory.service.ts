import type { PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';

type TurfDb = PrismaClient | Db;

export interface CityControl {
  allianceId: string;
  alliance: { name: string; tag: string };
  blocksHeld: number;
  blocksTotal: number;
  share: number;
}

export function controlFromRows(
  ruleset: Ruleset,
  rows: Array<{ holder: { allianceId: string | null; alliance?: { name: string; tag: string } | null } | null }>,
): CityControl | null {
  const territory = ruleset.turf?.territory;
  if (!territory || rows.length === 0) return null;
  const byAlliance = new Map<string, { alliance: { name: string; tag: string }; blocks: number }>();
  for (const row of rows) {
    const allianceId = row.holder?.allianceId;
    const alliance = row.holder?.alliance;
    if (!allianceId || !alliance) continue;
    const current = byAlliance.get(allianceId) ?? { alliance, blocks: 0 };
    current.blocks += 1;
    byAlliance.set(allianceId, current);
  }
  const needed = Math.ceil(rows.length * territory.cityControlShare);
  const winner = [...byAlliance.entries()]
    .map(([allianceId, value]) => ({ allianceId, ...value }))
    .filter((entry) => entry.blocks >= needed)
    .sort((a, b) => b.blocks - a.blocks || a.allianceId.localeCompare(b.allianceId))[0];
  return winner ? {
    allianceId: winner.allianceId,
    alliance: winner.alliance,
    blocksHeld: winner.blocks,
    blocksTotal: rows.length,
    share: winner.blocks / rows.length,
  } : null;
}

export async function territoryControlForCity(
  db: TurfDb,
  roundId: string,
  cityId: string,
  ruleset: Ruleset,
): Promise<CityControl | null> {
  if (!ruleset.turf?.territory) return null;
  const rows = await db.turf.findMany({
    where: { roundId, cityId },
    select: {
      holder: {
        select: {
          allianceId: true,
          alliance: { select: { name: true, tag: true } },
        },
      },
    },
  });
  return controlFromRows(ruleset, rows);
}

export async function recordTerritoryControlChange(
  tx: Db,
  input: {
    roundId: string;
    cityId: string;
    ruleset: Ruleset;
    before: CityControl | null;
    at: Date;
  },
): Promise<void> {
  if (!input.ruleset.turf?.territory) return;
  const after = await territoryControlForCity(tx, input.roundId, input.cityId, input.ruleset);
  if ((input.before?.allianceId ?? null) === (after?.allianceId ?? null)) return;

  await tx.turfControlEvent.create({
    data: {
      roundId: input.roundId,
      cityId: input.cityId,
      previousAllianceId: input.before?.allianceId ?? null,
      previousAllianceName: input.before?.alliance.name ?? null,
      previousAllianceTag: input.before?.alliance.tag ?? null,
      nextAllianceId: after?.allianceId ?? null,
      nextAllianceName: after?.alliance.name ?? null,
      nextAllianceTag: after?.alliance.tag ?? null,
      previousBlocksHeld: input.before?.blocksHeld ?? 0,
      nextBlocksHeld: after?.blocksHeld ?? 0,
      blocksTotal: after?.blocksTotal ?? input.before?.blocksTotal ?? 0,
      happenedAt: input.at,
    },
  });
}
