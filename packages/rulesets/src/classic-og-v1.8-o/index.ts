import { classicOgV18N } from '../classic-og-v1.8-n/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { DistrictKey, PermanentUnlockCatalog, QuestDefinitionCatalog, Ruleset } from '../types.js';

/**
 * Quest Access A, live. The Scout and Turf gates have shipped since 1.8.0-F, but no ruleset
 * defined a district unlock, so every district stayed open. A round on this ruleset starts in
 * Wino Slums, Low Rent and the Urban Ghetto; Mama's story jobs open the two upscale districts.
 * Both are on the story path every player walks, so no district stays closed for good.
 *   - Nightclub: Keeping Them Happy (Lesson 3). Night Shift needs it and follows that job.
 *   - Casino: Payday (Lesson 5), once the street is paying its own way.
 * NPC gangs run no quests and are not gated (PermanentUnlockService.districtAccess).
 */
const DISTRICTS = [
  ['NIGHTCLUB', 'Nightclub Access', 'Mama vouches for your crew with the club doors. Scout and hold turf in the Nightclub District for the rest of this round.'],
  ['CASINO', 'Casino Access', 'Mama opens the high-roller corners to your crew. Scout and hold turf in the Casino District for the rest of this round.'],
] as const satisfies readonly (readonly [DistrictKey, string, string])[];

export const districtUnlocks: PermanentUnlockCatalog = Object.fromEntries(DISTRICTS.map(([district, name, description]) => {
  const key = `DISTRICT_${district}_ACCESS`;
  return [key, { key, name, description, category: 'TRAVEL', effect: { kind: 'DISTRICT_ACCESS', districtKey: district } }];
}));

const base: QuestDefinitionCatalog = classicOgV18N.questDefinitions;
const keepingThemHappy = base.KEEPING_THEM_HAPPY!;
const payday = base.PAYDAY!;

const questDefinitions = defineQuestCatalog({
  ...base,
  KEEPING_THEM_HAPPY: {
    ...keepingThemHappy,
    description: `${keepingThemHappy.description} Do it and she will open the Nightclub District to your crew.`,
    rewards: [...keepingThemHappy.rewards, { kind: 'PERMANENT_UNLOCK', key: 'DISTRICT_NIGHTCLUB_ACCESS' }],
  },
  PAYDAY: {
    ...payday,
    description: `${payday.description} Prove it and she will open the Casino District.`,
    rewards: [...payday.rewards, { kind: 'PERMANENT_UNLOCK', key: 'DISTRICT_CASINO_ACCESS' }],
  },
});

/** 1.8.0-O — District access (Quest Access A) on top of 1.8.0-N. */
export const classicOgV18O = {
  ...classicOgV18N,
  meta: {
    ...classicOgV18N.meta,
    id: 'classic-og-v1.8-o',
    version: '1.8.0-O',
    name: 'Classic OG - District Access',
  },
  permanentUnlocks: { ...classicOgV18N.permanentUnlocks, ...districtUnlocks },
  questDefinitions,
} as const satisfies Ruleset;
