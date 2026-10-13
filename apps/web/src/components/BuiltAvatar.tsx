import { useId, type ReactNode } from 'react';
import { avatarColor, type AvatarParts } from '@streets/shared';

/**
 * Draws an avatar built from face pieces in the same hand as the item and
 * contact portraits (apps/web/public/portraits): a 128×128 canvas, gradient
 * shading, dark ink outlines, a soft drop shadow and rim highlights, with the
 * head, eyes and shoulders on the portraits' grid so the two sit together.
 */
export function BuiltAvatar({ parts, className }: { parts: AvatarParts; className?: string }) {
  // Gradient ids are per drawing, so many avatars on one page keep their own colors.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ref = (name: string) => `url(#${uid}-${name})`;
  const girl = parts.base === 'girl';
  const skin = avatarColor('skin', parts.skin);
  const hair = avatarColor('hairColor', parts.hairColor);
  const shirt = avatarColor('shirtColor', parts.shirtColor);
  const mask = avatarColor('maskColor', parts.maskColor);
  const body = girl ? GIRL_BODY : BOY_BODY;
  const ctx: Ctx = { ref, girl, skin, hair, shirt, mask, body };
  // A ski mask hides the hair under it; long hair still falls out the back.
  const hairHidden = parts.mask === 'ski-mask';

  return (
    <svg
      className={`se-built-avatar${className ? ` ${className}` : ''}`}
      viewBox="0 0 128 128"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity=".6" />
        </filter>
        <radialGradient id={`${uid}-skin`} cx=".42" cy=".35" r=".75">
          <stop offset="0" stopColor={shade(skin, 0.14)} />
          <stop offset=".7" stopColor={skin} />
          <stop offset="1" stopColor={shade(skin, -0.32)} />
        </radialGradient>
        <Vertical id={`${uid}-hair`} from={shade(hair, 0.22)} to={shade(hair, -0.38)} />
        <Vertical id={`${uid}-shirt`} from={shade(shirt, 0.16)} to={shade(shirt, -0.38)} />
        <Vertical id={`${uid}-shirt-dark`} from={shade(shirt, -0.12)} to={shade(shirt, -0.5)} />
        <Vertical id={`${uid}-mask`} from={shade(mask, 0.18)} to={shade(mask, -0.4)} />
        <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".45" />
        </linearGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset=".5" stopColor="#e8b93a" />
          <stop offset="1" stopColor="#8a6508" />
        </linearGradient>
        <linearGradient id={`${uid}-steel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eef2f8" />
          <stop offset=".5" stopColor="#a8b0bc" />
          <stop offset="1" stopColor="#5a626e" />
        </linearGradient>
        <linearGradient id={`${uid}-lens`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2d3a33" />
          <stop offset=".5" stopColor="#0b0f0d" />
          <stop offset="1" stopColor="#1c2a22" />
        </linearGradient>
        <radialGradient id={`${uid}-blush`}>
          <stop offset="0" stopColor="#e0606a" stopOpacity=".45" />
          <stop offset="1" stopColor="#e0606a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-vignette`} cx=".5" cy=".42" r=".72">
          <stop offset=".55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".62" />
        </radialGradient>
        <BackgroundDefs id={`${uid}-bg`} background={parts.background} />
      </defs>

      <Background background={parts.background} ctx={ctx} />

      <g filter={ref('shadow')} stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
        {!hairHidden || LONG_HAIR.has(parts.hair) ? <HairBack style={parts.hair} ctx={ctx} /> : null}
        <Shirt style={parts.shirt} ctx={ctx} />
        <path d={EARS} fill={ref('skin')} />
        <path d={girl ? GIRL_HEAD : BOY_HEAD} fill={ref('skin')} />
      </g>
      <path d={bodyPath(body)} fill={ref('shade')} />
      <path d={`M${body.left + 12} 104 Q${body.left + 18} 96 ${body.left + 28} 93`} stroke={shade(shirt, 0.5)} strokeOpacity=".5" strokeWidth="1.6" fill="none" strokeLinecap="round" />

      <Face parts={parts} ctx={ctx} />

      <g filter={ref('shadow')} stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
        {hairHidden ? null : <HairFront style={parts.hair} ctx={ctx} />}
        <Mask style={parts.mask} ctx={ctx} />
      </g>
      {hairHidden ? null : <HairShine style={parts.hair} ctx={ctx} />}
      <Accessory style={parts.accessory} ctx={ctx} />
    </svg>
  );
}

/** A photo when there is one, else a built avatar, else the given fallback (usually initials). */
export function AvatarFace({ imageUrl, avatar, fallback }: {
  imageUrl: string | null | undefined;
  avatar: AvatarParts | null | undefined;
  fallback: ReactNode;
}) {
  if (imageUrl) return <img src={imageUrl} alt="" />;
  if (avatar) return <BuiltAvatar parts={avatar} />;
  return <>{fallback}</>;
}

const AVATAR_FRAME_ART: Record<string, string> = {
  'street-pass-s1-frame': '/items/street-pass-s1-frame.svg',
  'chrome-serpent-frame': '/items/street-pass-s1-chrome-serpent-frame.svg',
  'phantom-convoy-frame': '/items/street-pass-s1-phantom-convoy-frame.svg',
  'lantern-district-frame': '/items/street-pass-s1-lantern-district-frame.svg',
  'siren-breaker-frame': '/items/street-pass-s1-siren-breaker-frame.svg',
  'block-sovereign-frame': '/items/street-pass-s1-block-sovereign-frame.svg',
  'gilded-house-frame': '/items/street-pass-s1-gilded-house-frame.svg',
  'dead-or-alive-frame': '/items/street-pass-s1-dead-or-alive-frame.svg',
  'laurel-ascendant-frame': '/items/street-pass-s1-laurel-ascendant-frame.svg',
  'snowstorm-drake': '/items/street-pass-s1-snowstorm-frame.svg',
  'inferno-drake': '/items/street-pass-s1-inferno-frame.svg',
  'midnight-chrome-frame': '/profile-frames/midnight-chrome-avatar.webp',
};

/** The saved face together with its equipped frame, sized to fill any avatar holder. */
export function AvatarPortrait({ imageUrl, avatar, fallback, frameKey }: {
  imageUrl: string | null | undefined;
  avatar: AvatarParts | null | undefined;
  fallback: ReactNode;
  frameKey: string | null | undefined;
}) {
  if (!frameKey) return <AvatarFace imageUrl={imageUrl} avatar={avatar} fallback={fallback} />;

  const frameArt = AVATAR_FRAME_ART[frameKey];
  return (
    <span
      className={`se-avatar-portrait${frameArt ? ' se-avatar-portrait--art' : ' se-avatar-frame'}`}
      data-avatar-frame={frameKey}
    >
      <span className="se-avatar-portrait__face">
        <AvatarFace imageUrl={imageUrl} avatar={avatar} fallback={fallback} />
      </span>
      {frameArt ? <img className="se-avatar-portrait__art" src={frameArt} alt="" /> : null}
    </span>
  );
}

const INK = '#07100a';

type Body = { left: number; shoulderX: number; shoulderY: number; neckX: number; neckY: number; neck: string };
type Ctx = {
  ref: (name: string) => string;
  girl: boolean;
  skin: string;
  hair: string;
  shirt: string;
  mask: string;
  body: Body;
};

const BOY_BODY: Body = { left: 8, shoulderX: 32, shoulderY: 90, neckX: 54, neckY: 86, neck: 'M56 70 H72 V90 Q64 95 56 90 Z' };
const GIRL_BODY: Body = { left: 18, shoulderX: 38, shoulderY: 92, neckX: 55, neckY: 88, neck: 'M57.5 70 H70.5 V90 Q64 94 57.5 90 Z' };

const BOY_HEAD = 'M45 52 Q45 32 64 32 Q83 32 83 52 Q83 66 77 73 Q71 79 64 79 Q57 79 51 73 Q45 66 45 52 Z';
const GIRL_HEAD = 'M46 52 Q46 33 64 33 Q82 33 82 52 Q82 64 77 71 Q71 78 64 78 Q57 78 51 71 Q46 64 46 52 Z';
const EARS = 'M46 54 Q41 52 42 59 Q43 66 47 66 Z M82 54 Q87 52 86 59 Q85 66 81 66 Z';

function bodyPath({ left, shoulderX, shoulderY, neckX, neckY }: Body): string {
  return `M${left} 126 Q${left + 2} 98 ${shoulderX} ${shoulderY} L${neckX} ${neckY} Q64 ${neckY + 4} ${128 - neckX} ${neckY} `
    + `L${128 - shoulderX} ${shoulderY} Q${126 - left} 98 ${128 - left} 126 Z`;
}

function Vertical({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={from} />
      <stop offset="1" stopColor={to} />
    </linearGradient>
  );
}

/** Draws its children on the left of the face and again flipped onto the right. */
function Mirrored({ children }: { children: ReactNode }) {
  return (
    <>
      <g>{children}</g>
      <g transform="translate(128 0) scale(-1 1)">{children}</g>
    </>
  );
}

/* Backgrounds ------------------------------------------------------------ */

const SPOTLIGHTS: Record<string, string> = {
  teal: '#1f6f6a',
  charcoal: '#3a414b',
  crimson: '#8a2232',
  gold: '#b8892a',
  violet: '#55429a',
  sky: '#3d7eb8',
  concrete: '#8c8f94',
};

function BackgroundDefs({ id, background }: { id: string; background: AvatarParts['background'] }) {
  const color = SPOTLIGHTS[background];
  if (color) {
    return (
      <radialGradient id={id} cx=".5" cy=".36" r=".72">
        <stop offset="0" stopColor={shade(color, 0.22)} />
        <stop offset=".5" stopColor={color} />
        <stop offset="1" stopColor={shade(color, -0.7)} />
      </radialGradient>
    );
  }
  if (background === 'brick') return <Vertical id={id} from="#8a3f2a" to="#4a1e14" />;
  if (background === 'city') return <Vertical id={id} from="#0b1024" to="#3a2a62" />;
  return null;
}

function Background({ background, ctx }: { background: AvatarParts['background']; ctx: Ctx }) {
  const { ref } = ctx;
  if (background === 'none') return null;
  if (SPOTLIGHTS[background]) {
    return (
      <>
        <rect width="128" height="128" fill={ref('bg')} />
        <ellipse cx="64" cy="122" rx="56" ry="10" fill="#000" opacity=".25" />
      </>
    );
  }
  if (background === 'brick') {
    const rows = Array.from({ length: 13 }, (_, row) => row * 10);
    return (
      <>
        <rect width="128" height="128" fill={ref('bg')} />
        <g stroke="#2a0f08" strokeWidth="1.4" opacity=".85">
          {rows.map((y) => <path key={`row-${y}`} d={`M0 ${y} H128`} />)}
          {rows.map((y, row) => Array.from({ length: 8 }, (_, col) => col * 20 + (row % 2 ? 10 : 0)).map((x) => (
            <path key={`${x}-${y}`} d={`M${x} ${y} V${y + 10}`} />
          )))}
        </g>
        <g fill="#c0684a" opacity=".22">
          {rows.map((y, row) => <rect key={y} x={(row * 37) % 110} y={y + 2} width="16" height="3" rx="1" />)}
        </g>
        <rect width="128" height="128" fill={ref('vignette')} />
      </>
    );
  }
  // City at night: a moon, a skyline and lit windows.
  const towers = [[0, 66, 18], [16, 50, 16], [30, 74, 14], [92, 58, 16], [106, 44, 22]] as const;
  return (
    <>
      <rect width="128" height="128" fill={ref('bg')} />
      <circle cx="104" cy="22" r="14" fill="#f4eccf" opacity=".12" />
      <circle cx="104" cy="22" r="8" fill="#f4eccf" stroke={INK} strokeWidth="1" />
      <g fill="#fff" opacity=".7">
        <circle cx="20" cy="16" r=".9" /><circle cx="44" cy="10" r=".7" /><circle cx="78" cy="14" r=".8" /><circle cx="60" cy="24" r=".6" />
      </g>
      <g fill="#141a2e" stroke={INK} strokeWidth="1.2">
        {towers.map(([x, top, width]) => <rect key={x} x={x} y={top} width={width} height={128 - top} />)}
      </g>
      <g fill="#f7d774" opacity=".85">
        {towers.flatMap(([x, top, width]) => Array.from({ length: 6 }, (_, index) => (
          (index * 7 + x) % 3 === 0 ? null : <rect key={`${x}-${index}`} x={x + 3 + (index % 2) * (width - 9)} y={top + 6 + Math.floor(index / 2) * 9} width="3.4" height="4" />
        )))}
      </g>
      <rect width="128" height="128" fill={ref('vignette')} />
    </>
  );
}

/* Clothes ---------------------------------------------------------------- */

function Shirt({ style, ctx }: { style: AvatarParts['shirt']; ctx: Ctx }) {
  const { ref, body, shirt } = ctx;
  const neck = <path d={body.neck} fill={ref('skin')} />;
  const crewCollar = <path d={`M${body.neckX} ${body.neckY} Q64 ${body.neckY + 10} ${128 - body.neckX} ${body.neckY} L${129.5 - body.neckX} ${body.neckY + 2.6} Q64 ${body.neckY + 14} ${body.neckX - 1.5} ${body.neckY + 2.6} Z`} fill={ref('shirt-dark')} />;
  const folds = <path d="M38 106 Q42 114 40 126 M90 106 Q86 114 88 126" fill="none" stroke={shade(shirt, -0.45)} strokeOpacity=".5" strokeWidth="1.2" />;

  switch (style) {
    case 'tank':
      return (
        <>
          <path d={bodyPath(body)} fill={ref('skin')} />
          <BareArms body={body} skin={ctx.skin} />
          {neck}
          <path d={`M${body.left + 17} 126 Q${body.left + 20} 106 46 94 L51 92 Q64 107 77 92 L82 94 Q${108 - body.left} 106 ${111 - body.left} 126 Z`} fill={ref('shirt')} />
          <path d="M51 92 Q64 107 77 92" fill="none" stroke={shade(shirt, -0.45)} strokeWidth="1.2" />
          {folds}
        </>
      );
    case 'jersey':
      return (
        <>
          <path d={bodyPath(body)} fill={ref('skin')} />
          <BareArms body={body} skin={ctx.skin} />
          {neck}
          <path d={`M${body.left + 14} 126 Q${body.left + 17} 105 42 93 L54 88 L64 100 L74 88 L86 93 Q${111 - body.left} 105 ${114 - body.left} 126 Z`} fill={ref('shirt')} />
          <path d={`M${body.left + 14} 126 Q${body.left + 17} 105 42 93 M86 93 Q${111 - body.left} 105 ${114 - body.left} 126 M54 88 L64 100 L74 88`} fill="none" stroke={contrast(shirt)} strokeWidth="2.4" />
          <text x="64" y="121" textAnchor="middle" fontSize="16" fontWeight="900" fontFamily="Arial Black, Arial, sans-serif" fill={contrast(shirt)} stroke={INK} strokeWidth="1" paintOrder="stroke">1</text>
          {folds}
        </>
      );
    case 'hoodie':
      return (
        <>
          <path d={bodyPath(body)} fill={ref('shirt')} />
          <path d="M38 92 Q40 80 56 81 L64 94 L72 81 Q88 80 90 92 Q80 103 64 104 Q48 103 38 92 Z" fill={ref('shirt-dark')} />
          {neck}
          <path d="M58 99 L57 113 M70 99 L71 113" fill="none" stroke={shade(shirt, 0.55)} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M44 122 Q64 114 84 122" fill="none" stroke={shade(shirt, -0.45)} strokeOpacity=".6" strokeWidth="1.2" />
          {folds}
        </>
      );
    case 'collar': {
      // An open neck: a skin V under the neck, a collar standing round it, and a button placket.
      const x = body.neckX - 54;
      const y = body.neckY - 86;
      return (
        <>
          <path d={bodyPath(body)} fill={ref('shirt')} />
          <path d={`M${body.neckX} ${body.neckY} L64 ${body.neckY + 14} L${128 - body.neckX} ${body.neckY} Z`} fill={ref('skin')} />
          {neck}
          <Mirrored>
            <path d={`M${55.5 + x} ${81 + y} L${44 + x} ${97 + y} L${61 + x} ${98.6 + y} L${54.6 + x} ${86.6 + y} Z`} fill={shade(shirt, 0.2)} />
          </Mirrored>
          <path d={`M64 ${body.neckY + 14} V126`} fill="none" stroke={shade(shirt, -0.45)} strokeWidth="1.2" />
          <g fill="#e6e9ee" stroke={INK} strokeWidth=".6"><circle cx="64" cy={body.neckY + 20} r="1.3" /><circle cx="64" cy={body.neckY + 29} r="1.3" /></g>
          <path d="M42 118 Q48 112 50 102 M86 118 Q80 112 78 102" fill="none" stroke={shade(shirt, 0.4)} strokeOpacity=".35" strokeWidth="1.2" />
          {folds}
        </>
      );
    }
    case 'jacket': {
      const inner = luminance(shirt) > 0.7 ? '#1f2228' : '#eceff2';
      return (
        <>
          <path d={bodyPath(body)} fill={ref('shirt')} />
          <path d={`M${body.neckX} ${body.neckY} Q64 ${body.neckY + 4} ${128 - body.neckX} ${body.neckY} L71 126 L57 126 Z`} fill={inner} />
          {neck}
          <path d={`M${body.neckX} ${body.neckY} Q64 ${body.neckY + 9} ${128 - body.neckX} ${body.neckY}`} fill="none" stroke={shade(inner, -0.3)} strokeWidth="2" />
          <path d={`M${body.neckX} ${body.neckY} L46 98 L53 101 L57 126 Z M${128 - body.neckX} ${body.neckY} L82 98 L75 101 L71 126 Z`} fill={ref('shirt-dark')} />
          {folds}
        </>
      );
    }
    case 'tee':
    default:
      return (
        <>
          <path d={bodyPath(body)} fill={ref('shirt')} />
          {neck}
          {crewCollar}
          {folds}
        </>
      );
  }
}

/** Upper arms for sleeveless tops: shoulder caps and the crease where each arm meets the chest. */
function BareArms({ body, skin }: { body: Body; skin: string }) {
  const crease = shade(skin, -0.35);
  return (
    <Mirrored>
      <path d={`M${body.left + 12} 126 Q${body.left + 11} 110 ${body.left + 15} 100`} fill="none" stroke={crease} strokeWidth="1.4" strokeLinecap="round" />
      <path d={`M${body.left + 4} 110 Q${body.left + 8} ${body.shoulderY + 5} ${body.shoulderX - 4} ${body.shoulderY + 1}`} fill="none" stroke={shade(skin, 0.4)} strokeOpacity=".5" strokeWidth="1.6" strokeLinecap="round" />
    </Mirrored>
  );
}

/* Face ------------------------------------------------------------------- */

function Face({ parts, ctx }: { parts: AvatarParts; ctx: Ctx }) {
  const { ref, girl, skin } = ctx;
  const eyeColor = avatarColor('eyeColor', parts.eyeColor);
  return (
    <>
      <Mirrored>
        <Eye style={parts.eyes} iris={eyeColor} lashes={girl} ctx={ctx} />
        <Brow style={parts.brows} color={browColor(ctx.hair)} />
      </Mirrored>
      <Nose style={parts.nose} color={shade(skin, -0.45)} />
      {girl ? (
        <>
          <ellipse cx="51" cy="62" rx="4" ry="2.4" fill={ref('blush')} />
          <ellipse cx="77" cy="62" rx="4" ry="2.4" fill={ref('blush')} />
        </>
      ) : null}
      <FacialHair style={parts.facialHair} ctx={ctx} />
      <Mouth style={parts.mouth} girl={girl} />
    </>
  );
}

function Eye({ style, iris, lashes, ctx }: { style: AvatarParts['eyes']; iris: string; lashes: boolean; ctx: Ctx }) {
  const lid = '#0b0604';
  const pupil = (cy: number, r: number) => (
    <>
      <circle cx="56" cy={cy} r={r} fill={iris} />
      <circle cx="56" cy={cy} r={r * 0.42} fill="#0b0b0b" />
      <circle cx="56.8" cy={cy - 0.9} r=".6" fill="#fff" />
    </>
  );
  let eye: ReactNode;
  switch (style) {
    case 'happy':
      eye = <path d="M50.6 55.4 Q56 50 61.4 55.4" fill="none" stroke={lid} strokeWidth="1.9" strokeLinecap="round" />;
      break;
    case 'round':
    case 'wide': {
      const [rx, ry, r] = style === 'wide' ? [4.8, 4.2, 2.8] : [4, 3.4, 2.4];
      eye = (
        <>
          <ellipse cx="56" cy="54" rx={rx} ry={ry} fill="#fbf6ee" stroke={INK} strokeWidth="1" />
          {pupil(54, r)}
          <path d={`M${56 - rx - 0.4} ${54 - 0.6} Q56 ${54 - ry - 1.6} ${56 + rx + 0.4} ${54 - 0.6}`} fill="none" stroke={lid} strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
      break;
    }
    case 'narrow':
      eye = (
        <>
          <path d="M51 54.4 Q56 52 61 54.4 Q56 56.2 51 54.4 Z" fill="#fbf6ee" stroke={INK} strokeWidth="1" />
          <circle cx="56" cy="54.3" r="1.7" fill={iris} />
          <circle cx="56" cy="54.3" r=".8" fill="#0b0b0b" />
          <path d="M50.4 54.6 Q56 51.2 61.6 54.6" fill="none" stroke={lid} strokeWidth="1.9" strokeLinecap="round" />
        </>
      );
      break;
    case 'sleepy':
      eye = (
        <>
          <path d="M51 54 Q56 50.4 61 54 Q56 56.88 51 54 Z" fill="#fbf6ee" stroke={INK} strokeWidth="1" />
          {pupil(54.4, 2.4)}
          <path d="M50.4 54.6 Q56 49.4 61.6 54.6 Q56 53.4 50.4 54.6 Z" fill={ctx.ref('skin')} />
          <path d="M50.4 54.6 Q56 53.4 61.6 54.6" fill="none" stroke={lid} strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
      break;
    case 'almond':
    default:
      eye = (
        <>
          <path d="M51 54 Q56 50.4 61 54 Q56 56.88 51 54 Z" fill="#fbf6ee" stroke={INK} strokeWidth="1" />
          {pupil(54, 2.4)}
          <path d="M50.5 54.3 Q56 49.8 61.5 54.3" fill="none" stroke={lid} strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
  }
  return (
    <>
      {eye}
      {lashes ? <path d="M51 54 l-1.8 -1.6 M52.6 52.6 l-1.4 -1.8" stroke={lid} strokeWidth=".8" strokeLinecap="round" /> : null}
    </>
  );
}

function Brow({ style, color }: { style: AvatarParts['brows']; color: string }) {
  const brows: Record<AvatarParts['brows'], [string, number]> = {
    soft: ['M50 47.6 Q55 45.2 61 47', 2.2],
    straight: ['M50 46.6 L61 46.4', 2.6],
    arched: ['M50 48 Q53.6 43.4 61 46.6', 2],
    thick: ['M49.6 47.4 Q55 44.2 61.4 46.6', 3.6],
    angry: ['M50 45 L61.4 48.4', 2.8],
  };
  const [d, width] = brows[style];
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />;
}

function Nose({ style, color }: { style: AvatarParts['nose']; color: string }) {
  const noses: Record<AvatarParts['nose'], string> = {
    button: 'M62 61 Q64 64 66 61',
    round: 'M60.6 59.4 Q59.4 63.4 62.2 63.2 Q64 64.6 65.8 63.2 Q68.6 63.4 67.4 59.4',
    wide: 'M59.4 60 Q57.6 64 61.4 63.8 Q64 65.2 66.6 63.8 Q70.4 64 68.6 60',
    pointed: 'M64.6 53 L67.4 61.6 Q65 63.4 62 62',
    small: 'M62.8 61.6 Q64 63 65.2 61.6',
  };
  return <path d={noses[style]} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />;
}

const LIPS_UPPER = 'M57.5 68 Q60.5 66 63 66.8 Q64 67.2 65 66.8 Q67.5 66 70.5 68 Q64 69.4 57.5 68 Z';
const LIPS_LOWER = 'M57.8 68.2 Q64 74 70.2 68.2 Q68 72.6 64 73 Q60 72.6 57.8 68.2 Z';

function Mouth({ style, girl }: { style: AvatarParts['mouth']; girl: boolean }) {
  const lip = girl ? '#b8384a' : '#5a2a1e';
  switch (style) {
    case 'grin':
      return (
        <>
          <path d="M57 67 Q64 69 71 67 Q69 74 64 74 Q59 74 57 67 Z" fill="#3a0a12" stroke="#2a140a" strokeWidth="1" />
          <path d="M57.8 67.4 Q64 69.2 70.2 67.4 Q69.6 69.8 64 70 Q58.4 69.8 57.8 67.4 Z" fill="#f4ecd2" />
        </>
      );
    case 'laugh':
      return (
        <>
          <path d="M56.4 66.4 Q64 68.6 71.6 66.4 Q70 77 64 77 Q58 77 56.4 66.4 Z" fill="#3a0a12" stroke="#2a140a" strokeWidth="1" />
          <path d="M60 74 Q64 71.4 68 74 Q64 76.4 60 74 Z" fill="#d9646c" />
          <path d="M57.2 66.8 Q64 69 70.8 66.8 Q70.2 69.4 64 69.6 Q57.8 69.4 57.2 66.8 Z" fill="#f4ecd2" />
        </>
      );
    case 'smile':
      return girl ? (
        <>
          <path d={LIPS_UPPER} fill={lip} stroke="#4a0a14" strokeWidth=".7" />
          <path d={LIPS_LOWER} fill={lip} stroke="#4a0a14" strokeWidth=".7" />
          <path d="M61.5 71.6 Q64 72.2 66.5 71.6" stroke="#fff" strokeOpacity=".5" strokeWidth=".8" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M57.6 67.6 Q64 72.8 70.4 67.6" fill="none" stroke={lip} strokeWidth="1.7" strokeLinecap="round" />
          <path d="M61.6 72.6 Q64 73.4 66.4 72.6" fill="none" stroke={lip} strokeOpacity=".45" strokeWidth="1" strokeLinecap="round" />
        </>
      );
    default: {
      const lines: Record<string, string> = {
        smirk: 'M58.6 69.4 Q64 70.6 70 67.2',
        neutral: 'M58.6 69.2 Q64 69.9 69.4 69.2',
        serious: 'M58.4 70.4 Q64 67.8 69.6 70.4',
      };
      return <path d={lines[style]} fill="none" stroke={lip} strokeWidth={girl ? 2.2 : 1.7} strokeLinecap="round" />;
    }
  }
}

const MUSTACHE = 'M56.4 67 Q59 62.6 64 64.6 Q69 62.6 71.6 67 Q68 65.6 64 66.2 Q60 65.6 56.4 67 Z';

function FacialHair({ style, ctx }: { style: AvatarParts['facialHair']; ctx: Ctx }) {
  const { ref, hair } = ctx;
  switch (style) {
    case 'stubble':
      return (
        <g fill={hair} opacity=".32">
          <path d="M45.4 58 Q46 68 51 73 Q57 79 64 79 Q71 79 77 73 Q82 68 82.6 58 Q80 68 74 71 Q69 73.4 64 73.4 Q59 73.4 54 71 Q48 68 45.4 58 Z" />
          <path d="M57 65.6 Q64 63.4 71 65.6 Q64 67 57 65.6 Z" />
        </g>
      );
    case 'mustache':
      return <path d={MUSTACHE} fill={ref('hair')} stroke={INK} strokeWidth=".8" />;
    case 'goatee':
      return (
        <g fill={ref('hair')} stroke={INK} strokeWidth=".8">
          <path d={MUSTACHE} />
          <path d="M59.4 73.4 Q64 72.4 68.6 73.4 L67.6 79.4 Q64 82 60.4 79.4 Z" />
        </g>
      );
    case 'beard':
      return (
        <g fill={ref('hair')} stroke={INK} strokeWidth=".8">
          <path d="M45 55 Q45 68 51 74.4 Q57 81.6 64 81.6 Q71 81.6 77 74.4 Q83 68 83 55 L80.4 55 Q79.4 66 73 70 Q69 72.4 64 72.4 Q59 72.4 55 70 Q48.6 66 47.6 55 Z" />
          <path d={MUSTACHE} />
        </g>
      );
    default:
      return null;
  }
}

/* Hair ------------------------------------------------------------------- */

const LONG_HAIR = new Set<AvatarParts['hair']>(['long-straight', 'long-curls', 'braids', 'ponytail', 'pigtails', 'locs']);

/** Loc strands as [x, length], left to right behind the head. */
const LOCS = [[38, 50], [42.5, 56], [47, 60], [76, 60], [80.5, 56], [85, 50]] as const;

/** A hairline cap over the top of the head, shared by several styles. */
const CAP = 'M44 50 Q42 28 64 27 Q86 28 84 50 Q80 40 64 40 Q48 40 44 50 Z';
const BUZZ = 'M44.6 50 Q44 31 64 30.6 Q84 31 83.4 50 Q80 41 64 40 Q48 41 44.6 50 Z';

/** Hair that sits behind the head and shoulders. */
function HairBack({ style, ctx }: { style: AvatarParts['hair']; ctx: Ctx }) {
  const fill = ctx.ref('hair');
  switch (style) {
    case 'long-straight':
      return <path d="M42 52 Q40 27 64 25 Q88 27 86 52 L90 108 Q78 114 64 112 Q50 114 38 108 Z" fill={fill} />;
    case 'bob':
      return <path d="M42 52 Q40 27 64 25 Q88 27 86 52 L87 76 Q86 82 79 82 L49 82 Q42 82 41 76 Z" fill={fill} />;
    case 'long-curls':
      return (
        <g fill={fill}>
          <path d="M40 50 Q38 23 64 21 Q90 23 88 50 L92 102 Q64 116 36 102 Z" />
          {[[38, 60], [37, 72], [38, 84], [41, 96], [90, 60], [91, 72], [90, 84], [87, 96], [50, 106], [64, 108], [78, 106]].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="6.6" />
          ))}
        </g>
      );
    case 'ponytail':
      return (
        <>
          <path d="M80 30 Q100 28 102 50 Q102 70 92 86 Q94 64 88 48 Q86 40 79 38 Z" fill={fill} />
          <ellipse cx="81" cy="33" rx="4.4" ry="4" fill={shade(ctx.hair, -0.4)} />
        </>
      );
    case 'braids':
      return (
        <g fill={fill}>
          {Array.from({ length: 9 }, (_, index) => 58 + index * 6).map((cy) => (
            <g key={cy}>
              <ellipse cx="42.5" cy={cy} rx="4.6" ry="3.8" />
              <ellipse cx="85.5" cy={cy} rx="4.6" ry="3.8" />
            </g>
          ))}
        </g>
      );
    case 'afro':
      return <circle cx="64" cy="44" r="33" fill={fill} />;
    case 'locs':
      return (
        <g fill={fill}>
          {LOCS.map(([x, length]) => <rect key={x} x={x} y="34" width="5.4" height={length} rx="2.7" />)}
        </g>
      );
    case 'pigtails':
      return (
        <g fill={fill}>
          <path d="M44 42 Q30 48 31 64 Q32 78 37 86 Q42 74 44 60 Z" />
          <path d="M84 42 Q98 48 97 64 Q96 78 91 86 Q86 74 84 60 Z" />
          <g fill={shade(ctx.hair, -0.4)}>
            <ellipse cx="41.6" cy="46" rx="3.4" ry="2.6" />
            <ellipse cx="86.4" cy="46" rx="3.4" ry="2.6" />
          </g>
        </g>
      );
    case 'puffs':
      return (
        <g fill={fill}>
          <circle cx="42" cy="26" r="13" />
          <circle cx="86" cy="26" r="13" />
        </g>
      );
    case 'bun':
      return <circle cx="64" cy="20" r="10" fill={fill} />;
    default:
      return null;
  }
}

/** Hair that sits over the forehead and the top of the head. */
function HairFront({ style, ctx }: { style: AvatarParts['hair']; ctx: Ctx }) {
  const { ref, hair, skin } = ctx;
  const fill = ref('hair');
  const dark = shade(hair, -0.45);
  const light = shade(hair, 0.4);
  switch (style) {
    case 'bald':
      return null;
    case 'buzz':
      return <path d={BUZZ} fill={fill} opacity=".9" strokeWidth="1" />;
    case 'fade':
      return (
        <>
          <path d={BUZZ} fill={fill} opacity=".45" stroke="none" />
          <path d="M46.4 42 Q45 22 64 21 Q83 22 81.6 42 Q76 37 64 37 Q52 37 46.4 42 Z" fill={fill} />
        </>
      );
    case 'waves':
      return (
        <>
          <path d={BUZZ} fill={fill} strokeWidth="1" />
          <path d="M50 36 Q53 33.6 56 36 Q59 38.4 62 36 Q65 33.6 68 36 Q71 38.4 74 36 Q76 34.8 78 36 M53 32.4 Q56 30.4 59 32.4 Q62 34.4 65 32.4 Q68 30.4 71 32.4 Q73 33.6 75 32.4" fill="none" stroke={light} strokeWidth=".9" strokeOpacity=".6" />
        </>
      );
    case 'curls':
      return (
        <g fill={fill}>
          <path d={BUZZ} strokeWidth="1" />
          {[[46, 44], [48, 36], [53, 30], [59, 27], [64, 26.4], [69, 27], [75, 30], [80, 36], [82, 44], [55, 35], [61, 32], [67, 32], [73, 35]].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" strokeWidth="1" />
          ))}
        </g>
      );
    case 'twists':
      return (
        <g fill={fill}>
          <path d={BUZZ} strokeWidth="1" />
          {[46, 50.5, 55, 59.5, 64, 68.5, 73, 77.5, 82].map((cx) => {
            const cy = 24 + ((cx - 64) / 19) ** 2 * 16;
            return <ellipse key={cx} cx={cx} cy={cy} rx="2.8" ry="6" strokeWidth="1" transform={`rotate(${(cx - 64) * 1.3} ${cx} ${cy})`} />;
          })}
        </g>
      );
    case 'high-top':
      return <path d="M45 50 Q45 42 47 38 L47 12 Q47 8 51 8 L77 8 Q81 8 81 12 L81 38 Q83 42 83 50 Q79 40 64 40 Q49 40 45 50 Z" fill={fill} />;
    case 'mohawk':
      return (
        <>
          <path d={BUZZ} fill={fill} opacity=".35" stroke="none" />
          <path d="M58.6 40 L57 12 Q64 4 71 12 L69.4 40 Q64 38 58.6 40 Z" fill={fill} />
        </>
      );
    case 'long-straight':
      return <path d="M43 58 Q40 28 64 27 Q88 28 85 58 Q84 44 78 38 Q70 44 56 46 Q48 48 43 58 Z" fill={fill} />;
    case 'bob':
      return <path d="M43 56 Q41 28 64 27 Q87 28 85 56 Q84 50 83 46 Q64 42 45 46 Q44 50 43 56 Z" fill={fill} />;
    case 'long-curls':
      return (
        <g fill={fill}>
          <path d={CAP} />
          {[[46, 46], [50, 39], [57, 35], [71, 35], [78, 39], [82, 46]].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" strokeWidth="1" />
          ))}
        </g>
      );
    case 'cornrows':
      return (
        <>
          <path d={BUZZ} fill={fill} strokeWidth="1" />
          <g fill="none" strokeLinecap="round">
            {[49, 55, 61, 67, 73, 79].map((x) => {
              const d = `M${x} 41 Q${x + (x - 64) * 0.08} 35 ${64 + (x - 64) * 0.55} 31`;
              return (
                <g key={x}>
                  <path d={d} stroke={shade(skin, -0.12)} strokeWidth="1.3" />
                  <path d={d} transform="translate(3 0)" stroke={light} strokeOpacity=".45" strokeWidth="1" strokeDasharray="1.4 1.2" />
                </g>
              );
            })}
          </g>
        </>
      );
    case 'locs':
      return (
        <g fill={fill}>
          <path d={CAP} />
          {[[44.4, 36, 26], [48.6, 34, 18], [79.4, 34, 18], [83.6, 36, 26]].map(([x, y, length]) => (
            <rect key={x} x={(x as number) - 2.6} y={y} width="5.2" height={length} rx="2.6" strokeWidth="1.2" />
          ))}
          <path d="M54 38 Q64 34.6 74 38" fill="none" stroke={dark} strokeWidth="1" />
        </g>
      );
    case 'pixie':
      return (
        <>
          <path d="M44.6 50 L45.4 60 Q46.6 55 47.6 52 Z M83.4 50 L82.6 60 Q81.4 55 80.4 52 Z" fill={fill} strokeWidth="1" />
          <path d="M43.6 50 Q41.4 27 64 26 Q86.6 27 84.4 48 Q82 40 75 37.4 Q66 43.4 53 43 Q46.4 45 43.6 50 Z" fill={fill} />
          <path d="M58 30 Q66 32 74 36.4" fill="none" stroke={dark} strokeWidth="1" />
        </>
      );
    case 'pigtails':
      return (
        <>
          <path d={CAP} fill={fill} />
          <path d="M64 27.8 V39.6" fill="none" stroke={shade(skin, -0.2)} strokeWidth="1.2" />
        </>
      );
    case 'braids':
      return (
        <>
          <path d={CAP} fill={fill} />
          <path d="M64 27.8 V39.6" fill="none" stroke={shade(skin, -0.2)} strokeWidth="1.2" />
          <path d="M50 34 Q56 31 62 30 M66 30 Q72 31 78 34" fill="none" stroke={dark} strokeWidth="1" />
        </>
      );
    case 'afro':
    case 'puffs':
    case 'ponytail':
    case 'bun':
    default:
      return <path d={CAP} fill={fill} />;
  }
}

/** The rim light the portraits put along the top of the hair or head. */
function HairShine({ style, ctx }: { style: AvatarParts['hair']; ctx: Ctx }) {
  const tops: Partial<Record<AvatarParts['hair'], string>> = {
    'high-top': 'M53 11 Q64 9.4 75 11',
    afro: 'M48 17 Q64 9 80 17',
    mohawk: 'M60.6 11 Q64 7.6 67.4 11',
    fade: 'M54 24 Q64 21 74 24',
    bald: 'M54 36 Q64 32 74 36',
  };
  const d = tops[style] ?? 'M54 31 Q64 27.6 74 31';
  const color = style === 'bald' ? shade(ctx.skin, 0.5) : shade(ctx.hair, 0.6);
  return <path d={d} stroke={color} strokeOpacity=".55" strokeWidth="1.6" fill="none" strokeLinecap="round" />;
}

/* Masks and extras ------------------------------------------------------- */

function Mask({ style, ctx }: { style: AvatarParts['mask']; ctx: Ctx }) {
  const { ref, mask } = ctx;
  const fill = ref('mask');
  const seam = shade(mask, -0.5);
  switch (style) {
    case 'ski-mask':
      return (
        <>
          <path
            fillRule="evenodd"
            fill={fill}
            d="M41 54 Q41 27 64 27 Q87 27 87 54 Q87 68 79 76 Q72 82 64 82 Q56 82 49 76 Q41 68 41 54 Z
               M49 50 Q64 46.6 79 50 Q80.4 57.6 74 59 Q64 57.4 54 59 Q47.6 57.6 49 50 Z
               M57.6 69.6 Q64 65.6 70.4 69.6 Q64 75.4 57.6 69.6 Z"
          />
          <path d="M54 29.4 Q52.6 37 53 46 M64 27.6 V46.4 M74 29.4 Q75.4 37 75 46 M46 62 Q47 70 52 76 M82 62 Q81 70 76 76" fill="none" stroke={seam} strokeOpacity=".55" strokeWidth="1" />
        </>
      );
    case 'bandana':
    case 'skull-bandana':
      return (
        <>
          <path d="M42.6 57 Q64 52.4 85.4 57 Q86.4 70 78.4 80 Q70.4 90 64 94 Q57.6 90 49.6 80 Q41.6 70 42.6 57 Z" fill={fill} />
          {style === 'skull-bandana' ? (
            <g stroke="none">
              <path d="M51 63 Q64 59 77 63 Q77 74 70 80.6 Q64 84 58 80.6 Q51 74 51 63 Z" fill="#ece8dc" />
              <path d="M56 64 V75 M60 63 V76 M64 62.6 V76.6 M68 63 V76 M72 64 V75 M52.4 69 Q64 66.8 75.6 69" fill="none" stroke={INK} strokeWidth="1.2" />
            </g>
          ) : (
            <g stroke="none" fill={contrast(mask)} opacity=".75">
              <path d="M45 60.4 Q64 56 83 60.4" fill="none" stroke={contrast(mask)} strokeWidth=".9" strokeDasharray="2 1.6" />
              {[[52, 66], [64, 64], [76, 66], [57, 74], [71, 74], [64, 82]].map(([cx, cy]) => (
                <g key={`${cx}-${cy}`}>
                  <circle cx={cx} cy={cy} r="1.8" fill="none" stroke={contrast(mask)} strokeWidth=".9" />
                  <circle cx={cx} cy={cy} r=".6" />
                </g>
              ))}
            </g>
          )}
          <path d="M52 72 Q64 78 76 72" fill="none" stroke={seam} strokeOpacity=".5" strokeWidth="1" />
        </>
      );
    case 'hockey': {
      const chevron = mask === avatarColor('maskColor', 'red') ? '#f4f2ea' : '#c8202a';
      return (
        <>
          <path
            fillRule="evenodd"
            fill={fill}
            d="M47 44 Q47 30 64 30 Q81 30 81 44 L81 60 Q81 76 64 80.4 Q47 76 47 60 Z
               M50.4 52.6 Q56 47.6 61.6 52.6 Q56 57.4 50.4 52.6 Z
               M66.4 52.6 Q72 47.6 77.6 52.6 Q72 57.4 66.4 52.6 Z"
          />
          <path d="M53 37 L57 40.6 L53 44.2 M75 37 L71 40.6 L75 44.2" fill="none" stroke={chevron} strokeWidth="2" strokeLinecap="round" />
          <g fill={INK} stroke="none">
            {[[58, 66], [64, 65], [70, 66], [60, 71], [64, 72], [68, 71], [64, 77]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.1" />)}
          </g>
          <path d="M47 47 L43 49 M81 47 L85 49" fill="none" strokeWidth="1.4" />
        </>
      );
    }
    case 'gas-mask':
      return (
        <>
          <path d="M46 61 L41 56 M82 61 L87 56" fill="none" stroke="#1b1d22" strokeWidth="3" />
          <path d="M47.6 58 Q64 50.6 80.4 58 Q82.4 70 74 78 Q64 84.4 54 78 Q45.6 70 47.6 58 Z" fill={fill} />
          <circle cx="64" cy="73" r="8" fill={ref('steel')} />
          <circle cx="64" cy="73" r="5" fill="none" strokeWidth="1" />
          <path d="M60.4 73 H67.6 M64 69.4 V76.6" fill="none" strokeWidth="1" />
          <path d="M50.6 62 Q56 59 60 60.4 M77.4 62 Q72 59 68 60.4" fill="none" stroke={shade(mask, 0.45)} strokeOpacity=".5" strokeWidth="1.2" />
        </>
      );
    default:
      return null;
  }
}

function Accessory({ style, ctx }: { style: AvatarParts['accessory']; ctx: Ctx }) {
  const { ref, body } = ctx;
  switch (style) {
    case 'shades':
      return (
        <g filter={ref('shadow')}>
          <Mirrored>
            <path d="M48.4 50 L62 50 Q62 58.6 55 58.6 Q48.4 58.6 48.4 50 Z" fill={ref('lens')} stroke={INK} strokeWidth="1.2" />
            <path d="M51 52 L54.6 52" stroke="#fff" strokeOpacity=".5" strokeWidth=".9" strokeLinecap="round" />
            <path d="M48.4 50.6 L43 50" stroke={INK} strokeWidth="1.4" />
          </Mirrored>
          <path d="M62 51.4 Q64 50 66 51.4" fill="none" stroke={INK} strokeWidth="1.4" />
        </g>
      );
    case 'glasses':
      return (
        <g filter={ref('shadow')}>
          <Mirrored>
            <circle cx="56" cy="54" r="6" fill="#fff" fillOpacity=".12" stroke="#1a1a1e" strokeWidth="1.6" />
            <path d="M50 53 L43 51" stroke="#1a1a1e" strokeWidth="1.4" />
          </Mirrored>
          <path d="M62 53.4 Q64 52 66 53.4" fill="none" stroke="#1a1a1e" strokeWidth="1.4" />
        </g>
      );
    case 'chain': {
      const d = `M${body.neckX - 4} ${body.neckY + 3} Q64 ${body.neckY + 26} ${132 - body.neckX} ${body.neckY + 3}`;
      return (
        <g filter={ref('shadow')}>
          <path d={d} fill="none" stroke={INK} strokeWidth="3.6" />
          <path d={d} fill="none" stroke={ref('gold')} strokeWidth="2.2" strokeDasharray="2 1" />
          <circle cx="64" cy={body.neckY + 16} r="3.4" fill={ref('gold')} stroke="#3a2a05" strokeWidth="1" />
        </g>
      );
    }
    case 'studs':
      return (
        <g filter={ref('shadow')}>
          <Mirrored>
            <circle cx="44.6" cy="64.6" r="2" fill="#f4f6fa" stroke="#3a2a05" strokeWidth=".8" />
          </Mirrored>
        </g>
      );
    case 'hoops':
      return (
        <g filter={ref('shadow')}>
          <Mirrored>
            <circle cx="44.4" cy="69" r="4" fill="none" stroke={INK} strokeWidth="3" />
            <circle cx="44.4" cy="69" r="4" fill="none" stroke={ref('gold')} strokeWidth="1.8" />
          </Mirrored>
        </g>
      );
    default:
      return null;
  }
}

/* Color helpers ---------------------------------------------------------- */

/** Brows read better a shade darker than the hair, and light hair still needs a visible brow. */
function browColor(hair: string): string {
  return luminance(hair) > 0.6 ? shade(hair, -0.5) : shade(hair, -0.3);
}

function contrast(hex: string): string {
  return luminance(hex) > 0.6 ? '#1f2228' : '#f4f4f4';
}

function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Mixes toward white (positive amount) or black (negative). */
function shade(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const weight = Math.abs(amount);
  return `#${rgb(hex).map((channel) => Math.round(channel + (target - channel) * weight).toString(16).padStart(2, '0')).join('')}`;
}
