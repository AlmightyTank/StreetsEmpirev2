import { classicOgV17A, classicOgV17B, classicOgV17C, classicOgV17D, classicOgV17E } from '@streets/rulesets';
import type { Ruleset } from '@streets/rules-engine';
import { CrewRosterService } from '../../apps/server/src/services/crew-roster.service.js';
import type { Db } from '../../apps/server/src/utils/db.js';

type Path = { label: string; role: 'THUG' | 'WORKER'; specialty: 'ENFORCER' | 'WHEELMAN' | 'SCOUT' | 'SERVICE' };
const paths: Path[] = [
  { label: 'Combat / Enforcer', role: 'THUG', specialty: 'ENFORCER' },
  { label: 'Supply / Wheelman', role: 'THUG', specialty: 'WHEELMAN' },
  { label: 'Scouting / Scout', role: 'WORKER', specialty: 'SCOUT' },
  { label: 'Worker / Service (reserved)', role: 'WORKER', specialty: 'SERVICE' },
];
const scenarios = [
  { label: 'New hire', size: 2, xp: 0 },
  { label: 'Casual small crew', size: 4, xp: 20 },
  { label: 'Active large crew', size: 100, xp: 1_000 },
];

async function bonus(rule: Ruleset, path: Path, size: number, xp: number): Promise<number> {
  const findMany = async () => Array.from({ length: size }, (_, index) => ({ id: `member-${index}`, specialtyExperiencePoints: xp }));
  const tx = { crewMember: { findMany } } as unknown as Db;
  return CrewRosterService.specialtyBonusPercent(tx, 'player', rule, path.role, path.specialty);
}

for (const path of paths) {
  const values = [];
  for (const scenario of scenarios) values.push(await bonus(classicOgV17E, path, scenario.size, scenario.xp));
  const cap = classicOgV17E.crewRoster!.specialtyBonusPercent!.cap!;
  if (values.some((value) => value < 0 || value > cap)) throw new Error(`${path.label} exceeded the ${cap}% ruleset cap: ${values.join(', ')}`);
  const expected = path.specialty === 'SERVICE' ? [0, 0, 0] : [0, 2, cap];
  if (values.some((value, index) => value !== expected[index])) throw new Error(`${path.label} progression did not match ${expected.join('/')} expected: ${values.join(', ')}`);
  console.log(`${path.label}: new ${values[0]}%, casual ${values[1]}%, active ${values[2]}% · crew sizes 2 / 4 / 100 · cap ${cap}%`);
}

// The optimized composition remains capped at the best member's effect, never a sum.
const enforcers = Array.from({ length: 5 }, (_, index) => ({ id: `enforcer-${index}`, specialtyExperiencePoints: index === 4 ? 1_000 : 100 }));
const selectedDb = { crewMember: { findMany: async () => enforcers } } as unknown as Db;
const selected = await CrewRosterService.selectedSpecialtyBonusPercent(selectedDb, 'player', classicOgV17E, 'THUG', 'ENFORCER', enforcers.map((row) => row.id));
if (selected !== 5) throw new Error(`Five veteran enforcers stacked to ${selected}% rather than the 5% maximum.`);

// A and B predate specialties. C and D retain the same capped modifiers as E,
// while team selection remains unavailable until E.
for (const ruleset of [classicOgV17A, classicOgV17B]) {
  const value = await bonus(ruleset, paths[0]!, 100, 1_000);
  if (value !== 0) throw new Error(`${ruleset.meta.id} unexpectedly applies a crew specialty bonus.`);
}
for (const ruleset of [classicOgV17C, classicOgV17D]) {
  const value = await bonus(ruleset, paths[0]!, 100, 1_000);
  if (value !== 5) throw new Error(`${ruleset.meta.id} changed the pinned 5% enforcer cap.`);
}
console.log('Optimized team: five veteran enforcers still apply 5% once; A-B have no specialty effect, C-D retain their pinned caps and lack E team selection.');
