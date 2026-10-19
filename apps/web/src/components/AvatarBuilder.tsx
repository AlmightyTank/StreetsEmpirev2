import {
  AVATAR_PART_OPTIONS,
  DEFAULT_AVATAR_PARTS,
  avatarOptionOwned,
  avatarPartOption,
  lockedAvatarParts,
  type AvatarBase,
  type AvatarPartKey,
  type AvatarPartOption,
  type AvatarParts,
} from '@streets/shared';
import { BuiltAvatar } from './BuiltAvatar.js';
import { rememberedKey, useRememberedState } from '../utils/remembered.js';
import { useSession } from '../stores/session.js';

const PART_LABELS: Record<AvatarPartKey, string> = {
  base: 'Base',
  skin: 'Skin tone',
  hair: 'Style',
  hairColor: 'Color',
  eyes: 'Shape',
  eyeColor: 'Color',
  brows: 'Brows',
  nose: 'Nose',
  mouth: 'Mouth',
  facialHair: 'Facial hair',
  shirt: 'Style',
  shirtColor: 'Color',
  mask: 'Mask',
  maskColor: 'Color',
  accessory: 'Accessory',
  earrings: 'Earrings',
  headwear: 'Hat',
  grill: 'Grill',
  aura: 'Aura',
  background: 'Background',
};

/** A line under a part's options, for pieces that only show sometimes. */
const PART_NOTES: Partial<Record<AvatarPartKey, string>> = {
  grill: 'Shows with a grin or a laugh.',
  accessory: 'Shades and glasses come off under the neon visor.',
  earrings: 'Hidden under a ski mask.',
  aura: 'Moves on your profile and here; still when motion is reduced.',
};

const TABS: { key: string; label: string; parts: AvatarPartKey[] }[] = [
  { key: 'base', label: 'Base', parts: ['base', 'skin'] },
  { key: 'hair', label: 'Hair', parts: ['hair', 'hairColor'] },
  { key: 'headwear', label: 'Hats', parts: ['headwear'] },
  { key: 'eyes', label: 'Eyes', parts: ['eyes', 'eyeColor', 'brows'] },
  { key: 'face', label: 'Nose & mouth', parts: ['nose', 'mouth'] },
  { key: 'facial-hair', label: 'Facial hair', parts: ['facialHair'] },
  { key: 'shirt', label: 'Shirt', parts: ['shirt', 'shirtColor'] },
  { key: 'mask', label: 'Mask', parts: ['mask', 'maskColor'] },
  { key: 'extras', label: 'Extras', parts: ['accessory', 'earrings', 'grill'] },
  { key: 'background', label: 'Background', parts: ['background', 'aura'] },
];

function sameParts(a: AvatarParts, b: AvatarParts): boolean {
  return (Object.keys(a) as AvatarPartKey[]).every((key) => a[key] === b[key]);
}

const NO_UNLOCKS: ReadonlySet<string> = new Set();

/**
 * What the builder lists for a part: everything wearable, then locked pieces
 * to preview. A hidden piece is left out until the account owns it.
 */
function visibleOptions(key: AvatarPartKey, owned: ReadonlySet<string>): AvatarPartOption[] {
  const options = (AVATAR_PART_OPTIONS[key] as readonly AvatarPartOption[]).filter((option) => !option.hidden || avatarOptionOwned(option, owned));
  return [
    ...options.filter((option) => avatarOptionOwned(option, owned)),
    ...options.filter((option) => !avatarOptionOwned(option, owned)),
  ];
}

/**
 * The option groups shown for one part. Hair splits into boy and girl styles,
 * the base's own group first; either base can wear either group.
 */
function sectionsFor(key: AvatarPartKey, base: AvatarBase, owned: ReadonlySet<string>): { key: string; label: string; options: readonly AvatarPartOption[] }[] {
  if (key !== 'hair') return [{ key, label: PART_LABELS[key], options: visibleOptions(key, owned) }];
  const groups: AvatarBase[] = base === 'girl' ? ['girl', 'boy'] : ['boy', 'girl'];
  return groups.map((group) => ({
    key: `hair-${group}`,
    label: group === 'boy' ? 'Boy styles' : 'Girl styles',
    options: visibleOptions('hair', owned).filter((option) => option.group === group),
  }));
}

/** A thumbnail for one option. A grill is shown on a grin, since it hides behind a closed mouth. */
function thumbnailParts(value: AvatarParts, key: AvatarPartKey, option: string): AvatarParts {
  const parts = { ...value, [key]: option };
  return key === 'grill' && value.mouth !== 'grin' && value.mouth !== 'laugh' ? { ...parts, mouth: 'grin' } : parts;
}

/** Shuffles only pieces the account can wear. */
function randomParts(base: AvatarBase, owned: ReadonlySet<string>): AvatarParts {
  const pick = <K extends AvatarPartKey>(key: K) => {
    const options = (AVATAR_PART_OPTIONS[key] as readonly AvatarPartOption[]).filter((option) => avatarOptionOwned(option, owned));
    return options[Math.floor(Math.random() * options.length)]!.key as AvatarParts[K];
  };
  const parts = Object.fromEntries(
    (Object.keys(AVATAR_PART_OPTIONS) as AvatarPartKey[]).map((key) => [key, pick(key)]),
  ) as AvatarParts;
  return {
    ...parts,
    base,
    // Most rolls should come out clean-shaven and unmasked; a beard on every other girl reads as a bug.
    facialHair: base === 'girl' || Math.random() < 0.5 ? 'none' : parts.facialHair,
    mask: Math.random() < 0.75 ? 'none' : parts.mask,
    headwear: Math.random() < 0.7 ? 'none' : parts.headwear,
    grill: Math.random() < 0.8 ? 'none' : parts.grill,
    aura: Math.random() < 0.8 ? 'none' : parts.aura,
    // Mostly a style cut for the base, with the odd crossover.
    hair: Math.random() < 0.8 ? randomHair(base) : parts.hair,
  };
}

function randomHair(base: AvatarBase): AvatarParts['hair'] {
  const styles = AVATAR_PART_OPTIONS.hair.filter((option) => option.group === base);
  return styles[Math.floor(Math.random() * styles.length)]!.key;
}

/**
 * Pick-a-piece editor for a built avatar: a live preview over tabs of parts.
 * `owned` holds the account's wearable unlock keys; a locked piece can be
 * tried on here, and the page refuses to save it.
 */
export function AvatarBuilder({ value, onChange, owned = NO_UNLOCKS }: {
  value: AvatarParts;
  onChange: (parts: AvatarParts) => void;
  owned?: ReadonlySet<string>;
}) {
  const accountId = useSession((s) => s.account?.id ?? null);
  const [tab, setTab] = useRememberedState(
    rememberedKey('account-settings:avatarTab', accountId ?? 'anon'),
    TABS[0]!.key,
    { accept: (v): v is string => typeof v === 'string' && TABS.some((t) => t.key === v) },
  );
  const active = TABS.find((candidate) => candidate.key === tab) ?? TABS[0]!;
  const locked = lockedAvatarParts(value, owned).map((key) => avatarPartOption(key, value[key])!);

  function choose<K extends AvatarPartKey>(key: K, option: AvatarParts[K]) {
    if (key === 'base') {
      const base = option as AvatarBase;
      const other: AvatarBase = base === 'boy' ? 'girl' : 'boy';
      // An untouched starter look swaps to the other starter; anything customised keeps its pieces.
      onChange(sameParts(value, DEFAULT_AVATAR_PARTS[other]) ? DEFAULT_AVATAR_PARTS[base] : { ...value, base });
      return;
    }
    onChange({ ...value, [key]: option });
  }

  return (
    <div className="se-avatar-builder">
      <div className="se-avatar-builder__stage">
        <span className="se-avatar-builder__preview">
          <BuiltAvatar parts={value} live />
        </span>
        <div className="se-avatar-builder__stage-actions">
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => onChange(randomParts(value.base, owned))}>
            Shuffle
          </button>
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => onChange(DEFAULT_AVATAR_PARTS[value.base])}>
            Start over
          </button>
        </div>
        {locked.length ? (
          <ul className="se-avatar-builder__locked" role="status">
            {locked.map((option) => (
              <li key={option.key}><strong>{option.label}</strong> is locked. {option.unlockHint ?? ''}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="se-avatar-builder__editor">
        <div className="se-avatar-builder__tabs" role="tablist" aria-label="Avatar pieces">
          {TABS.map((candidate) => (
            <button
              type="button"
              role="tab"
              key={candidate.key}
              aria-selected={candidate.key === active.key}
              className={`se-avatar-builder__tab${candidate.key === active.key ? ' is-active' : ''}`}
              onClick={() => setTab(candidate.key)}
            >
              {candidate.label}
            </button>
          ))}
        </div>

        <div className="se-avatar-builder__panel" role="tabpanel" aria-label={active.label}>
          {active.parts.flatMap((key) => sectionsFor(key, value.base, owned).map((section) => (
            <div className="se-avatar-builder__group" role="group" aria-label={section.label} key={section.key}>
              <span className="se-avatar-builder__group-label">{section.label}</span>
              <div className="se-avatar-builder__options">
                {section.options.map((option) => {
                  const selected = value[key] === option.key;
                  const color = option.color ?? null;
                  const isLocked = !avatarOptionOwned(option, owned);
                  const label = isLocked ? `${option.label} (locked). ${option.unlockHint ?? ''}`.trim() : option.label;
                  return (
                    <button
                      type="button"
                      key={option.key}
                      title={label}
                      aria-label={label}
                      aria-pressed={selected}
                      className={`se-avatar-builder__option${color ? ' se-avatar-builder__option--swatch' : ''}${selected ? ' is-selected' : ''}${isLocked ? ' is-locked' : ''}`}
                      onClick={() => choose(key, option.key as AvatarParts[typeof key])}
                    >
                      {color
                        ? <span className="se-avatar-builder__swatch" style={{ background: color }} />
                        : <BuiltAvatar parts={thumbnailParts(value, key, option.key)} />}
                      {color ? null : <small>{option.label}</small>}
                      {isLocked ? <span className="se-avatar-builder__lock" aria-hidden="true">Locked</span> : null}
                    </button>
                  );
                })}
              </div>
              {PART_NOTES[key] ? <p className="se-hint se-avatar-builder__note">{PART_NOTES[key]}</p> : null}
            </div>
          )))}
        </div>
      </div>
    </div>
  );
}
