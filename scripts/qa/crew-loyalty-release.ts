/** Deterministic 2.1.0-G anti-farm / no-economic-carryover release gate.
 * Run with npm run qa:crew-release (no DB required). */
import { classicOgV30G, classicOgV30H } from '@streets/rulesets';
import type { Db } from '../../apps/server/src/utils/db.js';
import {
  CREW_LOYALTY_CAP, CREW_LOYALTY_DAILY_CAP, CREW_LOYALTY_WEEKLY_CAP,
  CrewLoyaltyService, crewLoyaltyWindow, crewLoyaltyTier,
} from '../../apps/server/src/services/crew-loyalty.service.js';
import { receiptProblems } from '../../apps/server/src/services/admin-crew-release.service.js';
import { eligibleCrewNicknames } from '../../apps/server/src/services/crew-legends.service.js';

const start = Date.UTC(2026, 9, 5);
const CREW_SIZE = 80;
const DAYS = 28;
const SOURCES = ['JOB_COMPLETED', 'DEFENSE_HELD', 'TRAVEL_COMPLETED', 'DEALER_SHIFT'] as const;
type Receipt = { id: string; memberId: string; source: string; sourceKey: string; points: number; at: Date };
type Person = { loyaltyPoints: number; status: string; resources: number; xp: number };
const crew = new Map<string, Person>(Array.from({ length: CREW_SIZE }, (_, i) => [
  `member-${i}`, { loyaltyPoints: 0, status: 'AVAILABLE', resources: 100_000, xp: 75 },
]));
const receipts: Receipt[] = [];
const db = {
  $queryRaw: async (_sql: TemplateStringsArray, memberId: string) => {
    const row = crew.get(memberId);
    return row ? [{ id: memberId, status: row.status, loyaltyPoints: row.loyaltyPoints }] : [];
  },
  crewLoyaltyEntry: {
    findUnique: async ({ where }: { where: { memberId_sourceKey: { memberId: string; sourceKey: string } } }) => {
      const key = where.memberId_sourceKey;
      return receipts.find((row) => row.memberId === key.memberId && row.sourceKey === key.sourceKey) ?? null;
    },
    aggregate: async ({ where }: { where: { memberId: string; at: { gte: Date; lt: Date } } }) => ({
      _sum: { points: receipts.filter((row) => row.memberId === where.memberId
        && row.at >= where.at.gte && row.at < where.at.lt).reduce((sum, row) => sum + row.points, 0) },
    }),
    create: async ({ data }: { data: Receipt }) => {
      receipts.push({ ...data, id: `receipt-${receipts.length}` });
      return { id: receipts[receipts.length - 1]!.id };
    },
  },
  crewMember: {
    update: async ({ where, data }: { where: { id: string }; data: { loyaltyPoints: { increment: number } } }) => {
      const person = crew.get(where.id)!;
      person.loyaltyPoints += data.loyaltyPoints.increment;
      return person;
    },
  },
  crewMentorBond: { findMany: async () => [] },
} as unknown as Db;

let duplicateAttempts = 0, credited = 0, capped = 0;
for (let day = 0; day < DAYS; day++) {
  for (let member = 0; member < CREW_SIZE; member++) {
    const id = `member-${member}`;
    for (let action = 0; action < 9; action++) {
      const at = new Date(start + day * 86_400_000 + action * 30_000);
      const source = SOURCES[(member + action) % SOURCES.length]!;
      const input = {
        ruleset: classicOgV30H, roundPlayerId: 'player-release', memberId: id, source,
        sourceKey: `GAME_ACTION:${id}:${day}:${action}`,
        summary: 'Server verified completed operation', at,
      };
      const n = await CrewLoyaltyService.award(db, input);
      if (n) credited++;
      else capped++;
      if (action === 3) {
        const duplicate = await CrewLoyaltyService.award(db, input);
        duplicateAttempts++;
        if (duplicate !== 0) throw new Error('Replay minted a second loyalty award.');
      }
    }
  }
}
for (const [id, person] of crew) {
  const own = receipts.filter((r) => r.memberId === id);
  const earned = own.reduce((sum, receipt) => sum + receipt.points, 0);
  if (earned !== person.loyaltyPoints || earned > CREW_LOYALTY_CAP || earned < 0) {
    throw new Error(`Crew ${id} drifted from immutable loyalty receipts.`);
  }
  const anomalies = receiptProblems(own);
  if (anomalies.length) throw new Error(`${id}: ${anomalies.join('; ')}`);
  for (const row of own) {
    const w = crewLoyaltyWindow(row.at);
    const daily = own.filter((r) => r.at >= w.dayStart && r.at < w.nextDay).reduce((x, r) => x + r.points, 0);
    const weekly = own.filter((r) => r.at >= w.weekStart && r.at < w.nextWeek).reduce((x, r) => x + r.points, 0);
    if (daily > CREW_LOYALTY_DAILY_CAP || weekly > CREW_LOYALTY_WEEKLY_CAP) {
      throw new Error(`${id}: daily/weekly cap exceeded by verified settlement.`);
    }
  }
  if (person.resources !== 100_000 || person.xp !== 75) throw new Error('Narrative award altered economic or combat state.');
  if (crewLoyaltyTier(person.loyaltyPoints).tier !== 'Legend') throw new Error('Active crew did not reach capped narrative Legend tier.');
  const earnedNames = eligibleCrewNicknames({ loyaltyPoints: person.loyaltyPoints, receipts: own });
  if (!earnedNames.length) throw new Error('Earned catalog nicknames disappeared.');
}
const before = receipts.length;
const disabled = await CrewLoyaltyService.award(db, {
  ruleset: classicOgV30G, roundPlayerId: 'player-release', memberId: 'member-0',
  source: 'JOB_COMPLETED', sourceKey: 'legacy-round', summary: 'Legacy work', at: new Date(start),
});
if (disabled !== 0 || receipts.length !== before) throw new Error('Pinned pre-loyalty ruleset generated new receipts.');
console.log(`Crew release gate passed: ${CREW_SIZE} careers × ${DAYS} UTC days, ${receipts.length} immutable receipts, ${credited} positive, ${capped} capped, ${duplicateAttempts} replay attempts. No resources/XP changed.`);
