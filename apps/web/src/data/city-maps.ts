/**
 * Schematic district maps, one per city, drawn on a 960x600 board.
 *
 * Each layout is a transit-style diagram of the real city: water, a few named
 * roads at 0/45/90 degrees, and one box per district placed roughly where that
 * neighborhood sits. Roads are context only. Districts have no adjacency in the
 * rules, so tiles never touch and no road is drawn as a link between two tiles.
 *
 * A tile's `label` is the short name shown on the map. It must appear inside
 * the district's full ruleset name, so a renamed district falls back to its
 * full name instead of showing a stale label (city-maps.test.ts checks this).
 */

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 600;

export const MAP_DISTRICTS = ['CASINO', 'NIGHTCLUB', 'LOW_RENT', 'URBAN_GHETTO', 'WINO_SLUMS'] as const;
export type MapDistrictKey = (typeof MAP_DISTRICTS)[number];

export type MapText = { text: string; x: number; y: number; rotate?: number };

export type CityMapTile = { x: number; y: number; w?: number; h?: number; label: string };

export type CityMapLayout = {
  /** Lakes, rivers, bays and ocean, as SVG polygon points. */
  water: Array<{ points: string; label?: MapText }>;
  /** A dashed boundary for cities with no water to frame them. */
  limits?: string;
  roads: Array<{ points: string; label: MapText; minor?: boolean }>;
  /** Free-standing place names, such as the far shore of a river. */
  tags?: MapText[];
  tiles: Record<MapDistrictKey, CityMapTile>;
};

export const TILE_WIDTH = 190;
export const TILE_HEIGHT = 88;

export function tileBox(tile: CityMapTile) {
  return { x: tile.x, y: tile.y, w: tile.w ?? TILE_WIDTH, h: tile.h ?? TILE_HEIGHT };
}

export const CITY_MAPS: Readonly<Record<string, CityMapLayout>> = {
  'new-york-city': {
    water: [
      { points: '0,0 220,0 220,380 280,440 280,600 0,600', label: { text: 'Hudson', x: 110, y: 300, rotate: -90 } },
      { points: '220,150 960,150 960,600 700,600 700,440 780,360 780,190 260,190', label: { text: 'East River', x: 870, y: 400, rotate: -90 } },
    ],
    tags: [{ text: 'Harlem River', x: 816, y: 176 }],
    roads: [
      { points: '330,190 330,250 540,460 540,600', label: { text: 'Broadway', x: 346, y: 214 } },
      { points: '560,0 560,150', minor: true, label: { text: 'Grand Concourse', x: 576, y: 24 } },
    ],
    tiles: {
      CASINO: { x: 430, y: 230, label: 'Midtown' },
      NIGHTCLUB: { x: 290, y: 350, label: 'Meatpacking' },
      LOW_RENT: { x: 500, y: 478, label: 'Lower East Side' },
      URBAN_GHETTO: { x: 330, y: 36, label: 'South Bronx' },
      WINO_SLUMS: { x: 290, y: 490, label: 'Bowery' },
    },
  },
  detroit: {
    water: [
      { points: '0,560 260,560 380,480 960,480 960,600 0,600', label: { text: 'Detroit River', x: 640, y: 535 } },
    ],
    tags: [{ text: 'Windsor, ON', x: 820, y: 585 }],
    roads: [
      { points: '520,0 520,480', label: { text: 'Woodward Ave', x: 536, y: 24 } },
      { points: '600,330 820,110 820,0', minor: true, label: { text: 'Gratiot', x: 836, y: 60 } },
      { points: '0,250 280,250 360,170 960,170', minor: true, label: { text: 'I-75', x: 24, y: 240 } },
    ],
    tiles: {
      CASINO: { x: 430, y: 290, label: 'Greektown' },
      NIGHTCLUB: { x: 300, y: 60, label: 'Downtown' },
      LOW_RENT: { x: 60, y: 400, label: 'Southwest' },
      URBAN_GHETTO: { x: 700, y: 210, label: 'East Side' },
      WINO_SLUMS: { x: 690, y: 370, label: 'Riverfront' },
    },
  },
  'miami-beach': {
    water: [
      { points: '0,0 340,0 340,470 410,540 410,600 0,600', label: { text: 'Biscayne Bay', x: 170, y: 300, rotate: -90 } },
      { points: '810,0 960,0 960,600 770,600 770,480 810,440', label: { text: 'Atlantic', x: 885, y: 300, rotate: -90 } },
    ],
    roads: [
      { points: '0,210 360,210', minor: true, label: { text: 'Julia Tuttle Cswy', x: 20, y: 200 } },
      { points: '0,520 420,520', minor: true, label: { text: 'MacArthur Cswy', x: 20, y: 510 } },
      { points: '790,0 790,450 750,490 750,600', label: { text: 'Collins Ave', x: 676, y: 24 } },
    ],
    tiles: {
      CASINO: { x: 570, y: 180, label: 'Collins' },
      NIGHTCLUB: { x: 530, y: 480, label: 'South Beach' },
      LOW_RENT: { x: 480, y: 40, label: 'North Beach' },
      URBAN_GHETTO: { x: 440, y: 330, label: 'Washington Ave' },
      WINO_SLUMS: { x: 360, y: 180, label: 'Causeway' },
    },
  },
  seattle: {
    water: [
      { points: '0,0 180,0 180,120 400,340 400,600 0,600', label: { text: 'Elliott Bay', x: 150, y: 420 } },
      { points: '560,0 760,0 760,50 720,90 560,90', label: { text: 'Lake Union', x: 650, y: 52 } },
    ],
    roads: [
      { points: '650,90 650,600', label: { text: 'I-5', x: 666, y: 330 } },
      { points: '400,560 960,560', minor: true, label: { text: 'I-90', x: 840, y: 548 } },
    ],
    tiles: {
      CASINO: { x: 400, y: 180, label: 'Downtown' },
      NIGHTCLUB: { x: 250, y: 40, label: 'Belltown' },
      LOW_RENT: { x: 430, y: 450, label: 'SODO' },
      URBAN_GHETTO: { x: 720, y: 400, label: 'Rainier' },
      WINO_SLUMS: { x: 420, y: 320, label: 'Pioneer' },
    },
  },
  'san-francisco': {
    water: [
      { points: '0,0 960,0 960,600 790,600 790,250 650,110 0,110', label: { text: 'SF Bay', x: 875, y: 400, rotate: -90 } },
    ],
    tags: [{ text: 'Golden Gate', x: 130, y: 62 }],
    roads: [
      { points: '770,260 430,600', label: { text: 'Market St', x: 640, y: 440, rotate: -45 } },
      { points: '260,110 260,600', minor: true, label: { text: 'Van Ness', x: 276, y: 590 } },
    ],
    tiles: {
      CASINO: { x: 340, y: 140, label: 'Nob Hill' },
      NIGHTCLUB: { x: 540, y: 380, label: 'SoMa' },
      LOW_RENT: { x: 320, y: 480, label: 'Mission' },
      URBAN_GHETTO: { x: 300, y: 280, label: 'Tenderloin' },
      WINO_SLUMS: { x: 560, y: 240, label: 'Embarcadero' },
    },
  },
  'beverly-hills': {
    water: [],
    limits: '150,30 830,30 920,170 920,570 150,570 60,450 60,130',
    tags: [{ text: 'City limits', x: 840, y: 592 }],
    roads: [
      { points: '0,150 250,150 340,60 960,60', label: { text: 'Sunset Blvd', x: 700, y: 50 } },
      { points: '0,245 960,245', label: { text: 'Santa Monica Blvd', x: 24, y: 234 } },
      { points: '0,430 960,430', label: { text: 'Wilshire Blvd', x: 24, y: 419 } },
      { points: '485,245 485,600', minor: true, label: { text: 'Rodeo Dr', x: 500, y: 590 } },
    ],
    tiles: {
      CASINO: { x: 390, y: 280, label: 'Rodeo' },
      NIGHTCLUB: { x: 420, y: 100, label: 'Sunset' },
      LOW_RENT: { x: 110, y: 290, label: 'Flats' },
      URBAN_GHETTO: { x: 680, y: 290, label: 'Service Alleys' },
      WINO_SLUMS: { x: 660, y: 460, label: 'Motel Row' },
    },
  },
  'las-vegas': {
    water: [],
    tags: [{ text: '← Red Rock', x: 80, y: 585 }],
    roads: [
      { points: '480,0 480,600', label: { text: 'Las Vegas Blvd', x: 496, y: 590 } },
      { points: '290,0 290,600', label: { text: 'I-15', x: 236, y: 300 } },
      { points: '290,150 960,150', minor: true, label: { text: 'US-95', x: 870, y: 140 } },
      { points: '700,150 960,410', minor: true, label: { text: 'Boulder Hwy', x: 836, y: 236 } },
    ],
    tiles: {
      CASINO: { x: 385, y: 310, h: 170, label: 'The Strip' },
      NIGHTCLUB: { x: 380, y: 30, label: 'Fremont' },
      LOW_RENT: { x: 650, y: 320, label: 'Paradise' },
      URBAN_GHETTO: { x: 380, y: 180, label: 'Naked City' },
      WINO_SLUMS: { x: 720, y: 470, label: 'Boulder' },
    },
  },
  'los-angeles': {
    water: [
      { points: '800,0 850,0 850,260 950,360 950,600 900,600 900,380 800,280', label: { text: 'LA River', x: 780, y: 110, rotate: -90 } },
    ],
    roads: [
      { points: '0,150 300,150 420,270 800,270', label: { text: 'US-101', x: 24, y: 140 } },
      { points: '0,470 960,470', label: { text: 'I-10', x: 24, y: 459 } },
      { points: '560,270 560,600', minor: true, label: { text: 'I-110', x: 576, y: 590 } },
    ],
    tiles: {
      CASINO: { x: 580, y: 160, label: 'Downtown' },
      NIGHTCLUB: { x: 110, y: 30, label: 'Hollywood' },
      LOW_RENT: { x: 250, y: 300, label: 'Koreatown' },
      URBAN_GHETTO: { x: 350, y: 500, label: 'South Central' },
      WINO_SLUMS: { x: 600, y: 320, label: 'Warehouse Row' },
    },
  },
  atlanta: {
    water: [],
    roads: [
      { points: '530,0 530,160 500,190 500,600', label: { text: 'Peachtree St', x: 516, y: 590 } },
      { points: '0,440 960,440', label: { text: 'I-20', x: 900, y: 429 } },
      { points: '640,0 640,600', minor: true, label: { text: 'I-75/85', x: 656, y: 24 } },
      { points: '120,330 200,250 760,250 840,330 840,520 760,600', minor: true, label: { text: 'Beltline', x: 856, y: 480 } },
    ],
    tiles: {
      CASINO: { x: 420, y: 30, label: 'Buckhead' },
      NIGHTCLUB: { x: 690, y: 290, label: 'Edgewood' },
      LOW_RENT: { x: 170, y: 480, label: 'West End' },
      URBAN_GHETTO: { x: 90, y: 150, label: 'Bankhead' },
      WINO_SLUMS: { x: 410, y: 290, label: 'Five Points' },
    },
  },
  chicago: {
    water: [
      { points: '780,0 960,0 960,600 720,600 720,360 780,300', label: { text: 'Lake Michigan', x: 875, y: 300, rotate: -90 } },
      { points: '300,0 320,0 320,236 780,236 780,256 320,256 320,600 300,600', label: { text: 'Chicago River', x: 600, y: 228 } },
    ],
    roads: [
      { points: '760,0 760,290 700,350 700,600', label: { text: 'Lake Shore Dr', x: 560, y: 590 } },
      { points: '240,0 240,600', label: { text: 'I-90/94', x: 150, y: 24 } },
      { points: '0,420 240,420', minor: true, label: { text: 'I-290', x: 24, y: 409 } },
    ],
    tiles: {
      CASINO: { x: 550, y: 50, label: 'Gold Coast' },
      NIGHTCLUB: { x: 340, y: 120, label: 'River North' },
      LOW_RENT: { x: 40, y: 460, label: 'Pilsen' },
      URBAN_GHETTO: { x: 40, y: 280, label: 'West Side' },
      WINO_SLUMS: { x: 420, y: 290, label: 'Lower Wacker' },
    },
  },
  tulsa: {
    water: [
      { points: '0,330 220,330 520,600 440,600 190,370 0,370', label: { text: 'Arkansas River', x: 337, y: 470, rotate: 42 } },
    ],
    roads: [
      { points: '0,300 960,300', label: { text: 'Route 66', x: 270, y: 290 } },
      { points: '600,0 600,600', label: { text: 'US-75', x: 616, y: 590 } },
    ],
    tiles: {
      CASINO: { x: 560, y: 470, label: 'River Spirit' },
      NIGHTCLUB: { x: 370, y: 160, label: 'Brady' },
      LOW_RENT: { x: 680, y: 170, label: 'Kendall-Whittier' },
      URBAN_GHETTO: { x: 380, y: 20, label: 'North Tulsa' },
      WINO_SLUMS: { x: 60, y: 190, label: 'Route 66' },
    },
  },
  dallas: {
    water: [
      { points: '200,0 250,0 250,250 400,400 400,600 350,600 350,420 200,270', label: { text: 'Trinity River', x: 295, y: 330, rotate: 45 } },
    ],
    roads: [
      { points: '300,0 300,120 460,280 460,600', label: { text: 'I-35E', x: 316, y: 24 } },
      { points: '0,350 960,350', label: { text: 'I-30', x: 24, y: 339 } },
      { points: '640,0 640,600', minor: true, label: { text: 'US-75', x: 656, y: 590 } },
    ],
    tiles: {
      CASINO: { x: 440, y: 30, label: 'Uptown' },
      NIGHTCLUB: { x: 700, y: 230, label: 'Deep Ellum' },
      LOW_RENT: { x: 60, y: 430, label: 'Oak Cliff' },
      URBAN_GHETTO: { x: 560, y: 440, label: 'South Dallas' },
      WINO_SLUMS: { x: 300, y: 150, label: 'Stemmons' },
    },
  },
};

/** For a city without its own layout: a plain crossroads, full district names. */
export const FALLBACK_CITY_MAP: CityMapLayout = {
  water: [],
  roads: [
    { points: '0,300 960,300', label: { text: '', x: 0, y: 0 } },
    { points: '480,0 480,600', label: { text: '', x: 0, y: 0 } },
  ],
  tiles: {
    CASINO: { x: 385, y: 60, label: '' },
    NIGHTCLUB: { x: 690, y: 160, label: '' },
    LOW_RENT: { x: 690, y: 420, label: '' },
    URBAN_GHETTO: { x: 80, y: 420, label: '' },
    WINO_SLUMS: { x: 80, y: 160, label: '' },
  },
};

export function cityMapFor(citySlug: string | null | undefined): CityMapLayout {
  return (citySlug && CITY_MAPS[citySlug]) || FALLBACK_CITY_MAP;
}

/** The short label when it still matches the district's real name; otherwise the full name. */
export function tileLabel(tile: CityMapTile, districtName: string): string {
  return tile.label && districtName.toLowerCase().includes(tile.label.toLowerCase()) ? tile.label : districtName;
}

/** Rough rendered width of bold sans text, in board units. */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56;
}

/** Splits a name into two balanced lines for the phone layout, at a space or hyphen. */
export function splitLabel(label: string): [string] | [string, string] {
  if (label.length <= 9) return [label];
  let best: [string, string] | null = null;
  for (let i = 1; i < label.length - 1; i++) {
    const ch = label[i];
    if (ch !== ' ' && ch !== '-') continue;
    const first = ch === '-' ? label.slice(0, i + 1) : label.slice(0, i);
    const second = label.slice(i + 1);
    if (!best || Math.max(first.length, second.length) < Math.max(best[0].length, best[1].length)) best = [first, second];
  }
  return best ?? [label];
}
