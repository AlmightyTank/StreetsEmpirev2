import type { Ruleset } from './types.js';

/** Stable effect identifiers are consumed by the server resolver, never by client math. */
export type TerritoryEffectId =
  | 'district.production.output'
  | 'district.store.proceeds'
  | 'district.travel.expense'
  | 'district.defense.rating'
  | 'city.turf.defense'
  | 'city.production.efficiency'
  | 'city.casino.xp'
  | 'city.business.income'
  | 'city.store.profit'
  | 'city.scout.supplies'
  | 'city.player.xp'
  | 'city.contact.reputation'
  | 'region.production.efficiency'
  | 'region.business.profit'
  | 'region.contact.reputation'
  | 'region.travel.expense'
  | 'region.scout.rewards'
  | 'region.turf.reinforcement'
  | 'region.trade.income'
  | 'region.turf.defense';

export type TerritoryEffectScope = 'district' | 'city' | 'region';
export type TerritoryStackingCategory = 'production' | 'store' | 'travel' | 'defense' | 'business' | 'scout' | 'xp' | 'reputation' | 'reinforcement' | 'trade';

export interface TerritoryPerkDefinition {
  readonly key: string;
  readonly effectId: TerritoryEffectId;
  readonly valueBasisPoints: number;
  readonly scope: TerritoryEffectScope;
  readonly stackingCategory: TerritoryStackingCategory;
  readonly localizationKey: string;
  readonly eligibleActions: readonly string[];
  readonly capBasisPoints: number;
}

export interface TerritoryAccessDefinition {
  readonly key: string;
  readonly accessType: 'holderOnly' | 'toll' | 'allianceAndPacts';
  readonly localizationKey: string;
  readonly tollCentsPerUse?: number;
  readonly dailyTollCapCents?: number;
  /** 2.4.0-F. Optional in-kind access tolls, paid into the holder's territory cache. */
  readonly tollAmmoPerUse?: number;
  readonly dailyTollCapAmmo?: number;
  readonly tollVehiclePartsPerUse?: number;
  readonly dailyTollCapVehicleParts?: number;
}

export interface TerritoryLocationDefinition {
  readonly access: TerritoryAccessDefinition;
  readonly perk?: TerritoryPerkDefinition;
  readonly yieldProfileKey: string;
}

export interface TerritoryCatalog {
  readonly version: string;
  readonly districts: Readonly<Record<string, TerritoryLocationDefinition>>;
  readonly cities: Readonly<Record<string, TerritoryLocationDefinition>>;
  readonly regions: Readonly<Record<string, { readonly citySlugs: readonly string[]; readonly tiers: readonly number[]; readonly tierValueBasisPoints: readonly number[]; readonly perk: TerritoryPerkDefinition }>>;
  readonly yieldProfiles: Readonly<Record<string, TerritoryYieldProfile>>;
}

export interface TerritoryYieldProfile {
  readonly goodsPerHour: Readonly<Record<string, number>>;
  readonly cashCentsPerHour: number;
  readonly cacheHours: number;
  readonly perAdditionalHoldingBasisPoints: number;
  /** Share of an uncollected cache retained by a new controller after a successful flip. */
  readonly ownershipChangeTransferBasisPoints?: number;
}

const perk = (
  key: string,
  effectId: TerritoryEffectId,
  valueBasisPoints: number,
  scope: TerritoryEffectScope,
  stackingCategory: TerritoryStackingCategory,
  eligibleActions: readonly string[],
  capBasisPoints = 1200,
): TerritoryPerkDefinition => ({
  key, effectId, valueBasisPoints, scope, stackingCategory, eligibleActions,
  localizationKey: `territory.perk.${key}`, capBasisPoints,
});

/** Proposal catalog only. A ruleset opts into this version explicitly before rewards can apply. */
export const TERRITORY_PERKS_CATALOG_VERSION = 'territory-perks-v1';

export const TERRITORY_PERKS_CATALOG: TerritoryCatalog = {
  version: TERRITORY_PERKS_CATALOG_VERSION,
  districts: {
    CASINO: { access: { key: 'high-limit-lounge', accessType: 'toll', localizationKey: 'territory.access.highLimitLounge', tollCentsPerUse: 100, dailyTollCapCents: 1000 }, yieldProfileKey: 'casino-goods', perk: perk('high-limit-district', 'district.store.proceeds', 300, 'district', 'store', ['STORE_BUY', 'STORE_SELL']) },
    WINO_SLUMS: { access: { key: 'safehouse', accessType: 'holderOnly', localizationKey: 'territory.access.safehouse' }, yieldProfileKey: 'residential-goods', perk: perk('quiet-streets', 'district.defense.rating', 300, 'district', 'defense', ['TURF_DEFEND']) },
    LOW_RENT: { access: { key: 'back-room-market', accessType: 'toll', localizationKey: 'territory.access.backRoomMarket', tollCentsPerUse: 100, dailyTollCapCents: 1000 }, yieldProfileKey: 'market-goods', perk: perk('street-market', 'district.store.proceeds', 300, 'district', 'store', ['STORE_BUY', 'STORE_SELL']) },
    NIGHTCLUB: { access: { key: 'chop-shop', accessType: 'toll', localizationKey: 'territory.access.chopShop', tollCentsPerUse: 250, dailyTollCapCents: 1500 }, yieldProfileKey: 'nightlife-goods', perk: perk('workshop-advantage', 'district.production.output', 300, 'district', 'production', ['PRODUCE']) },
    URBAN_GHETTO: { access: { key: 'shortcut-lane', accessType: 'toll', localizationKey: 'territory.access.shortcutLane', tollCentsPerUse: 100, dailyTollCapCents: 1000 }, yieldProfileKey: 'transit-goods', perk: perk('shortcut-routes', 'district.travel.expense', -300, 'district', 'travel', ['TRAVEL']) },
  },
  cities: {
    chicago: { access: { key: 'arms-dealer', accessType: 'holderOnly', localizationKey: 'territory.access.armsDealer' }, yieldProfileKey: 'chicago-ammo', perk: perk('iron-grip', 'city.turf.defense', 500, 'city', 'defense', ['TURF_DEFEND']) },
    detroit: { access: { key: 'motor-city-garage', accessType: 'toll', localizationKey: 'territory.access.motorCityGarage', tollCentsPerUse: 250, dailyTollCapCents: 2000 }, yieldProfileKey: 'detroit-parts', perk: perk('motor-city', 'city.production.efficiency', 500, 'city', 'production', ['PRODUCE']) },
    'las-vegas': { access: { key: 'private-card-room', accessType: 'holderOnly', localizationKey: 'territory.access.privateCardRoom' }, yieldProfileKey: 'vegas-chips', perk: perk('high-roller', 'city.casino.xp', 500, 'city', 'xp', ['CASINO_XP']) },
    'new-york-city': { access: { key: 'wall-street-fixer', accessType: 'toll', localizationKey: 'territory.access.wallStreetFixer', tollCentsPerUse: 250, dailyTollCapCents: 2000 }, yieldProfileKey: 'nyc-cash', perk: perk('empire-state', 'city.store.profit', 500, 'city', 'store', ['STORE_SELL']) },
    'miami-beach': { access: { key: 'port-dock', accessType: 'holderOnly', localizationKey: 'territory.access.portDock' }, yieldProfileKey: 'miami-imports', perk: perk('port-authority', 'city.scout.supplies', 500, 'city', 'scout', ['SCOUT']) },
    'los-angeles': { access: { key: 'studio-lot', accessType: 'toll', localizationKey: 'territory.access.studioLot', tollCentsPerUse: 250, dailyTollCapCents: 2000 }, yieldProfileKey: 'la-reputation', perk: perk('street-fame', 'city.contact.reputation', 300, 'city', 'reputation', ['CONTACT_REPUTATION']) },
  },
  regions: {
    midwest: { citySlugs: ['chicago', 'detroit', 'tulsa'], tiers: [1, 2, 3], tierValueBasisPoints: [250, 500, 800], perk: perk('industrial-empire', 'region.production.efficiency', 800, 'region', 'production', ['PRODUCE']) },
    southeast: { citySlugs: ['miami-beach', 'atlanta'], tiers: [1, 2], tierValueBasisPoints: [400, 800], perk: perk('southern-connections', 'region.contact.reputation', 800, 'region', 'reputation', ['CONTACT_REPUTATION']) },
    southwest: { citySlugs: ['las-vegas', 'dallas'], tiers: [1, 2], tierValueBasisPoints: [-500, -1000], perk: perk('desert-routes', 'region.travel.expense', -1000, 'region', 'travel', ['TRAVEL']) },
    west_coast: { citySlugs: ['seattle', 'beverly-hills', 'los-angeles', 'san-francisco'], tiers: [1, 2, 3, 4], tierValueBasisPoints: [200, 400, 600, 800], perk: perk('pacific-influence', 'region.scout.rewards', 800, 'region', 'scout', ['SCOUT']) },
  },
  yieldProfiles: {
    'casino-goods': { goodsPerHour: { BEER: 1 }, cashCentsPerHour: 50, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
    'residential-goods': { goodsPerHour: { MEDICINE: 1 }, cashCentsPerHour: 25, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
    'market-goods': { goodsPerHour: { WEED: 1 }, cashCentsPerHour: 50, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
    'nightlife-goods': { goodsPerHour: { ECSTASY: 1 }, cashCentsPerHour: 75, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
    'transit-goods': { goodsPerHour: { CONDOMS: 1 }, cashCentsPerHour: 25, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
    'chicago-ammo': { goodsPerHour: { WEED: 1 }, cashCentsPerHour: 50, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
    'detroit-parts': { goodsPerHour: { WEED: 1 }, cashCentsPerHour: 50, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
    'vegas-chips': { goodsPerHour: { BEER: 1 }, cashCentsPerHour: 75, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
    'nyc-cash': { goodsPerHour: {}, cashCentsPerHour: 100, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
    'miami-imports': { goodsPerHour: { ECSTASY: 1 }, cashCentsPerHour: 75, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
    'la-reputation': { goodsPerHour: { WEED: 1 }, cashCentsPerHour: 50, cacheHours: 12, perAdditionalHoldingBasisPoints: 8500 },
  },
};

/** Existing rounds have no opt-in field in their pinned ruleset, so this always fails closed. */
export function territoryCatalogForRuleset(ruleset: Pick<Ruleset, 'turf' | 'cities'> & Partial<Pick<Ruleset, 'ammoParts'>>): TerritoryCatalog | null {
  if (!ruleset.turf?.territory || !ruleset.turf.districts) return null;
  const districts = Object.fromEntries(Object.entries(TERRITORY_PERKS_CATALOG.districts)
    .filter(([key]) => Object.hasOwn(ruleset.turf!.districts!, key)));
  const cities = Object.fromEntries(Object.entries(TERRITORY_PERKS_CATALOG.cities)
    .filter(([slug]) => Object.hasOwn(ruleset.cities ?? {}, slug)));
  const regions: Record<string, TerritoryCatalog['regions'][string]> = {};
  for (const [key, region] of Object.entries(TERRITORY_PERKS_CATALOG.regions)) {
    const citySlugs = region.citySlugs.filter((slug) => Object.hasOwn(ruleset.cities ?? {}, slug));
    if (citySlugs.length >= 2) regions[key] = { ...region, citySlugs, tiers: region.tiers.slice(0, citySlugs.length), tierValueBasisPoints: region.tierValueBasisPoints.slice(0, citySlugs.length) };
  }
  const resourceYields = ruleset.ammoParts?.territoryYieldsEnabled === true;
  return {
    ...TERRITORY_PERKS_CATALOG,
    districts,
    cities: resourceYields ? {
      ...cities,
      chicago: { ...cities.chicago!, access: { ...cities.chicago!.access, accessType: 'toll', tollAmmoPerUse: 20, dailyTollCapAmmo: 100 } },
      detroit: { ...cities.detroit!, access: { ...cities.detroit!.access, tollVehiclePartsPerUse: 2, dailyTollCapVehicleParts: 10 } },
    } : cities,
    regions,
    yieldProfiles: resourceYields ? {
      ...TERRITORY_PERKS_CATALOG.yieldProfiles,
      'chicago-ammo': { ...TERRITORY_PERKS_CATALOG.yieldProfiles['chicago-ammo']!, goodsPerHour: { AMMO: 150 } },
      'detroit-parts': { ...TERRITORY_PERKS_CATALOG.yieldProfiles['detroit-parts']!, goodsPerHour: { VEHICLE_PARTS: 1 } },
    } : TERRITORY_PERKS_CATALOG.yieldProfiles,
  };
}

export function validateTerritoryCatalog(catalog: TerritoryCatalog, ruleset: Pick<Ruleset, 'turf' | 'cities'>): string[] {
  const issues: string[] = [];
  if (!ruleset.turf?.territory) issues.push('Ruleset has no alliance territory control.');
  for (const [key, location] of Object.entries(catalog.districts)) {
    if (!ruleset.turf?.districts || !Object.hasOwn(ruleset.turf.districts, key)) issues.push(`Unknown live district: ${key}`);
    if (location.perk && location.perk.valueBasisPoints === 0) issues.push(`Perk ${location.perk.key} has no effect value.`);
    if (!catalog.yieldProfiles[location.yieldProfileKey]) issues.push(`Missing yield profile: ${location.yieldProfileKey}`);
  }
  for (const [slug, location] of Object.entries(catalog.cities)) {
    if (!Object.hasOwn(ruleset.cities ?? {}, slug)) issues.push(`Unknown live city: ${slug}`);
    if (!catalog.yieldProfiles[location.yieldProfileKey]) issues.push(`Missing yield profile: ${location.yieldProfileKey}`);
  }
  for (const [key, region] of Object.entries(catalog.regions)) {
    if (region.tiers.length === 0 || region.tiers.some((tier) => !Number.isInteger(tier) || tier < 1)) issues.push(`Invalid region tiers: ${key}`);
    if (region.tierValueBasisPoints.length !== region.tiers.length) issues.push(`Region tier values do not match thresholds: ${key}`);
    for (const slug of region.citySlugs) if (!Object.hasOwn(ruleset.cities ?? {}, slug)) issues.push(`Unknown city ${slug} in region ${key}`);
  }
  return issues;
}
