import { simulateRaid } from '@streets/rules-engine';
import { classicOgV25A } from '@streets/rulesets';
import { planIndividualCombat } from '../../apps/server/src/services/individual-combat.service.ts';

const ruleset = classicOgV25A;
const model = ruleset.combat;
const ammo = ruleset.ammoParts.ammo;
const samples = 10_000;
let seed = 20261021;
function rng() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 0x1_0000_0000;
}
function guns(modelKey, count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${modelKey}-${index}`, roundPlayerId: `player-${modelKey}`, model: modelKey,
    name: overrides.name ?? null, condition: overrides.condition ?? 100, mods: overrides.mods ?? [],
    lookKey: null, origin: {}, stats: {}, status: 'READY', quantity: 1,
    favorite: overrides.favorite ?? false, reserve: false, createdAt: new Date(index), updatedAt: new Date(index),
  }));
}
function dbFor(rows) { return { playerGun: { findMany: async () => rows } }; }
const crew = (thugs) => ({ thugs, thugHappiness: 100, weapons: { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 } });

async function matchup(aRows, dRows, ammoRounds = 1_000_000) {
  let wins = 0;
  for (let trial = 0; trial < samples; trial++) {
    const aPlan = await planIndividualCombat(dbFor(aRows), 'a', crew(model.squadCap), model.squadCap, model,
      ruleset.individualItems, ammo, ammoRounds, 'ATTACKER', rng);
    const dPlan = await planIndividualCombat(dbFor(dRows), 'd', crew(model.squadCap), model.squadCap, model,
      ruleset.individualItems, ammo, ammoRounds, 'DEFENDER', rng);
    const result = simulateRaid({ attacker: aPlan.crew, defender: dPlan.crew,
      attackerBoost: { strength: aPlan.strengthMultiplier, wounds: 1 },
      defenderBoost: { strength: dPlan.strengthMultiplier, wounds: 1 },
      attackingThugs: model.squadCap, attackerTurns: model.turnCost, defenderCashCents: 1_000_000n,
    }, model, rng);
    if (result.winner === 'ATTACKER') wins++;
  }
  return `${(wins / samples * 100).toFixed(2)}% attacker wins`;
}

const stockAks = guns('AK47', model.squadCap);
const lowConditionAks = guns('AK47', model.squadCap, { condition: 35 });
const modifiedAks = guns('AK47', model.squadCap, { mods: [
  { key: 'BARREL', tier: 2 }, { key: 'SCOPE', tier: 2 }, { key: 'EXTENDED_MAG', tier: 2 },
] });
console.log(`# Individual gun combat simulation\n\nRuleset: ${ruleset.meta.version}. Samples per matchup: ${samples}. Seed: 20261021.\n`);
console.log('| Matchup | Result |\n| --- | ---: |');
console.log(`| Stock AK mirror | ${await matchup(stockAks, stockAks)} |`);
console.log(`| Modified AKs into stock AKs | ${await matchup(modifiedAks, stockAks)} |`);
console.log(`| Low-condition AKs into stock AKs | ${await matchup(lowConditionAks, stockAks)} |`);
