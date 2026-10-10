import { lazy, Suspense, type ComponentType, type CSSProperties } from 'react';

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

const dragonParticles = [
  ['5%', '-2s', '13s', 4], ['12%', '-8s', '17s', 3], ['19%', '-5s', '15s', 5],
  ['27%', '-11s', '19s', 3], ['35%', '-3s', '14s', 4], ['43%', '-9s', '18s', 5],
  ['51%', '-1s', '16s', 3], ['59%', '-12s', '20s', 4], ['67%', '-6s', '15s', 5],
  ['75%', '-10s', '18s', 3], ['83%', '-4s', '14s', 4], ['91%', '-7s', '17s', 5],
] as const;

function DragonAtmosphere({ fire = false }: { fire?: boolean }) {
  return (
    <div className={`se-site-theme-decor se-site-theme-decor--dragon${fire ? ' se-site-theme-decor--fire' : ' se-site-theme-decor--ice'}`} aria-hidden="true">
      <img
        className="se-dragon-atmosphere__art"
        src={fire ? '/profile-frames/inferno-popup.webp' : '/profile-frames/snowstorm-popup.webp'}
        alt=""
      />
      <div className="se-dragon-atmosphere__particles">
        {dragonParticles.map(([left, delay, duration, size], index) => (
          <i
            key={index}
            style={{ left, animationDelay: delay, animationDuration: duration, width: size, height: size } as CSSProperties}
          />
        ))}
      </div>
      <div className="se-dragon-atmosphere__haze" />
    </div>
  );
}

const themeMotes = [
  ['6%', '22%', '-2s'], ['15%', '61%', '-7s'], ['24%', '35%', '-4s'], ['33%', '78%', '-10s'],
  ['42%', '17%', '-6s'], ['51%', '54%', '-1s'], ['60%', '82%', '-9s'], ['69%', '29%', '-5s'],
  ['78%', '66%', '-11s'], ['87%', '40%', '-3s'], ['95%', '73%', '-8s'],
] as const;

// Illustrated SVG backdrops, loaded only for the shell that is equipped. A pack with a
// scene drops the generic motif and motes in favour of its own.
const themeScenes: Partial<Record<string, ComponentType>> = {
  'federal-case': lazy(() => import('./theme-scenes/DeadOrAliveScene.js')),
};

function ThemePackAtmosphere({ themeKey }: { themeKey: string }) {
  const Scene = themeScenes[themeKey];
  return (
    <div className={`se-site-theme-decor se-site-theme-decor--theme-pack se-site-theme-decor--${themeKey}${Scene ? ' se-site-theme-decor--scene' : ''}`} aria-hidden="true">
      {Scene ? <Suspense fallback={null}><Scene /></Suspense> : null}
      <div className="se-theme-pack__motif" />
      <div className="se-theme-pack__motes">
        {themeMotes.map(([left, top, delay], index) => (
          <i key={index} style={{ left, top, animationDelay: delay } as CSSProperties} />
        ))}
      </div>
      <div className="se-theme-pack__haze" />
    </div>
  );
}

export function SiteThemeDecor({ themeKey }: { themeKey: string | null }) {
  if (themeKey === 'winter-lights') return <WinterLights />;
  if (themeKey === 'halloween-moon') return <HalloweenMoon />;
  if (themeKey === 'dragon-ice') return <DragonAtmosphere />;
  if (themeKey === 'dragon-fire') return <DragonAtmosphere fire />;
  if (themeKey && ['motor-city-iron', 'open-road', 'neon-vice', 'blue-heat', 'rain-city-wire', 'casino-floor', 'federal-case', 'midnight-market'].includes(themeKey)) {
    return <ThemePackAtmosphere themeKey={themeKey} />;
  }
  return null;
}
