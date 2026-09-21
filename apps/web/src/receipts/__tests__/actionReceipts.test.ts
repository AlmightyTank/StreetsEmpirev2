import { describe, expect, it } from 'vitest';
import type {
  GameActionResult,
  PlayerSnapshot,
  ProduceCrackResult,
  ScoutResult,
  WorkSupplyPlanDto,
} from '@streets/shared';
import { produceReceiptLines, scoutReceiptLines } from '../actionReceipts.js';

const products = [
  { key: 'CRACK', name: 'Crack', quantity: 115 },
  { key: 'ECSTASY', name: 'Ecstasy', quantity: 40 },
  { key: 'COCAINE', name: 'Cocaine', quantity: 30 },
  { key: 'METH', name: 'Meth', quantity: 20 },
];

const resources = {
  cashCents: 1_000_000,
  whores: 10,
  thugs: 8,
  fitThugs: 8,
  woundedThugs: 0,
  postedThugs: 0,
  armedThugs: 6,
  unarmedThugs: 2,
  condoms: 50,
  medicine: 7,
  product: 120,
  crack: 120,
  beer: 30,
  pistols: 6,
  shotguns: 0,
  tek9s: 0,
  ak47s: 0,
  lowRiders: 0,
};

const before: PlayerSnapshot = {
  cashCents: 1_000_000,
  netWorthCents: 2_000_000,
  turns: 144,
  whoreHappiness: 70,
  thugHappiness: 80,
  resources,
};

const after: PlayerSnapshot = {
  cashCents: 1_003_000,
  netWorthCents: 2_010_000,
  turns: 100,
  whoreHappiness: 68,
  thugHappiness: 77,
  resources: {
    ...resources,
    cashCents: 1_003_000,
    whores: 12,
    thugs: 9,
    condoms: 42,
    medicine: 5,
    product: 115,
    crack: 115,
    beer: 25,
  },
};

const supply: WorkSupplyPlanDto = {
  job: 'CASINO',
  role: 'hoes',
  policy: { primary: 'ECSTASY', fallback: 'CRACK', emergency: null, strict: false },
  need: 10,
  perTurn: 1,
  takeMultiplier: 0.9,
  recruitmentMultiplier: 1.2,
  departureMultiplier: 0.8,
  morale: 0,
  woundMultiplier: 1,
  heat: 6,
  switchesAtTurn: 4,
  consumed: { ECSTASY: 4, CRACK: 3 },
  slices: [
    { product: 'ECSTASY', productName: 'Ecstasy', state: 'supplied', units: 4, share: 0.4, turns: 4, takeMultiplier: 1.1, recruitmentMultiplier: 1.4, departureMultiplier: 0.6, morale: 0, heat: 4, woundMultiplier: 1 },
    { product: 'CRACK', productName: 'Crack', state: 'substituted', units: 3, share: 0.3, turns: 3, takeMultiplier: 1, recruitmentMultiplier: 1, departureMultiplier: 1, morale: 0, heat: 2, woundMultiplier: 1 },
    { product: null, productName: null, state: 'dry', units: 3, share: 0.3, turns: 3, takeMultiplier: 0.6, recruitmentMultiplier: 1, departureMultiplier: 1.5, morale: 0, heat: 0, woundMultiplier: 1 },
  ],
};

const cook: WorkSupplyPlanDto = {
  ...supply,
  job: 'COOK',
  role: 'thugs',
  need: 8,
  perTurn: 0.8,
  takeMultiplier: 1.3,
  recruitmentMultiplier: 1,
  departureMultiplier: 0.5,
  morale: 20,
  heat: 3,
  consumed: { COCAINE: 8 },
  slices: [
    { product: 'COCAINE', productName: 'Cocaine', state: 'supplied', units: 8, share: 1, turns: 10, takeMultiplier: 1.3, recruitmentMultiplier: 1, departureMultiplier: 0.5, morale: 20, heat: 3, woundMultiplier: 1 },
  ],
};

const heat = {
  before: 80,
  added: 12,
  after: 52,
  max: 100,
  takeMultiplier: 0.75,
  bustChance: 0.25,
  busted: false,
  arrested: true,
  arrestChance: 0.15,
  lockedUntil: '2026-09-20T12:00:00.000Z',
  seized: { CRACK: 5, ECSTASY: 2 },
  fineCents: 12_500,
};

function action<T>(result: T): GameActionResult<T> {
  return {
    success: true,
    action: 'TEST',
    before,
    after,
    changes: [],
    result,
  };
}

function byLabel<T extends { label: string }>(rows: T[], label: string): T {
  const found = rows.find((row) => row.label === label);
  if (!found) throw new Error(`Missing receipt row: ${label}`);
  return found;
}

describe('action receipt lines', () => {
  it('groups scouting changes by the actual resource and includes heat losses', () => {
    const result: ScoutResult = {
      district: { key: 'CASINO', slug: 'casino', name: 'Casino District', protectionWhoresPerThug: 4, coveredWhores: 24, exposedFraction: 0, armedThugs: 6, unarmedThugs: 2, requiresArmedThugs: true },
      supply,
      heat,
      whoresRecruited: 4,
      thugsRecruited: 2,
      grossEarnedCents: 9_000,
      crewTakeCents: 4_500,
      cashEarnedCents: 4_500,
      hideoutBonusCents: 500,
      payoutPercent: 50,
      crackFound: 7,
      productsFound: [
        { key: 'CRACK', name: 'Crack', quantity: 7 },
        { key: 'ECSTASY', name: 'Ecstasy', quantity: 1 },
      ],
      condomsUsed: 8,
      crackUsed: 3,
      beerUsed: 5,
      condomsMissing: 2,
      beerMissing: 3,
      whoresLeft: 1,
      thugsLeft: 1,
      infected: 3,
      treated: 2,
      medicineUsed: 2,
      lostToInfection: 1,
      exposedFraction: 0,
      coveredWhores: 24,
      armedThugs: 6,
      unarmedThugs: 2,
      turnsUsed: 44,
      turnsRemaining: 100,
    };

    const rows = scoutReceiptLines(action(result), { products });

    expect(rows.map((row) => row.label)).toEqual([
      'Turns used',
      'Supply',
      'Supply effects',
      'Restock',
      'Heat',
      'Heat drag',
      'ARRESTED',
      'Locked up',
      'Cash',
      'Whores',
      'Thugs',
      'Crack',
      'Ecstasy',
      'Condoms',
      'Worked without condoms',
      'Beer',
      'Worked without beer',
      'Infections',
      'Medicine',
      'Medicine restock',
      'Armed street cover',
      'Turns remaining',
    ]);

    expect(byLabel(rows, 'Cash')).toMatchObject({
      delta: 3_000,
      remaining: 1_003_000,
      money: true,
    });
    expect(byLabel(rows, 'Whores')).toMatchObject({ delta: 2, remaining: 12 });
    expect(byLabel(rows, 'Thugs')).toMatchObject({ delta: 1, remaining: 9 });
    expect(byLabel(rows, 'Crack')).toMatchObject({
      detail: '+7 found · −3 used · −5 seized',
      delta: -1,
      remaining: 115,
    });
    expect(byLabel(rows, 'Ecstasy')).toMatchObject({
      detail: '+1 found · −4 used · −2 seized',
      delta: -5,
      remaining: 40,
    });
    expect(rows.some((row) => row.label === 'Seized' || row.label === 'Fine')).toBe(false);
  });

  it('combines production, finds, both supply plans, and seizures by product', () => {
    const result: ProduceCrackResult = {
      supply,
      cook,
      heat,
      productType: 'METH',
      productName: 'Meth',
      productProduced: 12,
      hideoutBonusProduct: 2,
      crackProduced: 0,
      ingredientCents: 6_000,
      limitedByCash: true,
      grossEarnedCents: 5_000,
      crewTakeCents: 2_500,
      cashEarnedCents: 2_500,
      hideoutBonusCents: 250,
      payoutPercent: 50,
      crackFound: 3,
      productsFound: [
        { key: 'METH', name: 'Meth', quantity: 2 },
        { key: 'CRACK', name: 'Crack', quantity: 3 },
      ],
      condomsUsed: 8,
      crackUsed: 3,
      beerUsed: 5,
      condomsMissing: 2,
      beerMissing: 3,
      whoresLeft: 1,
      thugsLeft: 1,
      infected: 3,
      treated: 2,
      medicineUsed: 2,
      lostToInfection: 1,
      turnsUsed: 44,
      turnsRemaining: 100,
    };

    const rows = produceReceiptLines(action(result), { products });

    expect(rows.map((row) => row.label)).toEqual([
      'Supply',
      'Supply effects',
      'Restock',
      'Cooks: Supply',
      'Cooks: Supply effects',
      'Heat',
      'Heat drag',
      'ARRESTED',
      'Locked up',
      'Turns used',
      'Meth',
      'Crack',
      'Ecstasy',
      'Cocaine',
      'Workshop bonus',
      'Cash',
      'Short on cash',
      'Whores',
      'Thugs',
      'Condoms',
      'Worked without condoms',
      'Beer',
      'Worked without beer',
      'Infections',
      'Medicine',
      'Medicine restock',
      'Turns remaining',
    ]);

    expect(byLabel(rows, 'Meth')).toMatchObject({
      detail: '+12 produced · +2 found',
      delta: 14,
      remaining: 20,
    });
    expect(byLabel(rows, 'Crack')).toMatchObject({
      detail: '+3 found · −3 used · −5 seized',
      delta: -5,
      remaining: 115,
    });
    expect(byLabel(rows, 'Ecstasy')).toMatchObject({
      detail: '−4 used · −2 seized',
      delta: -6,
      remaining: 40,
    });
    expect(byLabel(rows, 'Cocaine')).toMatchObject({
      detail: '−8 used',
      delta: -8,
      remaining: 30,
    });
    expect(rows.filter((row) => row.label === 'Meth')).toHaveLength(1);
    expect(rows.some((row) => /^(Meth|Crack|Ecstasy|Cocaine) (used|found)$/.test(row.label))).toBe(false);
  });
});
