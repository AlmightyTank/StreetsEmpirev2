import { useState } from 'react';
import {
  AVATAR_PART_OPTIONS,
  DEFAULT_AVATAR_PARTS,
  type AvatarBase,
  type AvatarPartKey,
  type AvatarParts,
} from '@streets/shared';
import { BuiltAvatar } from './BuiltAvatar.js';

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
  accessory: 'Accessory',
  background: 'Background',
};

const TABS: { key: string; label: string; parts: AvatarPartKey[] }[] = [
  { key: 'base', label: 'Base', parts: ['base', 'skin'] },
  { key: 'hair', label: 'Hair', parts: ['hair', 'hairColor'] },
  { key: 'eyes', label: 'Eyes', parts: ['eyes', 'eyeColor', 'brows'] },
  { key: 'face', label: 'Nose & mouth', parts: ['nose', 'mouth'] },
  { key: 'facial-hair', label: 'Facial hair', parts: ['facialHair'] },
  { key: 'shirt', label: 'Shirt', parts: ['shirt', 'shirtColor'] },
  { key: 'extras', label: 'Extras', parts: ['accessory', 'background'] },
];

function sameParts(a: AvatarParts, b: AvatarParts): boolean {
  return (Object.keys(a) as AvatarPartKey[]).every((key) => a[key] === b[key]);
}

function randomParts(base: AvatarBase): AvatarParts {
  const pick = <K extends AvatarPartKey>(key: K) => {
    const options = AVATAR_PART_OPTIONS[key];
    return options[Math.floor(Math.random() * options.length)]!.key as AvatarParts[K];
  };
  const parts = Object.fromEntries(
    (Object.keys(AVATAR_PART_OPTIONS) as AvatarPartKey[]).map((key) => [key, pick(key)]),
  ) as AvatarParts;
  return {
    ...parts,
    base,
    // Most rolls should come out clean-shaven; a beard on every other girl reads as a bug.
    facialHair: base === 'girl' || Math.random() < 0.5 ? 'none' : parts.facialHair,
  };
}

/** Pick-a-piece editor for a built avatar: a live preview over tabs of parts. */
export function AvatarBuilder({ value, onChange }: { value: AvatarParts; onChange: (parts: AvatarParts) => void }) {
  const [tab, setTab] = useState(TABS[0]!.key);
  const active = TABS.find((candidate) => candidate.key === tab) ?? TABS[0]!;

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
          <BuiltAvatar parts={value} />
        </span>
        <div className="se-avatar-builder__stage-actions">
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => onChange(randomParts(value.base))}>
            Shuffle
          </button>
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => onChange(DEFAULT_AVATAR_PARTS[value.base])}>
            Start over
          </button>
        </div>
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
          {active.parts.map((key) => (
            <div className="se-avatar-builder__group" role="group" aria-label={PART_LABELS[key]} key={key}>
              <span className="se-avatar-builder__group-label">{PART_LABELS[key]}</span>
              <div className="se-avatar-builder__options">
                {AVATAR_PART_OPTIONS[key].map((option) => {
                  const selected = value[key] === option.key;
                  const color = 'color' in option ? option.color : null;
                  return (
                    <button
                      type="button"
                      key={option.key}
                      title={option.label}
                      aria-label={option.label}
                      aria-pressed={selected}
                      className={`se-avatar-builder__option${color ? ' se-avatar-builder__option--swatch' : ''}${selected ? ' is-selected' : ''}`}
                      onClick={() => choose(key, option.key as AvatarParts[typeof key])}
                    >
                      {color
                        ? <span className="se-avatar-builder__swatch" style={{ background: color }} />
                        : <BuiltAvatar parts={{ ...value, [key]: option.key }} />}
                      {color ? null : <small>{option.label}</small>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
