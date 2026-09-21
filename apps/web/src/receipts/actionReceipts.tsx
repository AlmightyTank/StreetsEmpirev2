import { Link } from 'react-router-dom';
import type {
  GameActionResult,
  ProduceCrackResult,
  RoundPlayerDto,
  ScoutResult,
  WorkSupplyPlanDto,
} from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import type { ResultLine } from '../components/ActionResult.js';
import { heatReceiptLines } from '../components/HeatPanel.js';
import { supplyReceiptLines } from '../components/WorkSupplyPanel.js';

type ProductContext = Pick<RoundPlayerDto, 'products'>;

interface ProductMovement {
  key: string;
  name: string;
  found: number;
  produced: number;
  used: number;
}

function productLabel(me: ProductContext): string {
  return me.products ? 'Crack' : 'Product';
}

function productName(me: ProductContext, key: string, fallback?: string): string {
  return me.products?.find((product) => product.key === key)?.name
    ?? fallback
    ?? (key === 'CRACK' ? productLabel(me) : key);
}

function movement(map: Map<string, ProductMovement>, key: string, name: string): ProductMovement {
  const existing = map.get(key);
  if (existing) return existing;
  const next = { key, name, found: 0, produced: 0, used: 0 };
  map.set(key, next);
  return next;
}

function addConsumed(
  map: Map<string, ProductMovement>,
  plan: WorkSupplyPlanDto | undefined,
  me: ProductContext,
): void {
  if (!plan) return;
  for (const [key, units] of Object.entries(plan.consumed)) {
    if (units <= 0) continue;
    movement(map, key, productName(me, key)).used += units;
  }
}

function productMovementLines(
  map: Map<string, ProductMovement>,
  after: GameActionResult<unknown>['after'],
  me: ProductContext,
): ResultLine[] {
  return [...map.values()]
    .filter((row) => row.found > 0 || row.produced > 0 || row.used > 0)
    .map((row) => {
      const parts = [
        row.produced > 0 ? `+${formatNumber(row.produced)} produced` : null,
        row.found > 0 ? `+${formatNumber(row.found)} found` : null,
        row.used > 0 ? `−${formatNumber(row.used)} used` : null,
      ].filter((part): part is string => Boolean(part));
      const remaining = me.products
        ? me.products.find((product) => product.key === row.key)?.quantity
        : row.key === 'CRACK'
          ? after.resources.product
          : undefined;
      return {
        label: row.name,
        detail: parts.join(' · '),
        delta: row.produced + row.found - row.used,
        ...(remaining !== undefined ? { remaining } : {}),
      };
    });
}

function scoutProductLines(
  result: ScoutResult,
  after: GameActionResult<unknown>['after'],
  me: ProductContext,
): ResultLine[] {
  const map = new Map<string, ProductMovement>();
  if (result.productsFound) {
    for (const found of result.productsFound) {
      movement(map, found.key, productName(me, found.key, found.name)).found += found.quantity;
    }
  } else if (result.crackFound > 0) {
    movement(map, 'CRACK', productLabel(me)).found += result.crackFound;
  }

  if (result.supply) addConsumed(map, result.supply, me);
  else if (result.crackUsed > 0) movement(map, 'CRACK', productLabel(me)).used += result.crackUsed;

  return productMovementLines(map, after, me);
}

function produceProductLines(
  result: ProduceCrackResult,
  after: GameActionResult<unknown>['after'],
  me: ProductContext,
): ResultLine[] {
  const map = new Map<string, ProductMovement>();
  const producedKey = me.products ? result.productType : 'CRACK';
  const producedName = me.products ? result.productName : productLabel(me);
  if (result.productProduced > 0) {
    movement(map, producedKey, productName(me, producedKey, producedName)).produced += result.productProduced;
  }

  if (result.productsFound) {
    for (const found of result.productsFound) {
      movement(map, found.key, productName(me, found.key, found.name)).found += found.quantity;
    }
  } else if (result.crackFound > 0) {
    movement(map, 'CRACK', productLabel(me)).found += result.crackFound;
  }

  if (result.supply || result.cook) {
    addConsumed(map, result.supply, me);
    addConsumed(map, result.cook, me);
  } else if (result.crackUsed > 0) {
    movement(map, 'CRACK', productLabel(me)).used += result.crackUsed;
  }

  return productMovementLines(map, after, me);
}

function crewMovementLine(
  label: string,
  remaining: number,
  joined = 0,
  walked = 0,
  infectionLoss = 0,
): ResultLine | null {
  if (joined <= 0 && walked <= 0 && infectionLoss <= 0) return null;
  const parts = [
    joined > 0 ? `+${formatNumber(joined)} recruited` : null,
    walked > 0 ? `−${formatNumber(walked)} walked` : null,
    infectionLoss > 0 ? `−${formatNumber(infectionLoss)} infection` : null,
  ].filter((part): part is string => Boolean(part));
  return {
    label,
    detail: parts.join(' · '),
    delta: joined - walked - infectionLoss,
    remaining,
  };
}

function infectionLines(result: {
  infected: number;
  treated: number;
  medicineUsed: number;
  lostToInfection: number;
}, after: GameActionResult<unknown>['after']): ResultLine[] {
  if (result.infected <= 0) return [];
  return [
    {
      label: 'Infections',
      value: [
        `${formatNumber(result.infected)} caught`,
        result.treated > 0 ? `${formatNumber(result.treated)} treated` : null,
        result.lostToInfection > 0 ? `${formatNumber(result.lostToInfection)} lost` : null,
      ].filter(Boolean).join(' · '),
    },
    ...(result.medicineUsed > 0
      ? [{
          label: 'Medicine',
          detail: 'treatment',
          delta: -result.medicineUsed,
          remaining: after.resources.medicine,
          muted: true,
        }]
      : []),
    ...(result.lostToInfection > 0
      ? [{ label: 'Medicine restock', value: <Link className="se-golink" to="/game/stores/corner">Corner Store</Link> }]
      : []),
  ];
}

function basicSupplyLines(result: {
  condomsUsed: number;
  condomsMissing: number;
  beerUsed: number;
  beerMissing: number;
}, after: GameActionResult<unknown>['after']): ResultLine[] {
  return [
    ...(result.condomsUsed > 0
      ? [{
          label: 'Condoms',
          detail: 'used',
          delta: -result.condomsUsed,
          remaining: after.resources.condoms,
          muted: true,
        }]
      : []),
    ...(result.condomsMissing > 0
      ? [{
          label: 'Worked without condoms',
          value: <>{formatNumber(result.condomsMissing)} short · <Link className="se-golink" to="/game/stores/corner">Corner Store</Link></>,
        }]
      : []),
    ...(result.beerUsed > 0
      ? [{
          label: 'Beer',
          detail: 'used',
          delta: -result.beerUsed,
          remaining: after.resources.beer,
          muted: true,
        }]
      : []),
    ...(result.beerMissing > 0
      ? [{
          label: 'Worked without beer',
          value: <>{formatNumber(result.beerMissing)} short · <Link className="se-golink" to="/game/stores/corner">Corner Store</Link></>,
        }]
      : []),
  ];
}

export function scoutReceiptLines(action: GameActionResult<ScoutResult>, me: ProductContext): ResultLine[] {
  const result = action.result;
  const backOfficeBonusCents = result.hideoutBonusCents ?? 0;
  const whores = crewMovementLine(
    'Whores',
    action.after.resources.whores,
    result.whoresRecruited,
    result.whoresLeft,
    result.lostToInfection,
  );
  const thugs = crewMovementLine(
    'Thugs',
    action.after.resources.thugs,
    result.thugsRecruited,
    result.thugsLeft,
  );

  return [
    { label: 'Turns used', value: formatNumber(result.turnsUsed) },
    ...supplyReceiptLines(result.supply, '', false),
    ...heatReceiptLines(result.heat),
    {
      label: 'Brought in',
      value: formatCents(result.grossEarnedCents),
    },
    {
      label: `Their cut (${result.payoutPercent}%)`,
      delta: -result.crewTakeCents,
      money: true,
      muted: true,
    },
    ...(result.turf?.holdBonusCents
      ? [{ label: 'Home turf bonus', value: `${formatCents(result.turf.holdBonusCents)} included` }]
      : []),
    ...(result.turf?.taxPaidCents
      ? [{ label: `Street tax${result.turf.holder ? ` · ${result.turf.holder.displayName}` : ''}`, delta: -result.turf.taxPaidCents, money: true }]
      : []),
    ...(result.turf?.controlledCityExempt
      ? [{ label: 'Street tax', value: 'Alliance controls this city · no tax', muted: true }]
      : []),
    ...(result.turf?.linked
      ? [{ label: 'Street tax', value: 'Linked crew · no tax', muted: true }]
      : []),
    {
      label: 'Your cut',
      delta: result.cashEarnedCents,
      money: true,
      remaining: action.after.cashCents,
    },
    ...(backOfficeBonusCents > 0
      ? [{
          label: 'Back Office bonus',
          value: `${formatCents(backOfficeBonusCents)} included`,
        }]
      : []),
    ...(whores ? [whores] : []),
    ...(thugs ? [thugs] : []),
    ...scoutProductLines(result, action.after, me),
    ...basicSupplyLines(result, action.after),
    ...infectionLines(result, action.after),
    {
      label: 'Armed street cover',
      value: `${formatNumber(result.armedThugs)} armed / ${formatNumber(result.unarmedThugs)} unarmed`,
    },
    {
      label: 'Turns remaining',
      value: formatNumber(result.turnsRemaining),
    },
  ];
}

export function produceReceiptLines(action: GameActionResult<ProduceCrackResult>, me: ProductContext): ResultLine[] {
  const result = action.result;
  const workshopBonusProduct = result.hideoutBonusProduct ?? result.hideoutBonusCrack ?? 0;
  const backOfficeBonusCents = result.hideoutBonusCents ?? 0;
  const whores = crewMovementLine(
    'Whores',
    action.after.resources.whores,
    0,
    result.whoresLeft,
    result.lostToInfection,
  );
  const thugs = crewMovementLine('Thugs', action.after.resources.thugs, 0, result.thugsLeft);

  return [
    ...supplyReceiptLines(result.supply, '', false),
    ...supplyReceiptLines(result.cook, 'Cooks: ', false),
    ...heatReceiptLines(result.heat),
    { label: 'Turns used', value: formatNumber(result.turnsUsed) },
    ...produceProductLines(result, action.after, me),
    ...(workshopBonusProduct > 0
      ? [{
          label: 'Workshop bonus',
          value: `${formatNumber(workshopBonusProduct)} included in production`,
        }]
      : []),
    {
      label: 'Ingredients',
      delta: -result.ingredientCents,
      money: true,
      remaining: action.before.cashCents - result.ingredientCents,
    },
    ...(result.limitedByCash
      ? [{ label: 'Short on cash', value: 'batch cut down', muted: true }]
      : []),
    {
      label: 'Brought in',
      value: formatCents(result.grossEarnedCents),
    },
    {
      label: `Their cut (${result.payoutPercent}%)`,
      delta: -result.crewTakeCents,
      money: true,
      muted: true,
    },
    {
      label: 'Your cut',
      delta: result.cashEarnedCents,
      money: true,
      remaining: action.before.cashCents - result.ingredientCents + result.cashEarnedCents,
    },
    ...(backOfficeBonusCents > 0
      ? [{
          label: 'Back Office bonus',
          value: `${formatCents(backOfficeBonusCents)} included`,
        }]
      : []),
    ...(whores ? [whores] : []),
    ...(thugs ? [thugs] : []),
    ...basicSupplyLines(result, action.after),
    ...infectionLines(result, action.after),
    {
      label: 'Turns remaining',
      value: formatNumber(result.turnsRemaining),
    },
  ];
}
