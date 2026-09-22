import {
  classicOgV06F,
  classicOgV07A,
  classicOgV07B,
  classicOgV07C,
  classicOgV07D,
  classicOgV07E,
  classicOgV07F,
  classicOgV07G,
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
validate('0.7.0-D', classicOgV07D);
validate('0.7.0-E', classicOgV07E);
validate('0.7.0-F', classicOgV07F);
validate('0.7.0-G', classicOgV07G);

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
if (JSON.stringify(classicOgV07D.hideout) !== JSON.stringify(classicOgV07C.hideout)) {
  console.error('0.7.0-D changed room prices/base buffs instead of layering Workshop/Garage tuning.');
  process.exitCode = 1;
}
if (JSON.stringify(classicOgV07E.hideout) !== JSON.stringify(classicOgV07D.hideout)) {
  console.error('0.7.0-E changed room prices/base buffs instead of layering Back Office ledger visibility.');
  process.exitCode = 1;
}
if (JSON.stringify(classicOgV07F.hideout) !== JSON.stringify(classicOgV07E.hideout)) {
  console.error('0.7.0-F changed room prices/base buffs instead of layering Armory/Infirmary support.');
  process.exitCode = 1;
}
if (JSON.stringify(classicOgV07G.hideout) !== JSON.stringify(classicOgV07F.hideout)) {
  console.error('0.7.0-G changed room prices/base buffs instead of layering specializations.');
  process.exitCode = 1;
}

const extensionA = hideoutV2For(classicOgV07A);
const extensionB = hideoutV2For(classicOgV07B);
const extensionC = hideoutV2For(classicOgV07C);
const extensionD = hideoutV2For(classicOgV07D);
const extensionE = hideoutV2For(classicOgV07E);
const extensionF = hideoutV2For(classicOgV07F);
const extensionG = hideoutV2For(classicOgV07G);
if (!extensionA || !extensionB || !extensionC || !extensionD || !extensionE || !extensionF || !extensionG || !classicOgV07B.hideout) {
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

  const workshop = extensionD.workshop;
  const garage = extensionD.garage;
  console.log('\nWorkshop & Garage:');
  console.log(`- output bonus: ${workshop?.outputBonusPercentByWorkshopLevel.join(' / ') ?? 'missing'}%`);
  console.log(`- ingredient efficiency: ${workshop?.ingredientEfficiencyPercentByWorkshopLevel.join(' / ') ?? 'missing'}%`);
  console.log(`- Garage run limit: ${garage?.runLimitByGarageLevel.join(' / ') ?? 'missing'}`);
  console.log(`- relocation discount: ${garage?.relocationFeeDiscountPercentByGarageLevel.join(' / ') ?? 'missing'}%`);
  console.log('- travel-time reduction: none');

  const garageGate = extensionD.rooms.GARAGE?.requirements?.[1]?.find((gate) => gate.key === 'LOW_RIDERS');
  if (garageGate?.amount !== 2) {
    console.error('0.7.0-D Garage must require two Low-Riders before construction.');
    process.exitCode = 1;
  }
  if (!workshop
    || Math.max(...workshop.outputBonusPercentByWorkshopLevel) > 15
    || Math.max(...workshop.ingredientEfficiencyPercentByWorkshopLevel) > 8) {
    console.error('0.7.0-D Workshop bonuses exceed the release guardrail.');
    process.exitCode = 1;
  }
  if (!garage
    || Math.max(...garage.runLimitByGarageLevel) > 2
    || Math.max(...garage.relocationFeeDiscountPercentByGarageLevel) > 5) {
    console.error('0.7.0-D Garage logistics exceed the release guardrail.');
    process.exitCode = 1;
  }

  const ledger = extensionE.ledger;
  console.log('\nBack Office ledger:');
  console.log(`- itemized history: ${ledger?.historyDaysByBackOfficeLevel.join(' / ') ?? 'missing'} days`);
  console.log(`- row limits: ${ledger?.rowLimitByBackOfficeLevel.join(' / ') ?? 'missing'}`);
  console.log('- rolling summaries: 1 / 7 / 30 days');
  if (!ledger
    || Math.max(...ledger.historyDaysByBackOfficeLevel) > 60
    || Math.max(...ledger.rowLimitByBackOfficeLevel) > 100
    || ledger.specializationHooks.connectionsTakeBonusPercent > 2) {
    console.error('0.7.0-E Back Office ledger exceeds the release guardrail.');
    process.exitCode = 1;
  }

  const armory = extensionF.armory;
  const infirmary = extensionF.infirmary;
  console.log('\nArmory & Infirmary:');
  console.log(`- weapon priorities: ${armory?.weaponPriorities.join(' / ') ?? 'missing'}`);
  console.log(`- medicine efficiency: ${infirmary?.medicineEfficiencyPercentByWorkshopLevel.join(' / ') ?? 'missing'}%`);
  if (!armory
    || armory.weaponPriorities.join(',') !== 'POWER,CONSERVE'
    || !infirmary
    || Math.max(...infirmary.medicineEfficiencyPercentByWorkshopLevel) > 15) {
    console.error('0.7.0-F Armory/Infirmary settings exceed the release guardrail.');
    process.exitCode = 1;
  }

  const specializations = extensionG.specializationEffects;
  const gSecurity = extensionG.security;
  const gLedger = extensionG.ledger;
  const baseMaxProduct = Math.max(...(extensionG.assetProtection?.protectedProductUnitsBySafeRoomLevel ?? [0]));
  const maxProtectedProduct = baseMaxProduct + (specializations?.safeRoom.vaultProtectedProductUnits ?? 0);
  const maxDefensePercent =
    5 * (classicOgV07G.hideout?.buffs.lookoutsDefenseBonusPercentPerLevel ?? 0)
    + (specializations?.safeRoom.panicRoomDefenseBonusPercent ?? 0)
    + (gSecurity?.specializationHooks.armedWatchDefenseBonusPercent ?? 0);
  const maxOutputPercent =
    Math.max(...(extensionG.workshop?.outputBonusPercentByWorkshopLevel ?? [0]))
    + (specializations?.workshop.drugLabOutputBonusPercent ?? 0);
  const maxRelocationDiscount =
    Math.max(...(extensionG.garage?.relocationFeeDiscountPercentByGarageLevel ?? [0]))
    + (specializations?.workshop.garageRelocationDiscountPercent ?? 0);

  console.log('\nSpecializations & final guardrails:');
  console.log(`- max protected product: ${maxProtectedProduct} / 500 (at least ${500 - maxProtectedProduct} remains exposed)`);
  console.log(`- max home-defense bonus: ${maxDefensePercent}%`);
  console.log(`- max Workshop output bonus: ${maxOutputPercent}%`);
  console.log(`- max relocation discount: ${maxRelocationDiscount}%`);
  console.log(`- Street Eyes history: +${gSecurity?.specializationHooks.streetEyesWarningHoursBonus ?? 0}h`);
  console.log(`- Bookkeeping history: +${gLedger?.specializationHooks.bookkeepingHistoryDaysBonus ?? 0}d`);
  console.log('- branch respec: none during the season');

  if (!specializations
    || specializations.safeRoom.vaultProtectedCashCents > 250_000
    || specializations.safeRoom.vaultProtectedProductUnits > 50
    || specializations.safeRoom.panicRoomDefenseBonusPercent > 5
    || specializations.workshop.drugLabOutputBonusPercent > 5
    || specializations.workshop.garageRelocationDiscountPercent > 5
    || (gSecurity?.specializationHooks.streetEyesWarningHoursBonus ?? 0) > 12
    || (gSecurity?.specializationHooks.armedWatchDefenseBonusPercent ?? 0) > 5
    || (gLedger?.specializationHooks.bookkeepingHistoryDaysBonus ?? 0) > 30
    || (gLedger?.specializationHooks.connectionsTakeBonusPercent ?? 0) > 2
    || maxProtectedProduct > 150
    || 500 - maxProtectedProduct < 300
    || maxDefensePercent > 20
    || maxOutputPercent > 20
    || maxRelocationDiscount > 10
    || Math.max(...(extensionG.garage?.runLimitByGarageLevel ?? [1])) > 2) {
    console.error('0.7.0-G specialization balance exceeds the release guardrail.');
    process.exitCode = 1;
  }
}
