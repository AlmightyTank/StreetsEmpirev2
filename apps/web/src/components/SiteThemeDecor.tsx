import type { CSSProperties } from 'react';

const snow = [
  ['4%', '-2s', '12s', 5], ['9%', '-7s', '16s', 3], ['14%', '-5s', '13s', 4], ['20%', '-10s', '18s', 6],
  ['27%', '-3s', '15s', 4], ['33%', '-12s', '19s', 3], ['39%', '-6s', '14s', 5], ['45%', '-9s', '17s', 4],
  ['51%', '-1s', '13s', 3], ['57%', '-11s', '18s', 5], ['63%', '-4s', '15s', 4], ['69%', '-8s', '16s', 6],
  ['75%', '-13s', '20s', 3], ['81%', '-5s', '14s', 5], ['87%', '-9s', '17s', 4], ['93%', '-2s', '13s', 3],
] as const;

const bats = [
  ['12%', '18%', '-1s', '11s'], ['26%', '11%', '-6s', '14s'], ['48%', '20%', '-3s', '13s'],
  ['67%', '13%', '-8s', '16s'], ['84%', '23%', '-4s', '12s'],
] as const;

const lightThemes = new Set([
  'neon-vice',
  'motor-city-iron',
  'rain-city-wire',
  'open-road',
  'blue-heat',
  'back-office',
]);

function AmbientTheme({ themeKey }: { themeKey: string }) {
  return (
    <div className={`se-site-theme-decor se-site-theme-decor--ambient se-site-theme-decor--${themeKey}`} aria-hidden="true">
      <i className="se-theme-ambient__line se-theme-ambient__line--1" />
      <i className="se-theme-ambient__line se-theme-ambient__line--2" />
      <i className="se-theme-ambient__mark se-theme-ambient__mark--1" />
      <i className="se-theme-ambient__mark se-theme-ambient__mark--2" />
    </div>
  );
}

function WinterLights() {
  return (
    <div className="se-site-theme-decor se-site-theme-decor--winter" aria-hidden="true">
      <div className="se-theme-lights">
        {Array.from({ length: 22 }, (_, index) => (
          <i className={`se-theme-light se-theme-light--${index % 4}`} key={index} />
        ))}
      </div>
      <div className="se-theme-snow">
        {snow.map(([left, delay, duration, size], index) => (
          <i
            className="se-theme-snowflake"
            key={index}
            style={{ left, animationDelay: delay, animationDuration: duration, width: size, height: size } as CSSProperties}
          />
        ))}
      </div>
      <div className="se-theme-winter-horizon">
        <span className="se-theme-pine se-theme-pine--1" />
        <span className="se-theme-pine se-theme-pine--2" />
        <span className="se-theme-pine se-theme-pine--3" />
        <span className="se-theme-snowman">
          <i className="se-theme-snowman__head" />
          <i className="se-theme-snowman__body" />
          <i className="se-theme-snowman__base" />
        </span>
      </div>
    </div>
  );
}

function HalloweenMoon() {
  return (
    <div className="se-site-theme-decor se-site-theme-decor--halloween" aria-hidden="true">
      <div className="se-theme-moon">
        <span className="se-theme-witch">
          <i className="se-theme-witch__hat" />
          <i className="se-theme-witch__body" />
          <i className="se-theme-witch__broom" />
        </span>
      </div>
      <div className="se-theme-bats">
        {bats.map(([left, top, delay, duration], index) => (
          <i
            className="se-theme-bat"
            key={index}
            style={{ left, top, animationDelay: delay, animationDuration: duration } as CSSProperties}
          />
        ))}
      </div>
      <div className="se-theme-fog se-theme-fog--1" />
      <div className="se-theme-fog se-theme-fog--2" />
      <div className="se-theme-halloween-horizon">
        <span className="se-theme-grave se-theme-grave--1" />
        <span className="se-theme-grave se-theme-grave--2" />
        <span className="se-theme-bare-tree" />
      </div>
    </div>
  );
}

export function SiteThemeDecor({ themeKey }: { themeKey: string | null }) {
  if (themeKey === 'winter-lights') return <WinterLights />;
  if (themeKey === 'halloween-moon') return <HalloweenMoon />;
  if (themeKey && lightThemes.has(themeKey)) return <AmbientTheme themeKey={themeKey} />;
  return null;
}
