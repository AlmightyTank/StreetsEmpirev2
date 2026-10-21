import { DEFAULT_RULESET_ID, classicOgV23A, classicOgV24B, classicOgV24C, classicOgV24D, classicOgV24E, classicOgV24F } from '@streets/rulesets';
import { ammoCombatScenarios, combatSimulationRng, simulateRaid } from '@streets/rules-engine';

const samples = Number(process.argv[2] ?? 25_000);
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 1_000_000) throw new Error('Samples must be an integer from 1 to 1,000,000.');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(DEFAULT_RULESET_ID === classicOgV24F.meta.id, `New rounds must use ${classicOgV24F.meta.id}; found ${DEFAULT_RULESET_ID}.`);
check(!('ammoParts' in classicOgV23A), 'Historical rulesets must not acquire ammo/parts behavior.');
check(classicOgV24B.ammoParts?.enabled === false, 'The foundation catalog must remain disabled.');
check(classicOgV24C.ammoParts?.combatEnabled !== true, 'The store-only C ruleset must keep free-firing combat.');
check(classicOgV24D.ammoParts?.combatEnabled === true, 'The combat D ruleset must spend ammunition.');
check(classicOgV24E.ammoParts?.territoryYieldsEnabled !== true, 'Territory ammo/parts must remain off before F.');
check(classicOgV24F.ammoParts?.territoryYieldsEnabled === true && classicOgV24F.ammoParts.lowAmmoNotificationsEnabled === true, 'F must enable territory yields and low-ammo notices.');

let checked = 0;
for (const [scenarioIndex, scenario] of ammoCombatScenarios.entries()) {
  const seed = (20261021 + scenarioIndex) >>> 0;
  for (let i = 0; i < samples; i++) {
    const result = simulateRaid(scenario.input, classicOgV24F.combat, combatSimulationRng(seed + i));
    const ammo = result.ammunition;
    check(!!ammo, `${scenario.name}: ammo result missing.`);
    check(ammo.attackerRoundsSpent >= 0 && ammo.attackerRoundsSpent <= scenario.input.ammo.attackerRounds, `${scenario.name}: attacker overspent its stock.`);
    check(ammo.defenderRoundsSpent >= 0 && ammo.defenderRoundsSpent <= scenario.input.ammo.defenderRounds, `${scenario.name}: defender overspent its stock.`);
    check(ammo.defenderFreeRounds >= 0 && ammo.ammoLootRounds >= 0, `${scenario.name}: invalid free ammo or loot.`);
    check(ammo.attackerRoundsAfter >= 0 && ammo.defenderRoundsAfter >= 0, `${scenario.name}: ammo balance became negative.`);
    check(ammo.attackerRoundsAfter + ammo.defenderRoundsAfter + ammo.attackerRoundsSpent + ammo.defenderRoundsSpent === scenario.input.ammo.attackerRounds + scenario.input.ammo.defenderRounds, `${scenario.name}: ammo conservation failed.`);
    if (scenario.input.ammo.attackerCapRounds !== undefined) check(ammo.attackerRoundsSpent <= scenario.input.ammo.attackerCapRounds, `${scenario.name}: attacker cap was exceeded.`);
    if (scenario.name === 'Empty early mirror') check(result.defender.strength > 0 && ammo.defenderFreeRounds > 0, 'An empty new-player defender lost the guaranteed defense floor.');
    checked++;
  }
}

const sample = ammoCombatScenarios[0];
const repeatA = simulateRaid(sample.input, classicOgV24F.combat, combatSimulationRng(811));
const repeatB = simulateRaid(sample.input, classicOgV24F.combat, combatSimulationRng(811));
check(JSON.stringify(repeatA, (_, value) => typeof value === 'bigint' ? value.toString() : value) === JSON.stringify(repeatB, (_, value) => typeof value === 'bigint' ? value.toString() : value), 'Identical seeds must produce identical combat results.');

console.log([
  `Ammo/parts release checks passed (${samples.toLocaleString()} trials × ${ammoCombatScenarios.length} combat fixtures = ${checked.toLocaleString()} fights).`,
  `Default ruleset: ${DEFAULT_RULESET_ID}.`,
  'Verified: historical ruleset pins, staged feature versions, deterministic outcomes, ammo conservation, inventory floors, attacker caps, and empty-player defense.',
].join('\n'));
