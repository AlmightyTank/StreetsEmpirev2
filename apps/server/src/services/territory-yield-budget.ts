/** Deterministically take goods first, then cash/tolls, without exceeding the UTC-day value budget. */
export function allocateTerritoryYield(input: {
  goods: Record<string, number>;
  cashCents: number;
  tollCents: number;
  unitValues: Record<string, number>;
  availableValueCents: number;
}): { goods: Record<string, number>; cashCents: number; tollCents: number; valueCents: number } {
  let room = Math.max(0, Math.trunc(input.availableValueCents));
  let valueCents = 0;
  const goods: Record<string, number> = {};
  for (const key of Object.keys(input.goods).sort()) {
    const quantity = Math.max(0, Math.trunc(input.goods[key] ?? 0));
    const unitValue = Math.max(1, Math.trunc(input.unitValues[key] ?? 1));
    const taken = Math.min(quantity, Math.floor(room / unitValue));
    if (taken > 0) {
      goods[key] = taken;
      const value = taken * unitValue;
      valueCents += value;
      room -= value;
    }
  }
  const cashCents = Math.min(Math.max(0, Math.trunc(input.cashCents)), room);
  valueCents += cashCents;
  room -= cashCents;
  const tollCents = Math.min(Math.max(0, Math.trunc(input.tollCents)), room);
  valueCents += tollCents;
  return { goods, cashCents, tollCents, valueCents };
}
