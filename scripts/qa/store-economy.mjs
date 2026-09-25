import { classicOgV08H } from '@streets/rulesets';
import {
  productEconomy,
  productLoops,
  restockedItems,
  settleStock,
} from '@streets/rules-engine';

const ruleset = classicOgV08H;
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function maxRelationship(storeKey) {
  const perks = ruleset.storeEconomy?.traderPerks?.[storeKey] ?? [];
  const reached = [...perks].sort((a, b) => a.at - b.at).at(-1);
  return {
    buyDiscountPercent: reached?.buyDiscountPercent ?? 0,
    sellBonusPercent: reached?.sellBonusPercent ?? 0,
  };
}

function adjustedPair(buyCents, sellCents, relationship, pressure = 0) {
  const pressuredBuy = Math.max(1, Math.round(buyCents * (1 + pressure)));
  const pressuredSell = Math.max(0, Math.round(sellCents * (1 + pressure)));
  const boostedSell = Math.min(
    pressuredBuy - 1,
    Math.floor(pressuredSell * (100 + relationship.sellBonusPercent) / 100),
  );
  const discountedBuy = Math.floor(
    pressuredBuy * (100 - relationship.buyDiscountPercent) / 100,
  );
  return {
    buy: Math.max(boostedSell + 1, discountedBuy),
    sell: boostedSell,
  };
}

function checkDirectStoreLoops() {
  for (const [storeKey, store] of Object.entries(ruleset.stores)) {
    const relationship = maxRelationship(storeKey);
    for (const [itemKey, item] of Object.entries(store.items)) {
      if (item.sellCents === null) continue;
      const pair = adjustedPair(item.buyCents, item.sellCents, relationship);
      if (!Number.isSafeInteger(pair.buy) || !Number.isSafeInteger(pair.sell)) {
        fail(`${storeKey}/${itemKey}: adjusted prices are not safe integer cents.`);
      }
      if (pair.sell >= pair.buy) {
        fail(`${storeKey}/${itemKey}: max relationship perk creates a buyback loop (${pair.buy}/${pair.sell}).`);
      }
    }
  }

  const pressureRule = ruleset.storeEconomy?.pipProductPressure;
  if (!pressureRule?.enabled) {
    fail('Pip product pressure is not enabled on the H ruleset.');
    return;
  }

  const pipRelationship = maxRelationship('PIP');
  const samples = 200;
  for (const [key, definition] of Object.entries(ruleset.products ?? {})) {
    const economy = productEconomy(ruleset, key);
    if (!economy?.pip) continue;
    for (let i = 0; i <= samples; i += 1) {
      const pressure = -pressureRule.maxPricePressure
        + (2 * pressureRule.maxPricePressure * i) / samples;
      const pair = adjustedPair(
        economy.pip.buyCents,
        economy.pip.sellCents,
        pipRelationship,
        pressure,
      );
      if (pair.sell >= pair.buy) {
        fail(`PIP/${key}: pressure ${pressure.toFixed(3)} creates a buyback loop (${pair.buy}/${pair.sell}).`);
        break;
      }
    }
    if (economy.production && economy.production.ingredientCentsPerUnit < 0) {
      fail(`${definition.name}: negative production ingredient cost.`);
    }
  }
}

function checkRulesetBounds() {
  const pressure = ruleset.storeEconomy?.pipProductPressure;
  if (!pressure || pressure.maxPricePressure <= 0 || pressure.maxPricePressure > 0.5) {
    fail('Pip price pressure must stay in (0, 0.5].');
  }

  const shipments = ruleset.storeEconomy?.shipments;
  if (!shipments?.enabled) {
    fail('H shipment rules are not enabled.');
  } else {
    const totalChance = shipments.delayChancePercent
      + shipments.partialChancePercent
      + shipments.largeChancePercent;
    if (totalChance > 100) fail(`Shipment outcome chances total ${totalChance}%, above 100%.`);
    if (shipments.partialMultiplier <= 0 || shipments.partialMultiplier >= 1) {
      fail('Partial shipment multiplier must stay between 0 and 1.');
    }
    if (shipments.largeMultiplier <= 1) fail('Large shipment multiplier must stay above 1.');
    if (shipments.delayMinutes < 0) fail('Shipment delay cannot be negative.');
  }

  const special = ruleset.storeEconomy?.specialOrders;
  if (!special?.enabled) {
    fail('H special orders are not enabled.');
  } else {
    const maxTierIndex = Math.max(0, ruleset.reputation.tiers.length - 1);
    const markup = Math.max(
      5,
      special.markupPercent - maxTierIndex * special.standingMarkupDiscountPercentPerTier,
    );
    const turf = ruleset.storeEconomy?.integrations?.maxTurfSpecialOrderDiscountPercent ?? 0;
    const effectiveMarkup = markup * (100 - turf) / 100;
    if (effectiveMarkup < 5) {
      fail(`Best-case special-order markup falls below 5% (${effectiveMarkup.toFixed(2)}%).`);
    }
    if (special.minWaitMinutes < 1 || special.waitMultiplier <= 0 || special.waitMultiplier >= 1) {
      fail('Special-order wait settings must remain positive and faster than normal restock.');
    }
    notes.push(`Best-case special-order fee markup: ${effectiveMarkup.toFixed(2)}%.`);
  }

  const integration = ruleset.storeEconomy?.integrations;
  if (!integration?.enabled) {
    fail('H store integrations are not enabled.');
  } else {
    if (integration.maxTurfSpecialOrderDiscountPercent > 10) {
      fail('Turf special-order discount exceeds the 10% release guardrail.');
    }
    if (integration.travelOpportunityMinProfitPercent < 10) {
      fail('Travel opportunity threshold is below the 10% noise floor.');
    }
  }
}

function checkShipments() {
  const shipmentRules = ruleset.storeEconomy?.shipments;
  if (!shipmentRules?.enabled) return;

  const start = new Date('2026-01-01T00:00:00.000Z');
  const counts = { ON_TIME: 0, DELAYED: 0, PARTIAL: 0, LARGE: 0 };
  let cases = 0;

  for (const [field, { rule }] of restockedItems(ruleset)) {
    let stockAt = start;
    for (let i = 0; i < 250; i += 1) {
      const scheduled = new Date(stockAt.getTime() + rule.intervalMinutes * 60_000);
      const settled = settleStock(
        { [field]: 0, [rule.stockAtField]: stockAt },
        rule,
        scheduled,
        rule.intervalMinutes,
        { rules: shipmentRules, context: `${ruleset.meta.id}:${field}` },
      );

      const shipment = settled.shipment;
      if (settled.stock < 0 || settled.stock > rule.cap || settled.gained < 0) {
        fail(`${field}: shipment settlement left stock outside 0..${rule.cap}.`);
        break;
      }

      if (shipment?.status === 'DELAYED' && settled.stock === 0) {
        counts.DELAYED += 1;
        const arrived = settleStock(
          { [field]: 0, [rule.stockAtField]: stockAt },
          rule,
          shipment.arrivesAt,
          rule.intervalMinutes,
          { rules: shipmentRules, context: `${ruleset.meta.id}:${field}` },
        );
        if (arrived.stock < 1 || arrived.stock > rule.cap) {
          fail(`${field}: delayed shipment did not settle safely at arrival.`);
          break;
        }
        stockAt = arrived.stockAt;
      } else {
        if (shipment) counts[shipment.status] += 1;
        else counts.ON_TIME += 1;
        stockAt = settled.stockAt;
      }
      cases += 1;
    }
  }

  notes.push(
    `Shipment stress: ${cases.toLocaleString('en-US')} settlements; `
    + Object.entries(counts).map(([key, value]) => `${key.toLowerCase()}=${value}`).join(', '),
  );
}

for (const problem of productLoops(ruleset)) fail(`Product economy: ${problem}`);
checkDirectStoreLoops();
checkRulesetBounds();
checkShipments();

console.log(`Store Economy QA — ${ruleset.meta.version}`);
for (const note of notes) console.log(`- ${note}`);

if (failures.length) {
  console.error(`\nStore economy gates failed:\n${failures.map((x) => `- ${x}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('\nStore economy gates passed.');
}
