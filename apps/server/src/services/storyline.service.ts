import type { PrismaClient } from '@prisma/client';
import type { CityEndingStoryDto, GlobalStorylineDto, StorylinePageDto } from '@streets/shared';
import type { Ruleset } from '@streets/rulesets';

export const StorylineService = {
  async page(db: PrismaClient, roundId: string, ruleset: Ruleset): Promise<StorylinePageDto> {
    const catalog = ruleset.cityEndings;
    if (!catalog) return { enabled: false, cities: [], global: null };
    const citySlugs = Object.keys(catalog.cities);
    const cities = await db.city.findMany({ where: { slug: { in: citySlugs } }, select: { id: true, slug: true } });
    const cityRows = await Promise.all(cities.map(async (city) => {
      const definition = catalog.cities[city.slug]!;
      const progress = await db.cityMemoryEvent.count({ where: { roundId, cityId: city.id, kind: { in: definition.triggerKinds as string[] } } });
      return { city, definition, progress };
    }));
    const globalKinds = [...new Set(Object.values(catalog.cities).flatMap((definition) => definition.triggerKinds))];
    const globalProgress = await db.cityMemoryEvent.count({ where: { roundId, kind: { in: globalKinds } } });
    const previousCities = await db.cityStoryState.findMany({ where: { roundId } });
    const now = new Date();
    const cityDtos: CityEndingStoryDto[] = [];
    for (const row of cityRows) {
      const existing = previousCities.find((state) => state.cityId === row.city.id);
      const progress = Math.min(row.definition.requiredEvents, row.progress);
      const ended = progress >= row.definition.requiredEvents;
      const state = await db.cityStoryState.upsert({
        where: { roundId_cityId: { roundId, cityId: row.city.id } },
        create: {
          roundId, cityId: row.city.id, endingKey: row.definition.key,
          progress, requiredEvents: row.definition.requiredEvents,
          status: ended ? 'ENDED' : 'ACTIVE', resolvedAt: ended ? (existing?.resolvedAt ?? now) : null,
        },
        update: {
          progress, requiredEvents: row.definition.requiredEvents,
          status: ended ? 'ENDED' : 'ACTIVE',
          ...(ended && !existing?.resolvedAt ? { resolvedAt: now } : {}),
        },
      });
      cityDtos.push({ citySlug: row.city.slug, endingKey: row.definition.key, title: row.definition.title, description: row.definition.description, status: state.status as CityEndingStoryDto['status'], progress: state.progress, requiredEvents: state.requiredEvents, resolvedAt: state.resolvedAt?.toISOString() ?? null });
    }
    const chapters = [...catalog.global.chapters].sort((a, b) => a.requiredEvents - b.requiredEvents);
    const chapter = chapters.reduce((current, item) => globalProgress >= item.requiredEvents ? item.chapter : current, 0);
    const currentChapter = chapters.find((item) => item.chapter === chapter) ?? null;
    const globalEnded = Boolean(currentChapter && chapter === chapters.at(-1)?.chapter && globalProgress >= currentChapter.requiredEvents);
    const storyState = await db.roundStoryState.upsert({
      where: { roundId },
      create: { roundId, catalogVersion: catalog.version, globalChapter: chapter, globalProgress, globalStatus: globalEnded ? 'ENDED' : 'ACTIVE', globalResolvedAt: globalEnded ? now : null },
      update: { catalogVersion: catalog.version, globalChapter: chapter, globalProgress, globalStatus: globalEnded ? 'ENDED' : 'ACTIVE', ...(globalEnded ? { globalResolvedAt: now } : {}) },
    });
    const global: GlobalStorylineDto = {
      key: catalog.global.key, title: catalog.global.title, description: catalog.global.description,
      catalogVersion: catalog.version, chapter: storyState.globalChapter, progress: storyState.globalProgress,
      requiredEvents: currentChapter?.requiredEvents ?? null, status: storyState.globalStatus as GlobalStorylineDto['status'],
      resolvedAt: storyState.globalResolvedAt?.toISOString() ?? null,
    };
    return { enabled: true, cities: cityDtos, global };
  },
};
