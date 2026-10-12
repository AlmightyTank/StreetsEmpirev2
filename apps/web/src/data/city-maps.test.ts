import { describe, expect, it } from 'vitest';
import { rulesets } from '@streets/rulesets';
import {
  CITY_MAPS,
  estimateTextWidth,
  FALLBACK_CITY_MAP,
  MAP_DISTRICTS,
  MAP_HEIGHT,
  MAP_WIDTH,
  splitLabel,
  tileBox,
  tileLabel,
  type CityMapLayout,
} from './city-maps.js';

type RulesetCity = { name: string; districts?: Record<string, { name: string }> };

// Every city any ruleset has ever shipped, with every name each district has carried.
const rulesetCities = new Map<string, { name: string; districtNames: Map<string, Set<string>> }>();
for (const ruleset of Object.values(rulesets)) {
  const cities = (ruleset as { cities?: Record<string, RulesetCity> }).cities ?? {};
  for (const [slug, city] of Object.entries(cities)) {
    const seen = rulesetCities.get(slug) ?? { name: city.name, districtNames: new Map() };
    for (const [key, district] of Object.entries(city.districts ?? {})) {
      const names = seen.districtNames.get(key) ?? new Set<string>();
      names.add(district.name);
      seen.districtNames.set(key, names);
    }
    rulesetCities.set(slug, seen);
  }
}

function insidePolygon(x: number, y: number, points: string): boolean {
  const vertices = points.trim().split(/\s+/).map((pair) => pair.split(',').map(Number) as [number, number]);
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i]!;
    const [xj, yj] = vertices[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const layouts: Array<[string, CityMapLayout]> = [...Object.entries(CITY_MAPS), ['fallback', FALLBACK_CITY_MAP]];

describe('city district maps', () => {
  it('has a layout for every city in every ruleset', () => {
    const missing = [...rulesetCities.keys()].filter((slug) => !CITY_MAPS[slug]);
    expect(missing).toEqual([]);
  });

  it.each(layouts)('%s keeps every tile on the board, apart, and out of the water', (_slug, layout) => {
    const boxes = MAP_DISTRICTS.map((key) => ({ key, ...tileBox(layout.tiles[key]) }));
    for (const box of boxes) {
      expect(box.x, box.key).toBeGreaterThanOrEqual(8);
      expect(box.y, box.key).toBeGreaterThanOrEqual(8);
      expect(box.x + box.w, box.key).toBeLessThanOrEqual(MAP_WIDTH - 8);
      expect(box.y + box.h, box.key).toBeLessThanOrEqual(MAP_HEIGHT - 8);

      for (const water of layout.water) {
        for (let t = 0; t <= 1; t += 0.1) {
          const edge = [
            [box.x + box.w * t, box.y],
            [box.x + box.w * t, box.y + box.h],
            [box.x, box.y + box.h * t],
            [box.x + box.w, box.y + box.h * t],
          ];
          for (const [x, y] of edge) expect(insidePolygon(x!, y!, water.points), `${box.key} at ${x},${y}`).toBe(false);
        }
      }
    }

    // A ring is drawn 6 units outside a selected tile; keep rings from touching.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const apart = a.x + a.w + 14 <= b.x || b.x + b.w + 14 <= a.x || a.y + a.h + 14 <= b.y || b.y + b.h + 14 <= a.y;
        expect(apart, `${a.key} and ${b.key}`).toBe(true);
      }
    }
  });

  it.each(Object.entries(CITY_MAPS))('%s keeps its place names on the board', (_slug, layout) => {
    // Uppercase 13px mono with 0.14em tracking runs about 9.6 units a character.
    const labels = [...layout.water.flatMap((water) => (water.label ? [water.label] : [])), ...layout.roads.map((road) => road.label), ...(layout.tags ?? [])];
    for (const label of labels) {
      const width = label.text.length * 9.6;
      if (label.rotate) continue; // Rotated labels are centered on their point and sit in open water or along a road.
      expect(label.x, label.text).toBeGreaterThanOrEqual(8);
      expect(label.x + width, label.text).toBeLessThanOrEqual(MAP_WIDTH - 8);
      expect(label.y, label.text).toBeGreaterThanOrEqual(16);
      expect(label.y, label.text).toBeLessThanOrEqual(MAP_HEIGHT - 4);
    }
  });

  it('only uses a short label that still names the district', () => {
    const stale: string[] = [];
    for (const [slug, city] of rulesetCities) {
      const layout = CITY_MAPS[slug];
      if (!layout) continue;
      for (const [key, names] of city.districtNames) {
        const tile = layout.tiles[key as keyof CityMapLayout['tiles']];
        for (const name of names) if (tileLabel(tile, name) !== tile.label) stale.push(`${slug} ${key}: "${tile.label}" vs "${name}"`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('falls back to the full name when a district is renamed', () => {
    expect(tileLabel({ x: 0, y: 0, label: 'Bowery' }, 'Bowery Row')).toBe('Bowery');
    expect(tileLabel({ x: 0, y: 0, label: 'Bowery' }, 'Canal Street Walkups')).toBe('Canal Street Walkups');
  });

  it('fits every phone label in two lines without crushing it', () => {
    for (const [slug, layout] of Object.entries(CITY_MAPS)) {
      for (const key of MAP_DISTRICTS) {
        const box = tileBox(layout.tiles[key]);
        for (const line of splitLabel(layout.tiles[key].label)) {
          // Lines wider than the tile are squeezed; past ~30% they get hard to read.
          expect(estimateTextWidth(line, 32) / (box.w - 16), `${slug} ${key} "${line}"`).toBeLessThanOrEqual(1.3);
        }
      }
    }
  });

  it('splits long names at a space or hyphen into balanced lines', () => {
    expect(splitLabel('Bowery')).toEqual(['Bowery']);
    expect(splitLabel('Lower East Side')).toEqual(['Lower', 'East Side']);
    expect(splitLabel('Kendall-Whittier')).toEqual(['Kendall-', 'Whittier']);
  });
});
