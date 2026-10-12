import { CrewRosterService } from '../../apps/server/src/services/crew-roster.service.js';
import { crewTargets, type CrewCounts, type CrewRefs } from '../../apps/server/src/services/crew-roster-plan.js';
import type { Db } from '../../apps/server/src/utils/db.js';

const counts: CrewCounts = {
  thugs: 40,
  woundedThugs: 3,
  busyThugs: 8,
  postedThugs: 10,
  businessThugs: 4,
  dealerThugs: 2,
  whores: 20,
  businessWhores: 5,
};
const refs: CrewRefs = {
  dealers: [
    { staffId: 'dealer-1', crewId: 'crew-1', experiencePoints: 0 },
    { staffId: 'dealer-2', crewId: 'crew-1', experiencePoints: 0 },
  ],
  businesses: [
    { id: 'business-thugs', role: 'THUG', staff: 4 },
    { id: 'business-workers', role: 'WORKER', staff: 5 },
  ],
  turf: [{ id: 'corner-1', thugs: 10, lookouts: 3, stashGuards: 5 }],
  runners: [{ crewId: 'crew-1', count: 3 }],
  bodyguards: [{ tripId: 'trip-1', count: 2 }],
  escorts: [{ runId: 'run-1', count: 2 }],
};

const targets = crewTargets(counts, refs);
const numberAt = (role: string, status: string, kind?: string) => targets
  .filter((target) => target.role === role && target.status === status && (!kind || target.assignmentKind === kind))
  .reduce((total, target) => total + target.count, 0);
const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

assert(targets.filter((target) => target.role === 'THUG').reduce((sum, target) => sum + target.count, 0) === 44,
  'The active thug roster must include the 40 home thugs and four away travel crew members.');
assert(targets.filter((target) => target.role === 'WORKER').reduce((sum, target) => sum + target.count, 0) === counts.whores,
  'Worker staffing must remain bounded by the whore count.');
assert(numberAt('THUG', 'ASSIGNED', 'RUNNER') === 3 && numberAt('THUG', 'IN_TRANSIT') === 5,
  'Runner assignments must be part of busy thugs, with the remaining five represented as in transit.');
assert(numberAt('THUG', 'ASSIGNED', 'BODYGUARD') === 2 && numberAt('THUG', 'ASSIGNED', 'ESCORT') === 2,
  'Bodyguards and escorts must remain attached to their active trips and runs.');
assert(numberAt('THUG', 'ASSIGNED', 'CORNER_LOOKOUT') === 3 && numberAt('THUG', 'ASSIGNED', 'STASH_GUARD') === 5,
  'Corner specialists must stay within the configured three-lookout and five-guard staffing caps.');

const countTx = (assignmentKind: string, count: number) => ({
  crewMember: {
    count: async (args: { where: { assignmentKind?: string } }) => (
      args.where.assignmentKind === assignmentKind ? count : 0
    ),
  },
}) as unknown as Db;

for (let count = 0; count <= 4; count += 1) {
  const warningMinutes = await CrewRosterService.cornerPushWarningMinutes(countTx('CORNER_LOOKOUT', count), 'player', 'corner');
  assert(warningMinutes === Math.min(count, 3) * 2, `Lookout warning cap failed at ${count} assigned.`);
}
for (let count = 0; count <= 6; count += 1) {
  const reductionPercent = await CrewRosterService.stashGuardLootReductionPercent(countTx('STASH_GUARD', count), 'player', 'corner');
  assert(reductionPercent === Math.min(count, 5) * 5, `Stash protection cap failed at ${count} assigned.`);
}

console.log('Crew staffing balance passed: home/away counts reconcile; runners, lookouts, stash guards, bodyguards and escorts stay bounded; lookouts cap at 6 minutes and stash protection at 25%.');
