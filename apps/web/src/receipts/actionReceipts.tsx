import { Link } from 'react-router-dom';
import type { GameActionResult, ProduceCrackResult, RoundPlayerDto, ScoutResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import type { ResultLine } from '../components/ActionResult.js';
import { heatReceiptLines } from '../components/HeatPanel.js';
import { supplyReceiptLines } from '../components/WorkSupplyPanel.js';

type ProductContext = Pick<RoundPlayerDto, 'products'>;

function productLabel(me: ProductContext): string {
  return me.products ? 'Crack' : 'Product';
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
      label: 'Caught something',
      delta: -result.infected,
    },
    ...(result.treated > 0
      ? [
          {
            label: 'Treated with medicine',
            delta: -result.medicineUsed,
            remaining: after.resources.medicine,
            muted: true,
          },
        ]
      : []),
    ...(result.lostToInfection > 0
      ? [
          {
            label: 'Lost, no medicine',
            delta: -result.lostToInfection,
            remaining: after.resources.whores,
          },
          { label: 'Medicine', value: <Link className="se-golink" to="/game/stores/corner">Corner Store</Link> },
        ]
      : []),
  ];
}

function walkoutLines(result: { whoresLeft: number; thugsLeft: number }, after: GameActionResult<unknown>['after']): ResultLine[] {
  return [
    ...(result.whoresLeft > 0
      ? [
          {
            label: 'Whores walked out',
            delta: -result.whoresLeft,
            remaining: after.resources.whores,
          },
        ]
      : []),
    ...(result.thugsLeft > 0
      ? [
          {
            label: 'Thugs walked out',
            delta: -result.thugsLeft,
            remaining: after.resources.thugs,
          },
        ]
      : []),
  ];
}

function shelfLines(result: {
  crackFound: number;
  productsFound?: Array<{ key: string; name: string; quantity: number }>;
  condomsUsed: number;
  condomsMissing: number;
  crackUsed: number;
  beerUsed: number;
  beerMissing: number;
}, after: GameActionResult<unknown>['after'], me: ProductContext): ResultLine[] {
  const label = productLabel(me);
  const foundLines: ResultLine[] = result.productsFound?.length
    ? result.productsFound.map((found) => ({
        label: `${found.name} found`,
        delta: found.quantity,
        ...(me.products
          ? { remaining: me.products.find((product) => product.key === found.key)?.quantity }
          : found.key === 'CRACK' ? { remaining: after.resources.product } : {}),
      }))
    : result.crackFound > 0
      ? [{
          label: `${label} found`,
          delta: result.crackFound,
          remaining: after.resources.product,
        }]
      : [];

  return [
    ...foundLines,
    {
      label: 'Condoms used',
      delta: -result.condomsUsed,
      remaining: after.resources.condoms,
      muted: true,
    },
    ...(result.condomsMissing > 0
      ? [
          {
            label: 'Worked without condoms',
            value: <>{formatNumber(result.condomsMissing)} short · <Link className="se-golink" to="/game/stores/corner">Corner Store</Link></>,
          },
        ]
      : []),
    {
      label: `${label} used`,
      delta: -result.crackUsed,
      remaining: after.resources.product,
      muted: true,
    },
    {
      label: 'Beer used',
      delta: -result.beerUsed,
      remaining: after.resources.beer,
      muted: true,
    },
    ...(result.beerMissing > 0
      ? [
          {
            label: 'Worked without beer',
            value: <>{formatNumber(result.beerMissing)} short · <Link className="se-golink" to="/game/stores/corner">Corner Store</Link></>,
          },
        ]
      : []),
  ];
}

export function scoutReceiptLines(action: GameActionResult<ScoutResult>, me: ProductContext): ResultLine[] {
  const result = action.result;
  const backOfficeBonusCents = result.hideoutBonusCents ?? 0;

  return [
    { label: 'Turns used', value: formatNumber(result.turnsUsed) },
    ...supplyReceiptLines(result.supply),
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
      ? [
          {
            label: 'Back Office bonus',
            value: `${formatCents(backOfficeBonusCents)} included`,
          },
        ]
      : []),
    {
      label: 'Whores recruited',
      delta: result.whoresRecruited,
      remaining: action.after.resources.whores,
    },
    {
      label: 'Thugs recruited',
      delta: result.thugsRecruited,
      remaining: action.after.resources.thugs,
    },
    ...shelfLines(result, action.after, me),
    ...infectionLines(result, action.after),
    ...walkoutLines(result, action.after),
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

  return [
    ...supplyReceiptLines(result.supply),
    ...supplyReceiptLines(result.cook, 'Cooks: '),
    ...heatReceiptLines(result.heat),
    { label: 'Turns used', value: formatNumber(result.turnsUsed) },
    {
      label: `${result.productName} produced`,
      delta: result.productProduced,
      ...(result.productType === 'CRACK' ? { remaining: action.after.resources.product } : {}),
    },
    ...(workshopBonusProduct > 0
      ? [
          {
            label: 'Workshop bonus',
            value: `${formatNumber(workshopBonusProduct)} included`,
          },
        ]
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
      ? [
          {
            label: 'Back Office bonus',
            value: `${formatCents(backOfficeBonusCents)} included`,
          },
        ]
      : []),
    ...shelfLines(result, action.after, me),
    ...infectionLines(result, action.after),
    ...walkoutLines(result, action.after),
    {
      label: 'Turns remaining',
      value: formatNumber(result.turnsRemaining),
    },
  ];
}
