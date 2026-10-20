import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { territoryCatalogForRuleset } from '@streets/rulesets';
import type { TerritoryEmpireDto } from '@streets/shared';
import { territoryFeatureEnabled, territoryPerkCityControlFromRows } from './territory-perks.service.js';
import { cityTerritoryControlIntervals, districtTerritoryControlIntervals, settlePersistedTerritoryYield } from './territory-yield.service.js';

function cacheContents(value: unknown): { goods: Record<string, number>; cashCents: number; tollCents: number } {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const goodsRaw = raw.goods && typeof raw.goods === 'object' && !Array.isArray(raw.goods) ? raw.goods as Record<string, unknown> : {};
  return { goods: Object.fromEntries(Object.entries(goodsRaw).map(([key, amount]) => [key, Number(amount) || 0])), cashCents: Number(raw.cashCents) || 0, tollCents: Number(raw.tollCents) || 0 };
}

export async function territoryEmpirePage(prisma: PrismaClient, roundPlayerId: string): Promise<TerritoryEmpireDto> {
  const player = await prisma.roundPlayer.findUniqueOrThrow({
    where: { id: roundPlayerId },
    select: { id: true, allianceId: true, round: true },
  });
  const round = player.round;
  const alliance = player.allianceId
    ? await prisma.alliance.findUnique({ where: { id: player.allianceId }, select: { leaderId: true } })
    : null;
  const ruleset = loadRulesetForRound(round);
  const base: TerritoryEmpireDto = {
    enabled: false,
    catalogVersion: null,
    disabledReason: round.territoryPerksEnabled ? 'This round has an unsupported territory catalog version.' : 'Territory rewards are not enabled for this round.',
    allianceId: player.allianceId,
    canSelectRegionalPower: alliance?.leaderId === player.id,
    selectedRegionKey: null,
    regionalPowerChangeAvailableAt: null,
    cities: [],
    regions: [],
  };
  if (!territoryFeatureEnabled(round, ruleset)) return base;
  const catalog = territoryCatalogForRuleset(ruleset)!;
  const citySlugs = Object.keys(ruleset.cities ?? {});
  const cities = await prisma.city.findMany({
    where: { slug: { in: citySlugs } },
    select: {
      id: true,
      slug: true,
      name: true,
      turf: {
        where: { roundId: round.id },
        select: { district: true, holder: { select: { allianceId: true, alliance: { select: { name: true, tag: true } } } } },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
  const cityControls = new Map(cities.map((city) => [city.id, territoryPerkCityControlFromRows(ruleset, city.turf)]));
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    let priorCityHoldings = 0;
    for (const city of cities) {
      const definition = catalog.cities[city.slug];
      const profile = definition ? catalog.yieldProfiles[definition.yieldProfileKey] : undefined;
      const control = cityControls.get(city.id) ?? null;
      if (profile) {
        const intervals = await cityTerritoryControlIntervals({ tx, roundId: round.id, cityId: city.id, roundStartedAt: round.startsAt, now });
        await settlePersistedTerritoryYield({
          tx,
          roundId: round.id,
          scope: 'city',
          locationKey: city.slug,
          profile,
          intervals,
          initialSettledAt: round.startsAt,
          currentAllianceId: control?.allianceId ?? null,
          now,
          priorSameTierHoldings: control && control.allianceId === player.allianceId ? priorCityHoldings : 0,
        });
        if (control && control.allianceId === player.allianceId) priorCityHoldings += 1;
      }
      for (const turf of city.turf) {
        const districtDefinition = catalog.districts[turf.district];
        const districtProfile = districtDefinition ? catalog.yieldProfiles[districtDefinition.yieldProfileKey] : undefined;
        if (!districtProfile) continue;
        const districtIntervals = await districtTerritoryControlIntervals({ tx, roundId: round.id, cityId: city.id, district: turf.district, roundStartedAt: round.startsAt, now });
        await settlePersistedTerritoryYield({
          tx,
          roundId: round.id,
          scope: 'district',
          locationKey: `${city.slug}:${turf.district}`,
          profile: districtProfile,
          intervals: districtIntervals,
          initialSettledAt: round.startsAt,
          currentAllianceId: turf.holder?.allianceId ?? null,
          now,
          priorSameTierHoldings: 0,
        });
      }
    }
  }, { maxWait: 10_000, timeout: 60_000 });
  const caches = player.allianceId
    ? await prisma.territoryYieldCache.findMany({
        where: { roundId: round.id, scope: { in: ['city', 'district'] }, ownerAllianceId: player.allianceId },
        select: { scope: true, locationKey: true, contents: true },
      })
    : [];
  const cacheByLocation = new Map(caches.map((row) => [`${row.scope}:${row.locationKey}`, cacheContents(row.contents)]));
  const cityRows = cities.map((city) => {
    const control = cityControls.get(city.id) ?? null;
    return {
      slug: city.slug,
      name: ruleset.cities?.[city.slug]?.name ?? city.name,
      controlledDistricts: control?.blocksHeld ?? 0,
      eligibleDistricts: city.turf.length,
      ownerAllianceId: control?.allianceId ?? null,
      ownerName: control?.alliance.name ?? null,
      ownerTag: control?.alliance.tag ?? null,
      requirementPercent: Math.round((ruleset.turf?.territory?.cityControlShare ?? 0) * 100),
      accessKey: catalog.cities[city.slug]?.access.key ?? null,
      accessTollCents: catalog.cities[city.slug]?.access.tollCentsPerUse ?? 0,
      accessDailyTollCapCents: catalog.cities[city.slug]?.access.dailyTollCapCents ?? 0,
      perkKey: catalog.cities[city.slug]?.perk?.key ?? null,
      cache: cacheByLocation.get(`city:${city.slug}`) ?? null,
      districts: city.turf.map((turf) => ({
        key: turf.district,
        ownerAllianceId: turf.holder?.allianceId ?? null,
        accessKey: catalog.districts[turf.district]?.access.key ?? null,
        accessTollCents: catalog.districts[turf.district]?.access.tollCentsPerUse ?? 0,
        accessDailyTollCapCents: catalog.districts[turf.district]?.access.dailyTollCapCents ?? 0,
        cache: cacheByLocation.get(`district:${city.slug}:${turf.district}`) ?? null,
      })),
    };
  });
  const selection = player.allianceId
    ? await prisma.territoryPowerSelection.findUnique({ where: { allianceId: player.allianceId }, select: { regionKey: true, changedAt: true } })
    : null;
  const regions = Object.entries(catalog.regions).map(([key, region]) => {
    const controlledCities = region.citySlugs.filter((slug) => cityRows.some((city) => city.slug === slug && city.ownerAllianceId === player.allianceId)).length;
    return {
      key,
      citySlugs: [...region.citySlugs],
      controlledCities,
      currentTier: region.tiers.filter((threshold) => controlledCities >= threshold).length,
      nextThreshold: region.tiers.find((threshold) => controlledCities < threshold) ?? null,
      tierThresholds: [...region.tiers],
      perkKey: region.perk.key,
      selected: selection?.regionKey === key && controlledCities > 0,
    };
  });
  return {
    enabled: true,
    catalogVersion: catalog.version,
    allianceId: player.allianceId,
    canSelectRegionalPower: alliance?.leaderId === player.id,
    selectedRegionKey: regions.find((region) => region.selected)?.key ?? null,
    regionalPowerChangeAvailableAt: selection ? new Date(selection.changedAt.getTime() + 24 * 60 * 60 * 1000).toISOString() : null,
    cities: cityRows,
    regions,
  };
}
