import {
  classicOgV06F,
  classicOgV07A,
  classicOgV07B,
  classicOgV07C,
  hideoutV2For,
  hideoutV2Problems,
} from '@streets/rulesets';

function validate(name, ruleset) {
  const problems = hideoutV2Problems(ruleset);
  if (problems.length) {
    console.error(`Hideout ${name} validation failed:`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`Hideout ${name} validation passed.`);
  }
}

validate('0.7.0-A', classicOgV07A);
validate('0.7.0-B', classicOgV07B);
validate('0.7.0-C', classicOgV07C);

if (JSON.stringify(classicOgV07A.hideout) !== JSON.stringify(classicOgV06F.hideout)) {
  console.error('0.7.0-A changed the shipped 0.6 Hideout balance unexpectedly.');
  process.exitCode = 1;
}
if (JSON.stringify(classicOgV07B.hideout) !== JSON.stringify(classicOgV07A.hideout)) {
  console.error('0.7.0-B changed room prices/base buffs instead of layering protected storage.');
  process.exitCode = 1;
}
if (JSON.stringify(classicOgV07C.hideout) !== JSON.stringify(classicOgV07B.hideout)) {
  console.error('0.7.0-C changed room prices/base buffs instead of layering Lookouts security.');
  process.exitCode = 1;
}

const extensionA = hideoutV2For(classicOgV07A);
const extensionB = hideoutV2For(classicOgV07B);
const extensionC = hideoutV2For(classicOgV07C);
if (!extensionA || !extensionB || !extensionC || !classicOgV07B.hideout) {
  console.error('0.7 rules are missing their Hideout v2 extension or base Hideout.');
  process.exitCode = 1;
} else {
  console.log('\nRoom foundation:');
  for (const [key, room] of Object.entries(classicOgV07B.hideout.rooms)) {
    if (!room) continue;
    const v2 = extensionB.rooms[key];
    const totalCostCents = room.costsCents.reduce((sum, value) => sum + value, 0);
    const gateLevels = Object.keys(v2?.requirements ?? {}).join(', ') || 'none';
    const branches = v2?.specialization?.choices.map((choice) => choice.name).join(' / ') ?? 'none';
    console.log(
      `- ${room.name}: ${room.maxLevel} levels, $${(totalCostCents / 100).toLocaleString('en-US')} total, gates: ${gateLevels}, branches: ${branches}`,
    );
  }

  const capacities = extensionB.assetProtection?.protectedProductUnitsBySafeRoomLevel ?? [];
  console.log(`\nSafe Room product caps: ${capacities.join(' / ')} units at levels 0-5.`);
  const maxCapacity = Math.max(...capacities, 0);
  for (const stash of [50, 100, 250, 500, 1_000]) {
    console.log(`- stash ${stash}: ${Math.min(stash, maxCapacity)} protected / ${Math.max(0, stash - maxCapacity)} exposed at max Safe Room`);
  }
  if (maxCapacity > 100 || Math.max(0, 500 - maxCapacity) < 300) {
    console.error('0.7.0-B protects too much product: a wealthy 500-unit stash must remain meaningfully exposed.');
    process.exitCode = 1;
  }

  const security = extensionC.security;
  console.log('\nLookouts security:');
  console.log(`- recon tiers: ${security?.warningTierByLookoutsLevel.join(' / ') ?? 'missing'}`);
  console.log(`- history hours: ${security?.historyHoursByLookoutsLevel.join(' / ') ?? 'missing'}`);
  console.log(`- passive local traffic starts at Lookouts ${security?.localTrafficMinLevel ?? 'missing'}`);
  console.log('- passive traffic remains count-only; paid convoy recon keeps identities, route and value bands.');

  const level4Gate = extensionC.rooms.LOOKOUTS?.requirements?.[4]?.find((gate) => gate.key === 'TURF_BLOCKS_HELD');
  const level5Gate = extensionC.rooms.LOOKOUTS?.requirements?.[5]?.find((gate) => gate.key === 'TURF_BLOCKS_HELD');
  if (level4Gate?.amount !== 1 || level5Gate?.amount !== 3) {
    console.error('0.7.0-C Lookouts turf gates must be 1 block at level 4 and 3 blocks at level 5.');
    process.exitCode = 1;
  }
  if (!security
    || security.localTrafficMinLevel < 2
    || Math.max(...security.historyHoursByLookoutsLevel) > 24
    || security.warningTierByLookoutsLevel[0] !== 'NONE') {
    console.error('0.7.0-C Lookouts reveal too much too early or keep suspicious history too long.');
    process.exitCode = 1;
  }
}
