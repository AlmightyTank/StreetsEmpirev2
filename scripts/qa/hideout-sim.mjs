import {
  classicOgV06F,
  classicOgV07A,
  hideoutV2For,
  hideoutV2Problems,
} from '@streets/rulesets';

const problems = hideoutV2Problems(classicOgV07A);
if (problems.length) {
  console.error('Hideout 0.7.0-A validation failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Hideout 0.7.0-A validation passed.');
}

if (JSON.stringify(classicOgV07A.hideout) !== JSON.stringify(classicOgV06F.hideout)) {
  console.error('0.7.0-A changed the shipped 0.6 Hideout balance unexpectedly.');
  process.exitCode = 1;
}

const extension = hideoutV2For(classicOgV07A);
if (!extension || !classicOgV07A.hideout) {
  console.error('0.7.0-A is missing its Hideout v2 extension or base Hideout.');
  process.exitCode = 1;
} else {
  console.log('\nRoom foundation:');
  for (const [key, room] of Object.entries(classicOgV07A.hideout.rooms)) {
    if (!room) continue;
    const v2 = extension.rooms[key];
    const totalCostCents = room.costsCents.reduce((sum, value) => sum + value, 0);
    const gateLevels = Object.keys(v2?.requirements ?? {}).join(', ') || 'none';
    const branches = v2?.specialization?.choices.map((choice) => choice.name).join(' / ') ?? 'none';
    console.log(
      `- ${room.name}: ${room.maxLevel} levels, $${(totalCostCents / 100).toLocaleString('en-US')} total, gates: ${gateLevels}, branches: ${branches}`,
    );
  }
}
