export const TURF_MAP_ZONES: Record<'CASINO' | 'NIGHTCLUB' | 'LOW_RENT' | 'URBAN_GHETTO' | 'WINO_SLUMS', { path: string; x: number; y: number }> = {
  CASINO: {
    path: 'M440,58 L746,58 L822,112 L822,262 L440,262 Z',
    x: 632,
    y: 160,
  },
  NIGHTCLUB: {
    path: 'M112,58 L440,58 L440,310 L48,310 L48,140 Z',
    x: 225,
    y: 190,
  },
  LOW_RENT: {
    path: 'M440,455 L650,455 L650,642 L440,642 Z',
    x: 545,
    y: 545,
  },
  URBAN_GHETTO: {
    path: 'M48,310 L440,310 L440,642 L122,642 L48,576 Z',
    x: 230,
    y: 470,
  },
  WINO_SLUMS: {
    path: 'M440,262 L822,262 L844,536 L786,642 L650,642 L650,455 L440,455 Z',
    x: 700,
    y: 360,
  },
};
