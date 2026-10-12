import type { ReactNode } from 'react';
import { avatarColor, type AvatarParts } from '@streets/shared';

/**
 * Draws an avatar built from face pieces as a chest-up portrait on a 100x100
 * canvas. The holder decides the size and shape; the art fills it.
 */
export function BuiltAvatar({ parts, className }: { parts: AvatarParts; className?: string }) {
  const girl = parts.base === 'girl';
  const skin = avatarColor('skin', parts.skin);
  const hair = avatarColor('hairColor', parts.hairColor);
  const shirt = avatarColor('shirtColor', parts.shirtColor);
  const eye = avatarColor('eyeColor', parts.eyeColor);
  const body = girl ? GIRL_BODY : BOY_BODY;

  return (
    <svg
      className={`se-built-avatar${className ? ` ${className}` : ''}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="100" height="100" fill={avatarColor('background', parts.background)} />
      <circle cx="50" cy="40" r="40" fill="#ffffff" opacity="0.07" />
      {/* Drawn a little small, then grown so the face fills a round holder. */}
      <g transform="translate(50 58) scale(1.12) translate(-50 -58)">
        <HairBack style={parts.hair} color={hair} />
        <path d={`M${body.neckLeft} 56 L${body.neckLeft} 78 L${100 - body.neckLeft} 78 L${100 - body.neckLeft} 56 Z`} fill={skin} />
        <path d={`M${body.neckLeft} 60 Q50 68 ${100 - body.neckLeft} 60 L${100 - body.neckLeft} 64 Q50 70 ${body.neckLeft} 64 Z`} fill={shade(skin, -0.18)} />
        <Shirt style={parts.shirt} color={shirt} skin={skin} body={body} />
        <Ears girl={girl} skin={skin} />
        <path d={girl ? GIRL_HEAD : BOY_HEAD} fill={skin} />
        {girl ? (
          <g fill="#e2707a" opacity="0.2">
            <ellipse cx="39" cy="52" rx="3.4" ry="1.8" />
            <ellipse cx="61" cy="52" rx="3.4" ry="1.8" />
          </g>
        ) : null}
        <Mirrored>
          <Eye style={parts.eyes} color={eye} skin={skin} lashes={girl} />
          <Brow style={parts.brows} color={browColor(hair)} />
        </Mirrored>
        <Nose style={parts.nose} color={shade(skin, -0.32)} />
        <FacialHair style={parts.facialHair} color={hair} />
        <Mouth style={parts.mouth} girl={girl} />
        <HairFront style={parts.hair} color={hair} skin={skin} />
        <Accessory style={parts.accessory} girl={girl} body={body} />
      </g>
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

type Body = { left: number; shoulder: number; neckLeft: number; top: number };
const BOY_BODY: Body = { left: 8, shoulder: 21, neckLeft: 42.5, top: 75 };
const GIRL_BODY: Body = { left: 15, shoulder: 27, neckLeft: 44, top: 77 };

const BOY_HEAD = 'M31 40 C31 24 39 19 50 19 C61 19 69 24 69 40 L69 46 C69 56 62 64.5 50 64.5 C38 64.5 31 56 31 46 Z';
const GIRL_HEAD = 'M32 40 C32 24 40 19 50 19 C60 19 68 24 68 40 L68 46 C68 55 59 64 50 64.5 C41 64 32 55 32 46 Z';

function bodyPath({ left, shoulder, neckLeft, top }: Body): string {
  const right = 100 - left;
  return `M${left} 100 C${left} 86 ${shoulder} ${top + 2} ${neckLeft - 2} ${top} L${102 - neckLeft} ${top} C${100 - shoulder} ${top + 2} ${right} 86 ${right} 100 Z`;
}

/** Draws its children on the left of the face and again flipped onto the right. */
function Mirrored({ children }: { children: ReactNode }) {
  return (
    <>
      <g>{children}</g>
      <g transform="translate(100 0) scale(-1 1)">{children}</g>
    </>
  );
}

function Ears({ girl, skin }: { girl: boolean; skin: string }) {
  const x = girl ? 32.4 : 31.4;
  return (
    <Mirrored>
      <ellipse cx={x} cy="45" rx="3.8" ry="5.2" fill={skin} />
      <ellipse cx={x + 0.4} cy="45" rx="1.8" ry="3" fill={shade(skin, -0.16)} />
    </Mirrored>
  );
}

function Shirt({ style, color, skin, body }: { style: AvatarParts['shirt']; color: string; skin: string; body: Body }) {
  const dark = shade(color, -0.24);
  const trim = contrast(color);
  const top = body.top;
  const crewNeck = (
    <>
      <path d={`M42.5 ${top - 1} Q50 ${top + 7} 57.5 ${top - 1} Z`} fill={skin} />
      <path d={`M42 ${top - 0.6} Q50 ${top + 8} 58 ${top - 0.6}`} fill="none" stroke={dark} strokeWidth="1.6" />
    </>
  );
  switch (style) {
    case 'tank':
      return (
        <>
          <path d={bodyPath(body)} fill={skin} />
          <path d={`M31 100 C31 90 34 84 37 ${top + 1} L42 ${top} Q50 ${top + 11} 58 ${top} L63 ${top + 1} C66 84 69 90 69 100 Z`} fill={color} />
          <path d={`M42 ${top} Q50 ${top + 11} 58 ${top}`} fill="none" stroke={dark} strokeWidth="1.2" />
        </>
      );
    case 'jersey':
      return (
        <>
          <path d={bodyPath(body)} fill={skin} />
          <path d={`M25 100 C25 90 30 82 35 ${top + 1} L43 ${top - 1} L50 ${top + 9} L57 ${top - 1} L65 ${top + 1} C70 82 75 90 75 100 Z`} fill={color} />
          <path d={`M35 ${top + 1} C30 82 25 90 25 100 M65 ${top + 1} C70 82 75 90 75 100 M43 ${top - 1} L50 ${top + 9} L57 ${top - 1}`} fill="none" stroke={trim} strokeWidth="1.5" />
          <text x="50" y="97" textAnchor="middle" fontSize="11" fontWeight="900" fontFamily="Arial, sans-serif" fill={trim}>1</text>
        </>
      );
    case 'hoodie':
      return (
        <>
          <path d={bodyPath(body)} fill={color} />
          <path d={`M33 ${top + 1} Q50 ${top - 8} 67 ${top + 1} Q63 ${top + 10} 50 ${top + 12} Q37 ${top + 10} 33 ${top + 1} Z`} fill={dark} />
          <path d={`M42.5 ${top - 1} Q50 ${top + 7} 57.5 ${top - 1} Z`} fill={skin} />
          <path d={`M46 ${top + 6} L45 ${top + 17} M54 ${top + 6} L55 ${top + 17}`} stroke={shade(color, 0.45)} strokeWidth="1" strokeLinecap="round" />
          <path d="M36 97 Q50 92 64 97" fill="none" stroke={dark} strokeWidth="1" opacity="0.7" />
        </>
      );
    case 'collar':
      return (
        <>
          <path d={bodyPath(body)} fill={color} />
          <path d={`M44 ${top - 1} L50 ${top + 9} L56 ${top - 1} Z`} fill={skin} />
          <path d={`M42 ${top - 2} L50 ${top + 9} L45 ${top + 12} L38.5 ${top + 2} Z M58 ${top - 2} L50 ${top + 9} L55 ${top + 12} L61.5 ${top + 2} Z`} fill={shade(color, 0.22)} stroke={dark} strokeWidth="0.6" />
          <circle cx="50" cy={top + 15} r="0.9" fill={dark} />
          <circle cx="50" cy={top + 21} r="0.9" fill={dark} />
        </>
      );
    case 'jacket': {
      const inner = color === avatarColor('shirtColor', 'white') ? avatarColor('shirtColor', 'black') : avatarColor('shirtColor', 'white');
      const left = body.left;
      return (
        <>
          <path d={bodyPath(body)} fill={inner} />
          <path d={`M42.5 ${top - 1} Q50 ${top + 7} 57.5 ${top - 1} Z`} fill={skin} />
          <path d={`M${left} 100 C${left} 86 ${body.shoulder} ${top + 2} ${body.neckLeft - 2} ${top} L${body.neckLeft + 1} ${top} L46 100 Z`} fill={color} />
          <path d={`M${100 - left} 100 C${100 - left} 86 ${100 - body.shoulder} ${top + 2} ${102 - body.neckLeft} ${top} L${99 - body.neckLeft} ${top} L54 100 Z`} fill={color} />
          <path d={`M${body.neckLeft + 1} ${top} L${body.neckLeft - 2} ${top + 10} L45.5 95 Z M${99 - body.neckLeft} ${top} L${102 - body.neckLeft} ${top + 10} L54.5 95 Z`} fill={dark} />
        </>
      );
    }
    case 'tee':
    default:
      return (
        <>
          <path d={bodyPath(body)} fill={color} />
          {crewNeck}
        </>
      );
  }
}

function Eye({ style, color, skin, lashes }: { style: AvatarParts['eyes']; color: string; skin: string; lashes: boolean }) {
  const ink = '#2a1a14';
  const x = 42;
  const y = 44;
  let shape: ReactNode;
  switch (style) {
    case 'happy':
      shape = <path d={`M${x - 3.6} ${y + 1} Q${x} ${y - 3.4} ${x + 3.6} ${y + 1}`} fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />;
      break;
    case 'almond':
      shape = (
        <>
          <path d={`M${x - 4.2} ${y} Q${x} ${y - 4.4} ${x + 4.2} ${y} Q${x} ${y + 3.2} ${x - 4.2} ${y} Z`} fill="#fff" stroke={ink} strokeWidth="0.7" />
          <ellipse cx={x + 0.3} cy={y - 0.3} rx="2" ry="2" fill={color} />
          <circle cx={x + 0.3} cy={y - 0.3} r="1" fill="#111" />
          <circle cx={x + 1} cy={y - 1} r="0.5" fill="#fff" />
        </>
      );
      break;
    case 'narrow':
      shape = (
        <>
          <ellipse cx={x} cy={y} rx="3.9" ry="1.7" fill="#fff" stroke={ink} strokeWidth="0.7" />
          <ellipse cx={x + 0.3} cy={y} rx="1.7" ry="1.5" fill={color} />
          <circle cx={x + 0.3} cy={y} r="0.8" fill="#111" />
        </>
      );
      break;
    case 'sleepy':
      shape = (
        <>
          <ellipse cx={x} cy={y} rx="3.6" ry="3" fill="#fff" />
          <circle cx={x + 0.3} cy={y + 0.4} r="2.1" fill={color} />
          <circle cx={x + 0.3} cy={y + 0.4} r="1" fill="#111" />
          <path d={`M${x - 4} ${y + 0.2} L${x + 4} ${y + 0.2} L${x + 4} ${y - 3.6} L${x - 4} ${y - 3.6} Z`} fill={shade(skin, -0.08)} />
          <path d={`M${x - 3.8} ${y + 0.2} Q${x} ${y - 0.6} ${x + 3.8} ${y + 0.2}`} fill="none" stroke={ink} strokeWidth="1.1" strokeLinecap="round" />
        </>
      );
      break;
    case 'wide':
    case 'round':
    default: {
      const r = style === 'wide' ? 4.2 : 3.5;
      shape = (
        <>
          <ellipse cx={x} cy={y} rx={r} ry={r - 0.2} fill="#fff" stroke={ink} strokeWidth="0.7" />
          <circle cx={x + 0.3} cy={y} r={r * 0.64} fill={color} />
          <circle cx={x + 0.3} cy={y} r={r * 0.3} fill="#111" />
          <circle cx={x + 1.1} cy={y - 0.9} r="0.6" fill="#fff" />
        </>
      );
    }
  }
  return (
    <>
      {shape}
      {lashes ? <path d={`M${x - 3.6} ${y - 0.6} Q${x - 4.8} ${y - 1.2} ${x - 5.8} ${y - 2.8}`} fill="none" stroke={ink} strokeWidth="1.2" strokeLinecap="round" /> : null}
    </>
  );
}

function Brow({ style, color }: { style: AvatarParts['brows']; color: string }) {
  const paths: Record<AvatarParts['brows'], [string, number]> = {
    soft: ['M37.6 38.6 Q42 36.4 46 37.8', 1.5],
    straight: ['M37.8 37.6 L46.2 37.4', 1.9],
    arched: ['M37.6 39 Q40.6 35.2 46 37.4', 1.4],
    thick: ['M37.6 38.4 Q42 35.8 46.4 37.4', 2.9],
    angry: ['M37.8 36.4 L46.4 39', 2.1],
  };
  const [d, width] = paths[style];
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />;
}

function Nose({ style, color }: { style: AvatarParts['nose']; color: string }) {
  const paths: Record<AvatarParts['nose'], string> = {
    button: 'M48 52.2 Q50 54 52 52.2',
    round: 'M47.2 50.6 Q46.2 53.6 48.6 53.6 Q50 54.6 51.4 53.6 Q53.8 53.6 52.8 50.6',
    wide: 'M46 51.2 Q44.8 54.4 48 54.2 Q50 55.2 52 54.2 Q55.2 54.4 54 51.2',
    pointed: 'M50.6 45 L52.8 52.4 Q51 53.8 48.6 52.8',
    small: 'M49 52.8 Q50 53.6 51 52.8',
  };
  return <path d={paths[style]} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />;
}

function Mouth({ style, girl }: { style: AvatarParts['mouth']; girl: boolean }) {
  const line = girl ? '#a8424f' : '#4a1f1a';
  const width = girl ? 1.8 : 1.4;
  const open = '#3a1612';
  switch (style) {
    case 'grin':
      return (
        <>
          <path d="M44 57 Q50 64 56 57 Z" fill={open} stroke={line} strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M45 57.2 L55 57.2 Q54.4 58.9 50 59.1 Q45.6 58.9 45 57.2 Z" fill="#fff" />
        </>
      );
    case 'laugh':
      return (
        <>
          <path d="M44 56.4 Q50 65.6 56 56.4 Z" fill={open} stroke={line} strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M47 61.4 Q50 59 53 61.4 Q50 63.6 47 61.4 Z" fill="#d9646c" />
          <path d="M44.7 56.6 L55.3 56.6 Q55 58 50 58.2 Q45 58 44.7 56.6 Z" fill="#fff" />
        </>
      );
    default: {
      const paths: Record<string, string> = {
        smile: 'M44.5 57.4 Q50 61.6 55.5 57.4',
        smirk: 'M45.5 58.6 Q50 59.6 55 56.8',
        neutral: 'M46 58.4 L54 58.4',
        serious: 'M45.5 59.2 Q50 57.2 54.5 59.2',
      };
      return <path d={paths[style]} fill="none" stroke={line} strokeWidth={width} strokeLinecap="round" />;
    }
  }
}

const MUSTACHE = 'M43.5 56.8 Q46.5 53 50 54.8 Q53.5 53 56.5 56.8 Q53.5 55.8 50 56.6 Q46.5 55.8 43.5 56.8 Z';

function FacialHair({ style, color }: { style: AvatarParts['facialHair']; color: string }) {
  switch (style) {
    case 'stubble':
      return (
        <g fill={color} opacity="0.3">
          <path d="M32.5 49 C34 58 40 64.5 50 64.5 C60 64.5 66 58 67.5 49 C64 56 58 60.6 50 60.6 C42 60.6 36 56 32.5 49 Z" />
          <path d="M44.6 55.6 Q50 53.8 55.4 55.6 Q50 57 44.6 55.6 Z" />
        </g>
      );
    case 'mustache':
      return <path d={MUSTACHE} fill={color} />;
    case 'goatee':
      return (
        <g fill={color}>
          <path d={MUSTACHE} />
          <path d="M45.6 61 Q50 59.8 54.4 61 L53.8 64.6 Q50 67.4 46.2 64.6 Z" />
        </g>
      );
    case 'beard':
      return (
        <g fill={color}>
          <path d="M31 45 C31 59 39 67.5 50 67.5 C61 67.5 69 59 69 45 L66.4 45 C65.4 54 60 59.8 50 59.8 C40 59.8 34.6 54 33.6 45 Z" />
          <path d={MUSTACHE} />
        </g>
      );
    default:
      return null;
  }
}

/** Hair that sits behind the head and shoulders. */
function HairBack({ style, color }: { style: AvatarParts['hair']; color: string }) {
  const dark = shade(color, -0.22);
  switch (style) {
    case 'long-straight':
      return <path d="M27 42 C26 20 38 13 50 13 C62 13 74 20 73 42 L75 86 Q62 90 50 88 Q38 90 25 86 Z" fill={color} />;
    case 'bob':
      return <path d="M28 42 C27 20 38 14 50 14 C62 14 73 20 72 42 L73 62 Q72 67 66 67 L34 67 Q28 67 27 62 Z" fill={color} />;
    case 'long-curls':
      return (
        <g fill={color}>
          <path d="M26 40 C24 18 38 12 50 12 C62 12 76 18 74 40 L77 80 Q50 92 23 80 Z" />
          {[[24.5, 48], [23.5, 58], [24, 68], [26.5, 78], [75.5, 48], [76.5, 58], [76, 68], [73.5, 78], [36, 84], [50, 86], [64, 84]].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5.4" />
          ))}
        </g>
      );
    case 'ponytail':
      return (
        <>
          <path d="M63 22 C79 19 84 36 79 52 C76 62 72 68 69 72 C71 59 72 44 65 33 Z" fill={color} />
          <circle cx="65" cy="23.5" r="3.2" fill={dark} />
        </>
      );
    case 'braids':
      return (
        <g fill={color} stroke={dark} strokeWidth="0.6">
          {Array.from({ length: 9 }, (_, index) => 44 + index * 5).map((cy) => (
            <g key={cy}>
              <ellipse cx="29.5" cy={cy} rx="3.6" ry="3" />
              <ellipse cx="70.5" cy={cy} rx="3.6" ry="3" />
            </g>
          ))}
        </g>
      );
    case 'afro':
      return <circle cx="50" cy="33" r="27.5" fill={color} />;
    case 'puffs':
      return (
        <g fill={color}>
          <circle cx="30" cy="19" r="11" />
          <circle cx="70" cy="19" r="11" />
        </g>
      );
    case 'bun':
      return <circle cx="50" cy="13" r="8.6" fill={color} />;
    default:
      return null;
  }
}

/** A hairline cap over the top of the head, shared by several styles. */
const CAP = 'M30.5 42 C29 22 38 16 50 16 C62 16 71 22 69.5 42 C67 33 60 28.5 50 28.5 C40 28.5 33 33 30.5 42 Z';
const BUZZ = 'M30.6 41 C30 25 39 18.4 50 18.4 C61 18.4 70 25 69.4 41 C67 31 60 26 50 26 C40 26 33 31 30.6 41 Z';

/** Hair that sits over the forehead and the top of the head. */
function HairFront({ style, color, skin }: { style: AvatarParts['hair']; color: string; skin: string }) {
  const dark = shade(color, -0.22);
  const light = shade(color, 0.25);
  switch (style) {
    case 'bald':
      return <ellipse cx="43" cy="25" rx="5.5" ry="2.6" fill="#fff" opacity="0.16" transform="rotate(-18 43 25)" />;
    case 'buzz':
      return <path d={BUZZ} fill={color} opacity="0.85" />;
    case 'fade':
      return (
        <>
          <path d={BUZZ} fill={color} opacity="0.4" />
          <path d="M32.5 34 C32 18 40 11.5 50 11.5 C60 11.5 68 18 67.5 34 C65 29 59 26 50 26 C41 26 35 29 32.5 34 Z" fill={color} />
        </>
      );
    case 'waves':
      return (
        <>
          <path d={BUZZ} fill={color} />
          <path d="M36 25 Q39 22.6 42 25 Q45 27.4 48 25 Q51 22.6 54 25 Q57 27.4 60 25 Q62 23.8 64 25 M39 21.4 Q42 19.4 45 21.4 Q48 23.4 51 21.4 Q54 19.4 57 21.4 Q59 22.6 61 21.4" fill="none" stroke={light} strokeWidth="0.8" opacity="0.6" />
        </>
      );
    case 'curls':
      return (
        <g fill={color}>
          <path d={BUZZ} />
          {[[33, 33], [35, 26], [39, 21], [44, 18], [50, 17], [56, 18], [61, 21], [65, 26], [67, 33], [41, 25], [47, 22.5], [53, 22.5], [59, 25]].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.3" stroke={dark} strokeWidth="0.4" />
          ))}
        </g>
      );
    case 'twists':
      return (
        <g fill={color}>
          <path d={BUZZ} />
          {[34, 38, 42, 46, 50, 54, 58, 62, 66].map((cx) => {
            const cy = 15 + ((cx - 50) / 19) ** 2 * 13;
            return <ellipse key={cx} cx={cx} cy={cy} rx="2.4" ry="5" stroke={dark} strokeWidth="0.5" transform={`rotate(${(cx - 50) * 1.4} ${cx} ${cy})`} />;
          })}
        </g>
      );
    case 'high-top':
      return <path d="M31 40 C31 34 32 30 33 28 L33 8 Q33 5 36 5 L64 5 Q67 5 67 8 L67 28 C68 30 69 34 69 40 C66 32 60 27 50 27 C40 27 34 32 31 40 Z" fill={color} />;
    case 'mohawk':
      return (
        <>
          <path d={BUZZ} fill={color} opacity="0.32" />
          <path d="M45 28 L44 9 Q50 2.5 56 9 L55 28 Q50 26 45 28 Z" fill={color} />
        </>
      );
    case 'long-straight':
      return <path d="M30 46 C28 22 39 15 50 15 C62 15 72 22 70 46 C69 36 66 30 60 27 C54 32 42 34 34 38 C32 40 31 43 30 46 Z" fill={color} />;
    case 'bob':
      return <path d="M30 44 C29 21 39 15 50 15 C61 15 71 21 70 44 C69 40 69 36 68 34 Q50 31 32 34 C31 36 31 40 30 44 Z" fill={color} />;
    case 'long-curls':
      return (
        <g fill={color}>
          <path d={CAP} />
          {[[32, 36], [36, 30], [42, 27], [58, 27], [64, 30], [68, 36]].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" />
          ))}
        </g>
      );
    case 'braids':
      return (
        <>
          <path d={CAP} fill={color} />
          <path d="M50 16.4 L50 28.4" stroke={skin} strokeWidth="0.9" />
        </>
      );
    case 'afro':
    case 'puffs':
    case 'ponytail':
    case 'bun':
    default:
      return <path d={CAP} fill={color} />;
  }
}

function Accessory({ style, girl, body }: { style: AvatarParts['accessory']; girl: boolean; body: Body }) {
  const gold = '#e3b341';
  const earX = girl ? 32.4 : 31.4;
  switch (style) {
    case 'shades':
      return (
        <>
          <Mirrored>
            <path d="M35.4 41 L47.6 41 Q47.6 47.8 42 47.8 Q35.4 47.8 35.4 41 Z" fill="#111" opacity="0.94" />
            <path d="M37.4 42.6 L40.4 42.6" stroke="#fff" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
            <path d="M35.4 41.4 L31 40.8" stroke="#111" strokeWidth="1.1" />
          </Mirrored>
          <path d="M47.6 42 Q50 40.6 52.4 42" fill="none" stroke="#111" strokeWidth="1.1" />
        </>
      );
    case 'glasses':
      return (
        <>
          <Mirrored>
            <circle cx="42" cy="44" r="5.2" fill="#fff" fillOpacity="0.12" stroke="#222" strokeWidth="1.1" />
            <path d="M36.8 43.4 L31 42.4" stroke="#222" strokeWidth="1.1" />
          </Mirrored>
          <path d="M47.2 43.6 Q50 42 52.8 43.6" fill="none" stroke="#222" strokeWidth="1.1" />
        </>
      );
    case 'chain':
      return (
        <>
          <path d={`M${body.neckLeft - 4} ${body.top} Q50 ${body.top + 18} ${104 - body.neckLeft} ${body.top}`} fill="none" stroke={gold} strokeWidth="1.7" strokeDasharray="1.6 0.7" />
          <circle cx="50" cy={body.top + 10} r="2.4" fill={gold} stroke={shade(gold, -0.3)} strokeWidth="0.5" />
        </>
      );
    case 'studs':
      return (
        <Mirrored>
          <circle cx={earX - 0.4} cy="49.4" r="1.3" fill="#eef3f7" stroke="#9aa6b2" strokeWidth="0.3" />
        </Mirrored>
      );
    case 'hoops':
      return (
        <Mirrored>
          <circle cx={earX - 0.6} cy="52" r="2.8" fill="none" stroke={gold} strokeWidth="1.1" />
        </Mirrored>
      );
    default:
      return null;
  }
}

/** Brows read better a shade darker than the hair, and light hair still needs a visible brow. */
function browColor(hair: string): string {
  return luminance(hair) > 0.6 ? shade(hair, -0.45) : shade(hair, -0.2);
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
