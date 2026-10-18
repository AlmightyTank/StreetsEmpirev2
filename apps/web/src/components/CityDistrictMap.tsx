import type { KeyboardEvent } from 'react';
import {
  cityMapFor,
  estimateTextWidth,
  MAP_DISTRICTS,
  MAP_HEIGHT,
  MAP_WIDTH,
  splitLabel,
  tileBox,
  tileLabel,
  type MapDistrictKey,
  type MapText,
} from '../data/city-maps.js';

export type CityDistrictMapEntry = {
  district: string;
  name: string;
  status: 'mine' | 'held' | 'locals' | 'vacant' | 'pressure' | 'locked' | 'coverage-covered' | 'coverage-warn' | 'coverage-bad';
  statusText: string;
  detail?: string;
  /** Alliance tag of whoever holds the block, shown on the tile. */
  tag?: string | null;
  /** One entry per business lot: true where a business is built. */
  lots?: boolean[];
};

const NAME_SIZE = 22;
const STATUS_SIZE = 13;
const COMPACT_SIZE = 32;
const PAD = 12;

/** Long names are squeezed to fit rather than clipped. */
function fitWidth(text: string, fontSize: number, maxWidth: number): number | undefined {
  return estimateTextWidth(text, fontSize) > maxWidth ? maxWidth : undefined;
}

function MapLabel({ label, className }: { label: MapText; className: string }) {
  if (!label.text) return null;
  return (
    <text
      className={className}
      x={label.x}
      y={label.y}
      textAnchor={label.rotate ? 'middle' : undefined}
      transform={label.rotate ? `rotate(${label.rotate} ${label.x} ${label.y})` : undefined}
    >
      {label.text}
    </text>
  );
}

function pathFor(points: string, closed: boolean): string {
  return `M${points.trim().split(/\s+/).join(' L')}${closed ? ' Z' : ''}`;
}

export function CityDistrictMap({
  citySlug,
  cityName,
  districts,
  selectedDistrict,
  onSelect,
  disabled = false,
  disableLocked = false,
}: {
  citySlug: string;
  cityName: string;
  districts: CityDistrictMapEntry[];
  selectedDistrict: string | null;
  onSelect: (district: string) => void;
  disabled?: boolean;
  /** Scout uses access-gated tiles; other map consumers retain their own interaction rules. */
  disableLocked?: boolean;
}) {
  const layout = cityMapFor(citySlug);
  const byDistrict = new Map(districts.map((entry) => [entry.district, entry]));
  const shown = MAP_DISTRICTS.filter((key) => byDistrict.has(key));

  function onKey(event: KeyboardEvent, district: MapDistrictKey) {
    if (disabled || (disableLocked && byDistrict.get(district)?.status === 'locked') || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onSelect(district);
  }

  const grid: number[][] = [];
  for (let x = 80; x < MAP_WIDTH; x += 80) grid.push([x, 0, x, MAP_HEIGHT]);
  for (let y = 80; y < MAP_HEIGHT; y += 80) grid.push([0, y, MAP_WIDTH, y]);

  return (
    <div className={`se-districtmap${disabled ? ' se-districtmap--disabled' : ''}`}>
      <svg className="se-districtmap__svg" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="group" aria-label={`${cityName} district map`}>
        <rect className="se-districtmap__ground" width={MAP_WIDTH} height={MAP_HEIGHT} />
        <g className="se-districtmap__grid" aria-hidden="true">
          {grid.map(([x1, y1, x2, y2]) => <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />)}
        </g>
        <g aria-hidden="true">
          {layout.limits ? <path className="se-districtmap__limits" d={pathFor(layout.limits, true)} /> : null}
          {layout.water.map((water) => <path key={water.points} className="se-districtmap__water" d={pathFor(water.points, true)} />)}
          {layout.roads.map((road) => (
            <path key={road.points} className={`se-districtmap__road${road.minor ? ' se-districtmap__road--minor' : ''}`} d={pathFor(road.points, false)} />
          ))}
          {layout.water.map((water) => water.label ? <MapLabel key={water.points} label={water.label} className="se-districtmap__water-label" /> : null)}
          {layout.roads.map((road) => <MapLabel key={road.points} label={road.label} className="se-districtmap__road-label" />)}
          {(layout.tags ?? []).map((tag) => <MapLabel key={tag.text} label={tag} className="se-districtmap__road-label" />)}
        </g>

        {shown.map((district) => {
          const entry = byDistrict.get(district)!;
          const { x, y, w, h } = tileBox(layout.tiles[district]);
          const label = tileLabel(layout.tiles[district], entry.name);
          const compact = splitLabel(label);
          const selected = selectedDistrict === district;
          const tileDisabled = disabled || (disableLocked && entry.status === 'locked');
          const status = `${entry.tag ? `[${entry.tag}] ` : ''}${entry.statusText}`;
          const lots = entry.lots ?? [];
          const statusRoom = w - PAD * 2 - (lots.length ? lots.length * 15 + 6 : 0);
          return (
            <g
              key={district}
              className={`se-districtmap__tile se-districtmap__tile--${entry.status}${selected ? ' se-districtmap__tile--selected' : ''}${tileDisabled ? ' se-districtmap__tile--unavailable' : ''}`}
              role="button"
              tabIndex={tileDisabled ? -1 : 0}
              aria-pressed={selected}
              aria-disabled={tileDisabled || undefined}
              aria-label={`${entry.name}. ${entry.statusText}${entry.tag ? `, [${entry.tag}]` : ''}${entry.detail ? `. ${entry.detail}` : ''}.`}
              onClick={() => { if (!tileDisabled) onSelect(district); }}
              onKeyDown={(event) => onKey(event, district)}
            >
              <title>{entry.detail ? `${entry.name} · ${entry.detail}` : entry.name}</title>
              <rect className="se-districtmap__ring" x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx={10} />
              <rect className="se-districtmap__box" x={x} y={y} width={w} height={h} rx={6} />
              <rect className="se-districtmap__tint" x={x} y={y} width={w} height={h} rx={6} />

              <g className="se-districtmap__full">
                <text className="se-districtmap__name" x={x + PAD} y={y + 36} textLength={fitWidth(label, NAME_SIZE, w - PAD * 2)} lengthAdjust="spacingAndGlyphs">{label}</text>
                <text className="se-districtmap__status" x={x + PAD} y={y + h - 16} textLength={fitWidth(status, STATUS_SIZE, statusRoom)} lengthAdjust="spacingAndGlyphs">{status}</text>
                {lots.map((built, index) => (
                  <rect
                    key={index}
                    className={`se-districtmap__lot${built ? ' se-districtmap__lot--built' : ''}`}
                    x={x + w - PAD - (lots.length - index) * 15 + 5}
                    y={y + h - 26}
                    width={10}
                    height={10}
                    rx={1.5}
                  />
                ))}
              </g>

              <g className="se-districtmap__compact">
                {compact.map((line, index) => (
                  <text
                    key={index}
                    className="se-districtmap__compact-name"
                    x={x + w / 2}
                    y={y + h / 2 + 11 + (compact.length === 2 ? (index === 0 ? -17 : 17) : 0)}
                    textAnchor="middle"
                    textLength={fitWidth(line, COMPACT_SIZE, w - 16)}
                    lengthAdjust="spacingAndGlyphs"
                  >
                    {line}
                  </text>
                ))}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
