import type { PrismaClient } from '@prisma/client';
import { CRACK_PRODUCT, cityCounter, driveHoursFrom, findRoutes, loadRulesetForRound, pipBase, rulesetForCity } from '@streets/rules-engine';
import type { CitiesDto, CityCharacterDto } from '@streets/shared';
import type { SightingCounter } from './run-settle.service.js';
import { TurfService } from './turf.service.js';

function policeWord(pressure: number): CityCharacterDto['police'] {
  if (pressure < 0.8) return 'Light';
  if (pressure < 1.05) return 'Average';
  if (pressure < 1.3) return 'Heavy';
  return 'Heaviest';
}

/** Where busts start here against home, in words: close enough to plan by, not to compute with. */
function bustsAgainstHome(here: number, home: number): CityCharacterDto['busts'] {
  const gap = here - home;
  if (gap <= -15) return 'much sooner';
  if (gap < 0) return 'sooner';
  if (gap === 0) return 'the same';
  return gap >= 15 ? 'much later' : 'later';
}

/**
 * 0.5.0-A. The map. A player learns a city by going there: from home they get its
 * character, street talk, the roads and how the police lean, which is enough that no
 * trip is wasted. Pip's prices are only sent where they know them (home, and from
 * 0.5.0-B the cities their runs have seen, as last seen), so the numbers are not in
 * the response to find either.
 */
export const CitiesService = {
  async page(prisma: PrismaClient, roundPlayerId: string, now = new Date()): Promise<CitiesDto> {
    const player = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, include: { round: true, city: true } });
    const ruleset = loadRulesetForRound(player.round);
    const cities = ruleset.cities;
    const travel = ruleset.travel;
    if (!cities || !travel) return { enabled: false, homeCity: null, products: [], cities: [] };

    const home = player.city.slug;
    const homeRules = cities[home];
    const rows = await prisma.city.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true } });
    const hours = driveHoursFrom(ruleset, home);
    // 0.5.0-B: what the crew saw at Pip's in the cities its runs have reached.
    const sightings = new Map((await prisma.citySighting.findMany({ where: { roundPlayerId }, select: { city: true, seenAt: true, counter: true } }))
      .map((row) => [row.city, row]));
    const catalog = ruleset.products
      ? Object.entries(ruleset.products).sort(([, a], [, b]) => a.sortOrder - b.sortOrder).map(([key, product]) => ({ key, name: product.name }))
      : [{ key: CRACK_PRODUCT, name: 'Crack' }];
    const nameOf = (slug: string) => cities[slug]?.name ?? slug;
    const living = rulesetForCity(ruleset, home);
    const turfByCity = await TurfService.byCity(prisma, roundPlayerId, ruleset, now);

    return {
      enabled: true,
      homeCity: home,
      products: catalog,
      cities: rows.filter((row) => cities[row.slug]).map(({ slug }): CityCharacterDto => {
        const city = cities[slug]!;
        const isHome = slug === home;
        const route = isHome ? null : findRoutes(ruleset, home, slug)[0] ?? null;
        return {
          slug,
          name: city.name,
          trait: city.trait,
          blurb: city.blurb,
          talk: [...city.talk],
          isHome,
          driveHours: route ? hours[slug] ?? route.driveHours : null,
          gameMinutes: route?.gameMinutes ?? null,
          police: policeWord(city.policePressure),
          busts: bustsAgainstHome(city.heat.bustStartsAt, homeRules?.heat.bustStartsAt ?? city.heat.bustStartsAt),
          heat: isHome ? { dragStartsAt: city.heat.dragStartsAt, bustStartsAt: city.heat.bustStartsAt } : null,
          roads: travel.roads
            .filter((road) => road.from === slug || road.to === slug)
            .map((road) => {
              const to = road.from === slug ? road.to : road.from;
              return { to, toName: nameOf(to), name: road.name, driveHours: road.driveHours, police: road.police, note: road.note ?? null };
            })
            .sort((a, b) => a.driveHours - b.driveHours),
          counter: isHome
            ? {
                seenAt: null,
                // Home is Pip's store as it charges you: the city's prices from 0.5.0-D, his base buyback.
                products: catalog.map(({ key }) => {
                  const counter = cityCounter(ruleset, slug, key);
                  const store = pipBase(living, key);
                  if (!counter || !store || store.shelfCap <= 0) return { key, supply: null, buyCents: null, sellCents: null, stock: null };
                  return { key, supply: counter.supply, buyCents: store.buyCents, sellCents: store.sellCents, stock: null };
                }),
              }
            : sightings.has(slug)
              ? {
                  seenAt: sightings.get(slug)!.seenAt.toISOString(),
                  products: (sightings.get(slug)!.counter as unknown as SightingCounter).products,
              }
            : null,
          turf: turfByCity?.get(slug) ?? null,
        };
      }),
    };
  },
};
