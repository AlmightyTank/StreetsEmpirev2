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

const DragonScene = lazy(() => import('./theme-scenes/DragonScene.js'));

function DragonAtmosphere({ fire = false }: { fire?: boolean }) {
  return (
    <div className={`se-site-theme-decor se-site-theme-decor--dragon${fire ? ' se-site-theme-decor--fire' : ' se-site-theme-decor--ice'}`} aria-hidden="true">
      <Suspense fallback={null}><DragonScene variant={fire ? 'fire' : 'ice'} /></Suspense>
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

// Illustrated SVG backdrops for the eight redesigned shells, loaded only for the shell that is equipped.
const themeScenes: Partial<Record<string, ComponentType>> = {
  'motor-city-iron': lazy(() => import('./theme-scenes/ChromeSerpentScene.js')),
  'open-road': lazy(() => import('./theme-scenes/PhantomConvoyScene.js')),
  'neon-vice': lazy(() => import('./theme-scenes/LanternDistrictScene.js')),
  'blue-heat': lazy(() => import('./theme-scenes/SirenBreakerScene.js')),
  'rain-city-wire': lazy(() => import('./theme-scenes/BlockSovereignScene.js')),
  'casino-floor': lazy(() => import('./theme-scenes/GildedHouseScene.js')),
  'federal-case': lazy(() => import('./theme-scenes/DeadOrAliveScene.js')),
  'midnight-market': lazy(() => import('./theme-scenes/LaurelAscendantScene.js')),
};

function ThemeSceneAtmosphere({ themeKey, Scene }: { themeKey: string; Scene: ComponentType }) {
  return (
    <div className={`se-site-theme-decor se-site-theme-decor--scene se-site-theme-decor--${themeKey}`} aria-hidden="true">
      <Suspense fallback={null}><Scene /></Suspense>
      <div className="se-theme-pack__haze" />
    </div>
  );
}

export function SiteThemeDecor({ themeKey }: { themeKey: string | null }) {
  if (themeKey === 'winter-lights') return <WinterLights />;
  if (themeKey === 'halloween-moon') return <HalloweenMoon />;
  if (themeKey === 'dragon-ice') return <DragonAtmosphere />;
  if (themeKey === 'dragon-fire') return <DragonAtmosphere fire />;
  const Scene = themeKey ? themeScenes[themeKey] : undefined;
  return themeKey && Scene ? <ThemeSceneAtmosphere themeKey={themeKey} Scene={Scene} /> : null;
}
