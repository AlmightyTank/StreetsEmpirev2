import { useState } from 'react';
import { TURF_MAP_ZONES } from '../data/turf-map-zones.js';

export type CityDistrictMapEntry = {
  district: string;
  name: string;
  status: 'mine' | 'held' | 'locals' | 'vacant' | 'pressure' | 'coverage-covered' | 'coverage-warn' | 'coverage-bad';
  statusText: string;
  detail?: string;
};

type MappedDistrictKey = keyof typeof TURF_MAP_ZONES;

const DISTRICT_ORDER: Record<MappedDistrictKey, number> = {
  CASINO: 0,
  NIGHTCLUB: 1,
  LOW_RENT: 2,
  URBAN_GHETTO: 3,
  WINO_SLUMS: 4,
};

const MAP_POSITION: Record<MappedDistrictKey, string> = {
  CASINO: 'casino',
  NIGHTCLUB: 'nightclub',
  LOW_RENT: 'low-rent',
  URBAN_GHETTO: 'urban-ghetto',
  WINO_SLUMS: 'wino-slums',
};

function isMappedDistrict(key: string): key is MappedDistrictKey {
  return Object.hasOwn(TURF_MAP_ZONES, key);
}

export function CityDistrictMap({
  cityName,
  districts,
  selectedDistrict,
  onSelect,
  disabled = false,
}: {
  cityName: string;
  districts: CityDistrictMapEntry[];
  selectedDistrict: string | null;
  onSelect: (district: string) => void;
  disabled?: boolean;
}) {
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null);
  const mappedDistricts = districts
    .filter((entry) => isMappedDistrict(entry.district))
    .sort((a, b) => DISTRICT_ORDER[a.district as MappedDistrictKey] - DISTRICT_ORDER[b.district as MappedDistrictKey]);

  return (
    <div className={`se-citymap${disabled ? ' se-citymap--disabled' : ''}`} role="group" aria-label={`${cityName} district map`}>
      <img className="se-citymap__base" src="/maps/fictional-city-street-map.svg" alt="Fictional city street grid with a river and parks" />
      <svg className="se-citymap__zones" viewBox="0 0 880 700" preserveAspectRatio="none" aria-hidden="true">
        {mappedDistricts.map((entry) => {
          const district = entry.district as MappedDistrictKey;
          const zone = TURF_MAP_ZONES[district];
          const classes = [
            'se-citymap__zone',
            `se-citymap__zone--${MAP_POSITION[district]}`,
            `se-citymap__zone--${entry.status}`,
            selectedDistrict === district ? 'se-citymap__zone--selected' : '',
            hoveredDistrict === district ? 'se-citymap__zone--hovered' : '',
          ].filter(Boolean).join(' ');

          return (
            <path
              key={district}
              d={zone.path}
              className={classes}
              onMouseEnter={() => setHoveredDistrict(district)}
              onMouseLeave={() => setHoveredDistrict((current) => current === district ? null : current)}
              onClick={() => !disabled && onSelect(district)}
            />
          );
        })}
      </svg>
      <div className="se-citymap__districts">
        {mappedDistricts.map((entry, index) => {
          const district = entry.district as MappedDistrictKey;
          const active = selectedDistrict === district || hoveredDistrict === district;
          const zone = TURF_MAP_ZONES[district];
          return (
            <button
              key={district}
              type="button"
              className={`se-citymap__block se-citymap__block--${MAP_POSITION[district]} se-citymap__block--${entry.status}${active ? ' se-citymap__block--visible' : ''}${selectedDistrict === district ? ' se-citymap__block--selected' : ''}`}
              style={{ left: `${zone.x / 880 * 100}%`, top: `${zone.y / 700 * 100}%` }}
              aria-pressed={selectedDistrict === district}
              aria-label={`${entry.name}. ${entry.statusText}${entry.detail ? `. ${entry.detail}` : ''}. Select district.`}
              disabled={disabled}
              onMouseEnter={() => setHoveredDistrict(district)}
              onMouseLeave={() => setHoveredDistrict((current) => current === district ? null : current)}
              onFocus={() => setHoveredDistrict(district)}
              onBlur={() => setHoveredDistrict((current) => current === district ? null : current)}
              onClick={() => onSelect(district)}
            >
              <span className="se-citymap__card">
                <span className="se-citymap__block-number">BLOCK 0{index + 1}</span>
                <strong>{entry.name}</strong>
                <span className="se-citymap__status"><i aria-hidden="true" />{entry.statusText}</span>
                {entry.detail ? <span className="se-citymap__owner">{entry.detail}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
