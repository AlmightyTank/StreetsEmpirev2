import type { Ruleset } from '@streets/rules-engine';
import type { TerritoryEffectId, TerritoryPerkDefinition } from '@streets/rulesets';
import { territoryCatalogForRuleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import type { CityControl } from './turf-territory.service.js';

export interface TerritoryModifierSource {
  readonly id: string;
  readonly label: string;
  readonly scope: 'district' | 'city' | 'region';
  readonly citySlug?: string;
  readonly district?: string;
  readonly regionKey?: string;
  readonly perk: TerritoryPerkDefinition;
}

export interface TerritoryModifierReceipt {
  readonly effectId: TerritoryEffectId;
  readonly action: string;
  readonly valueBasisPoints: number;
  readonly multiplierBasisPoints: number;
  readonly sources: { id: string; label: string; valueBasisPoints: number }[];
  readonly capBasisPoints: number;
}

/** Resolve one action's eligible sources in stable order and cap each category once. */
export function resolveTerritoryModifiers(sources: readonly TerritoryModifierSource[], action: string): TerritoryModifierReceipt[] {
  const byCategory = new Map<string, TerritoryModifierSource[]>();
  for (const source of sources) {
    if (!source.perk.eligibleActions.includes(action)) continue;
    const category = source.perk.stackingCategory;
    byCategory.set(category, [...(byCategory.get(category) ?? []), source]);
  }

  const receipts: TerritoryModifierReceipt[] = [];
  for (const eligible of byCategory.values()) {
    const ordered = [...eligible].sort((a, b) => a.id.localeCompare(b.id));
    const cap = Math.min(...ordered.map((source) => source.perk.capBasisPoints));
    const requested = ordered.reduce((sum, source) => sum + source.perk.valueBasisPoints, 0);
    const valueBasisPoints = Math.max(-cap, Math.min(cap, requested));
    if (valueBasisPoints === 0) continue;
    const first = ordered[0]!;
    receipts.push({
      effectId: first.perk.effectId,
      action,
      valueBasisPoints,
      multiplierBasisPoints: 10_000 + valueBasisPoints,
      sources: ordered.map((source) => ({ id: source.id, label: source.label, valueBasisPoints: source.perk.valueBasisPoints })),
      capBasisPoints: cap,
    });
  }
  return receipts.sort((a, b) => a.effectId.localeCompare(b.effectId));
}

/** Fixed-point application used for integer economy values; negative ties round toward zero. */
export function applyTerritoryModifier(value: number, receipt: TerritoryModifierReceipt): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Territory modifiers require a non-negative safe integer base.');
  const product = value * receipt.multiplierBasisPoints;
  if (!Number.isSafeInteger(product)) throw new RangeError('Territory modifier result exceeds safe integer precision.');
  return Math.floor(product / 10_000);
}

export type TerritoryAccessDecision =
  | { readonly allowed: true; readonly tollCents: 0 | number; readonly holderAllianceId: string | null }
  | { readonly allowed: false; readonly reason: 'HOLDER_ONLY' | 'TOLL_REQUIRED' | 'ALLIANCE_REQUIRED'; readonly ownerName: string | null; readonly tollCents: number };

export function decideTerritoryAccess(input: {
  accessType: 'holderOnly' | 'toll' | 'allianceAndPacts';
  visitorAllianceId: string | null;
  holderAllianceId: string | null;
  holderName: string | null;
  tollCents?: number;
  tollAvailable?: boolean;
}): TerritoryAccessDecision {
  const owns = Boolean(input.visitorAllianceId && input.holderAllianceId && input.visitorAllianceId === input.holderAllianceId);
  if (owns) return { allowed: true, tollCents: 0, holderAllianceId: input.holderAllianceId };
  if (input.accessType === 'allianceAndPacts') {
    return { allowed: false, reason: 'ALLIANCE_REQUIRED', ownerName: input.holderName, tollCents: 0 };
  }
  if (input.accessType === 'toll' && input.tollAvailable) {
    return { allowed: true, tollCents: Math.max(0, Math.trunc(input.tollCents ?? 0)), holderAllianceId: input.holderAllianceId };
  }
  return {
    allowed: false,
    reason: input.accessType === 'toll' ? 'TOLL_REQUIRED' : 'HOLDER_ONLY',
    ownerName: input.holderName,
    tollCents: input.accessType === 'toll' ? Math.max(0, Math.trunc(input.tollCents ?? 0)) : 0,
  };
}

/** Round-level gate shared by action settlements. Old pinned rounds always resolve to no modifiers. */
export function territoryFeatureEnabled(
  round: { territoryPerksEnabled?: boolean; territoryPerksCatalogVersion?: string | null },
  ruleset: Pick<Ruleset, 'turf' | 'cities' | 'territoryPerks'>,
): boolean {
  return round.territoryPerksEnabled === true
    && round.territoryPerksCatalogVersion === 'territory-perks-v1'
    && ruleset.territoryPerks?.enabled === true
    && Number.isSafeInteger(ruleset.territoryPerks.dailyYieldCapCentsPerMember)
    && ruleset.territoryPerks.dailyYieldCapCentsPerMember > 0
    && ruleset.territoryPerks.catalogVersion === round.territoryPerksCatalogVersion
    && territoryCatalogForRuleset(ruleset) !== null;
}

/** Territory rewards require a unique controller; historical tie-breaking stays untouched. */
export function territoryPerkCityControlFromRows(
  ruleset: Ruleset,
  rows: Array<{ holder: { allianceId: string | null; alliance: { name: string; tag: string } | null } | null }>,
): CityControl | null {
  const share = ruleset.turf?.territory?.cityControlShare;
  if (share === undefined || rows.length === 0) return null;
  const groups = new Map<string, { alliance: { name: string; tag: string }; blocks: number }>();
  for (const row of rows) {
    const id = row.holder?.allianceId;
    const alliance = row.holder?.alliance;
    if (!id || !alliance) continue;
    const current = groups.get(id) ?? { alliance, blocks: 0 };
    current.blocks += 1;
    groups.set(id, current);
  }
  const required = Math.ceil(rows.length * share);
  const winners = [...groups.entries()].filter(([, value]) => value.blocks >= required);
  if (winners.length !== 1) return null;
  const [allianceId, value] = winners[0]!;
  return { allianceId, alliance: value.alliance, blocksHeld: value.blocks, blocksTotal: rows.length, share: value.blocks / rows.length };
}

/** Read current, authoritative district and city ownership for an action settlement. */
export async function territorySourcesForAction(input: {
  tx: Db;
  round: { id: string; territoryPerksEnabled?: boolean; territoryPerksCatalogVersion?: string | null };
  ruleset: Ruleset;
  allianceId: string | null;
  cityId: string;
  citySlug: string;
  district: string;
}): Promise<TerritoryModifierSource[]> {
  if (!input.allianceId || !territoryFeatureEnabled(input.round, input.ruleset)) return [];
  const catalog = territoryCatalogForRuleset(input.ruleset)!;
  const sources: TerritoryModifierSource[] = [];
  const districtPerk = catalog.districts[input.district]?.perk;
  if (districtPerk) {
    const turf = await input.tx.turf.findUnique({
      where: { roundId_cityId_district: { roundId: input.round.id, cityId: input.cityId, district: input.district } },
      select: { holder: { select: { allianceId: true } } },
    });
    if (turf?.holder?.allianceId === input.allianceId) {
      sources.push({ id: `district:${input.citySlug}:${input.district}`, label: `${input.district} district`, scope: 'district', citySlug: input.citySlug, district: input.district, perk: districtPerk });
    }
  }
  const cityPerk = catalog.cities[input.citySlug]?.perk;
  if (cityPerk) {
    const rows = await input.tx.turf.findMany({
      where: { roundId: input.round.id, cityId: input.cityId },
      select: { holder: { select: { allianceId: true, alliance: { select: { name: true, tag: true } } } } },
    });
    const control = territoryPerkCityControlFromRows(input.ruleset, rows);
    if (control?.allianceId === input.allianceId) {
      sources.push({ id: `city:${input.citySlug}`, label: input.ruleset.cities?.[input.citySlug]?.name ?? input.citySlug, scope: 'city', citySlug: input.citySlug, perk: cityPerk });
    }
  }
  const selectedPower = await input.tx.territoryPowerSelection.findUnique({ where: { allianceId: input.allianceId }, select: { regionKey: true } });
  const region = selectedPower ? catalog.regions[selectedPower.regionKey] : null;
  if (selectedPower && region) {
    const regionalCities = await input.tx.city.findMany({
      where: { slug: { in: [...region.citySlugs] } },
      select: { turf: { where: { roundId: input.round.id }, select: { holder: { select: { allianceId: true, alliance: { select: { name: true, tag: true } } } } } } },
    });
    const controlled = regionalCities.filter((city) => territoryPerkCityControlFromRows(input.ruleset, city.turf)?.allianceId === input.allianceId).length;
    const tierIndex = region.tiers.filter((threshold) => controlled >= threshold).length - 1;
    if (tierIndex >= 0) {
      const valueBasisPoints = region.tierValueBasisPoints[tierIndex];
      if (valueBasisPoints !== undefined) sources.push({
        id: `region:${selectedPower.regionKey}`,
        label: `${selectedPower.regionKey.replaceAll('_', ' ')} regional power`,
        scope: 'region',
        regionKey: selectedPower.regionKey,
        perk: { ...region.perk, valueBasisPoints },
      });
    }
  }
  return sources;
}
