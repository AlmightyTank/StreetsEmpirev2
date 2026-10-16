import type { ActivityType, PlayerActivity, Prisma } from '@prisma/client';
import { activeRoundEventTime, CASE_EVIDENCE_ACTIVITY_TYPES, livingStoryCatalogForRuleset } from '@streets/rulesets';
import type { CaseClueKind } from '@streets/rulesets';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';

type TrustedReceipt = Pick<PlayerActivity, 'id' | 'roundPlayerId' | 'type' | 'createdAt'>;
type SnapshotClue = { key: string; label: string; sourceKind: CaseClueKind; eventType: string };
const TYPE_FOR_SOURCE: Readonly<Record<CaseClueKind, ActivityType>> = {
  SCOUT: 'SCOUT', CONTACT: 'INFORMANT_TIP',
  TRAVEL: 'RUN_RETURNED', ENCOUNTER: 'RANDOM_ENCOUNTER_CHOICE',
};
const ALLOWED_SOURCES = Object.keys(TYPE_FOR_SOURCE) as CaseClueKind[];

function planOf(value: Prisma.JsonValue): SnapshotClue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>;
    if (typeof row.key !== 'string' || typeof row.sourceKind !== 'string'
      || !ALLOWED_SOURCES.includes(row.sourceKind as CaseClueKind)) return [];
    const sourceKind = row.sourceKind as CaseClueKind;
    // Slice B stored QUEST_CLAIMED as a placeholder for CONTACT. Never grant
    // evidence for a quest claim; only a real, paid INFORMANT_TIP receipt counts.
    if (row.eventType !== TYPE_FOR_SOURCE[sourceKind]
      && !(sourceKind === 'CONTACT' && row.eventType === 'QUEST_CLAIMED')) return [];
    return [{ key: row.key, label: typeof row.label === 'string' ? row.label : row.key,
      sourceKind, eventType: TYPE_FOR_SOURCE[sourceKind] }];
  });
}

/**
 * Attach at most one clue to at most one active case for a real activity.
 *
 * Runs after ActivityService creates the trusted PlayerActivity row, inside
 * the same action transaction. No client route or background polling exists.
 * Case locks and the unique sourceReceiptId index prevent replay/farming.
 */
export async function recordLivingCaseActivity(db: Db, activity: TrustedReceipt): Promise<number> {
  if (!(CASE_EVIDENCE_ACTIVITY_TYPES as readonly string[]).includes(activity.type)) return 0;
  // Lightweight unit-test substitutes without a round/case store are not an
  // opted-in player. Real transaction clients always supply both delegates.
  if (!db.roundPlayer?.findUnique || !db.criminalCaseFile?.findMany) return 0;
  const owner = await db.roundPlayer.findUnique({
    where: { id: activity.roundPlayerId },
    select: {
      roundId: true,
      round: { select: {
        id: true, status: true, rulesetId: true, rulesetVersion: true,
        pausedAt: true, pausedMinutesTotal: true,
      } },
    },
  });
  if (!owner || owner.round.status !== 'ACTIVE' || owner.round.pausedAt) return 0;
  const ruleset = loadRulesetForRound(owner.round);
  if (!Object.values(livingStoryCatalogForRuleset(ruleset)).some((definition) => definition.enabled)) return 0;
  const logicalNow = activeRoundEventTime(owner.round, activity.createdAt);
  const candidates = await db.criminalCaseFile.findMany({
    where: {
      ownerId: activity.roundPlayerId, roundId: owner.roundId, status: 'ACTIVE',
      acceptedAt: { lte: activity.createdAt }, expiresAtActive: { gt: logicalNow },
    },
    select: { id: true }, orderBy: { acceptedAt: 'asc' }, take: 4,
  });
  if (!candidates.length) return 0;
  for (const candidate of candidates) {
    // Lock each case before looking at evidence. No parent/player locks are
    // acquired after this, and the caller already holds the action's locks.
    const found = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "CriminalCaseFile"
      WHERE id = ${candidate.id} AND "ownerId" = ${activity.roundPlayerId} AND status = 'ACTIVE'
      FOR UPDATE
    `;
    if (!found.length) continue;
    const row = await db.criminalCaseFile.findFirst({
      where: { id: candidate.id, ownerId: activity.roundPlayerId, roundId: owner.roundId },
      include: { evidence: true },
    });
    if (!row || row.status !== 'ACTIVE' || !row.acceptedAt || row.acceptedAt > activity.createdAt
      || row.rulesetId !== owner.round.rulesetId || row.rulesetVersion !== owner.round.rulesetVersion
      || row.expiresAtActive <= logicalNow) continue;
    const plan = planOf(row.cluePlan);
    if (!plan.length) continue;
    const foundKeys = new Set(row.evidence.map((e) => e.clueKey));
    const next = plan.find((clue) => !foundKeys.has(clue.key));
    const correctAction = next?.eventType === activity.type
      || (next?.sourceKind === 'CONTACT' && activity.type === 'COMBAT_RECON');
    if (!next || !correctAction
      || row.evidence.some((e) => e.sourceKind === next.sourceKind || e.sourceReceiptId === activity.id)) continue;
    // Every settled activity ID can support only one case, even if an owner
    // has multiple matching investigations. The DB unique index is final guard.
    const consumed = await db.criminalCaseEvidence.findUnique({
      where: { sourceReceiptId: activity.id }, select: { id: true },
    });
    if (consumed) return 0;
    await db.criminalCaseEvidence.create({
      data: { caseId: row.id, clueKey: next.key, sourceKind: next.sourceKind,
        sourceReceiptId: activity.id, observedAt: activity.createdAt },
    });
    if (foundKeys.size + 1 >= plan.length) {
      await db.criminalCaseFile.update({
        where: { id: row.id }, data: { status: 'SOLVED', solvedAt: activity.createdAt },
      });
    }
    return 1;
  }
  return 0;
}
