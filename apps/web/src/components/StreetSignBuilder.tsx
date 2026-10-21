import { DEFAULT_STREET_SIGN, STREET_SIGN_FONTS, STREET_SIGN_FONT_PACKS, STREET_SIGN_SHADOWS, STREET_SIGN_STREET_TYPES, STREET_SIGN_TAG_MAX, STREET_SIGN_TAG_PLACEMENTS, STREET_SIGN_TAG_SCALES, STREET_SIGN_TEXT_MAX, STREET_SIGN_TREATMENTS, STREET_SIGN_TRIMS, STREET_SIGN_VERSION, type StreetSignDesign } from '@streets/shared';

const FONT_LABELS: Record<(typeof STREET_SIGN_FONTS)[number], string> = {
  'road-condensed': 'Road Condensed',
  block: 'Heavy Block',
  stencil: 'Stencil',
  handstyle: 'Handstyle',
  rounded: 'Rounded',
  'sign-painter': 'Sign Painter',
  'graffiti-script': 'Graffiti Script',
  wildstyle: 'Wildstyle',
};

const COLOR_PRESETS = [
  { label: 'Reflective green', background: '#087b62', text: '#ffffff' },
  { label: 'Reflective blue', background: '#0755a5', text: '#ffffff' },
  { label: 'Reflective silver', background: '#c3c7c6', text: '#202624' },
  { label: 'Reflective brown', background: '#78401d', text: '#ffffff' },
  { label: 'Reflective black', background: '#111514', text: '#ffffff' },
  { label: 'Reflective red', background: '#c41f1a', text: '#ffffff' },
];

const TAG_SCALE_LABELS = { small: 'Small', medium: 'Medium', large: 'Large' } as const;
const TAG_PLACEMENT_LABELS = { 'lower-left': 'Lower left', 'lower-center': 'Lower center', 'lower-right': 'Lower right' } as const;
const TRIM_LABELS = { single: 'Single steel edge', double: 'Double steel edge', beveled: 'Beveled steel edge' } as const;
const SHADOW_LABELS = { soft: 'Soft shadow', strong: 'Deep shadow', none: 'No shadow' } as const;
const TREATMENT_LABELS = { reflective: 'Reflective', municipal: 'Clean enamel', weathered: 'Weathered metal' } as const;

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function streetSignContrastRatio(first: string, second: string): number {
  const luminance = (color: string) => {
    const values = color.slice(1).match(/.{2}/g)?.map((part) => channel(Number.parseInt(part, 16))) ?? [0, 0, 0];
    return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

interface StreetSignBuilderProps {
  value: StreetSignDesign | null | undefined;
  crewName?: string | null;
  savedValue?: StreetSignDesign | null;
  unlockedFontPacks?: readonly string[];
  onChange: (value: StreetSignDesign | null) => void;
}

export function StreetSignBuilder({ value, crewName = '', savedValue = null, unlockedFontPacks = [], onChange }: StreetSignBuilderProps) {
  const design = { ...(value ?? DEFAULT_STREET_SIGN), streetName: (crewName ?? '').trim() };
  const hasDraftChanges = JSON.stringify(value ?? null) !== JSON.stringify(savedValue ?? null);
  const textNeedsContrastHelp = streetSignContrastRatio(design.textColor, design.backgroundColor) < 4.5;
  const tagNeedsContrastHelp = Boolean(design.tag) && streetSignContrastRatio(design.tagColor, design.backgroundColor) < 3;
  function update(patch: Partial<StreetSignDesign>) {
    onChange({ ...design, ...patch, version: STREET_SIGN_VERSION });
  }
  const fontPackFor = (font: StreetSignDesign['font']) => STREET_SIGN_FONT_PACKS.find((pack) => (pack.fonts as readonly string[]).includes(font));
  const fontIsAvailable = (font: StreetSignDesign['font'], slot: 'streetText' | 'graffiti') => {
    const pack = fontPackFor(font);
    return !pack || (pack[slot] && unlockedFontPacks.includes(pack.key));
  };
  const lockedFontHint = STREET_SIGN_FONT_PACKS.filter((pack) => !unlockedFontPacks.includes(pack.key)).map((pack) => `${pack.label} · level ${pack.level}`).join(' · ');

  return (
    <section className="se-street-sign-builder" aria-labelledby="street-sign-title" data-tour="build-street-sign">
      <header className="se-street-sign-builder__head">
        <div>
          <h3 id="street-sign-title">Your street sign</h3>
          <p>Make your crew’s mark. This sign is cosmetic and does not claim a city block.</p>
        </div>
        <div className="se-street-sign-builder__head-actions">
          <button type="button" className="se-btn se-btn--ghost se-street-sign-builder__clear" disabled={!hasDraftChanges} onClick={() => onChange(savedValue ?? null)}>
            {savedValue ? 'Reset to saved' : 'Reset preview'}
          </button>
          {value ? <button type="button" className="se-btn se-btn--ghost se-street-sign-builder__clear" onClick={() => onChange(null)}>Clear sign</button> : null}
        </div>
      </header>

      <div className={`se-street-sign-preview se-street-sign-preview--${design.shape} se-street-sign-trim--${design.trim} se-street-sign-shadow--${design.shadow} se-street-sign-treatment--${design.treatment}`} role="img" aria-label={`Live preview of ${design.shape} metal street sign with ${TREATMENT_LABELS[design.treatment].toLowerCase()} finish`}>
        <div className="se-street-sign-preview__face" style={{ backgroundColor: design.backgroundColor, color: design.textColor }}>
          <span className="se-street-sign-preview__bolt se-street-sign-preview__bolt--left" aria-hidden="true" />
          <span className="se-street-sign-preview__bolt se-street-sign-preview__bolt--right" aria-hidden="true" />
          <div className="se-street-sign-preview__lettering">
            <span className={`se-street-sign-preview__name se-street-sign-font--${design.font}`}>{design.streetName || 'Your Crew'}</span>
            <span className="se-street-sign-preview__street-type">{design.streetType}</span>
          </div>
          {design.tag ? <span className={`se-street-sign-preview__tag se-street-sign-preview__tag--${design.tagScale} se-street-sign-preview__tag--${design.tagPlacement} se-street-sign-font--${design.tagFont}`} style={{ color: design.tagColor }}>{design.tag}</span> : null}
        </div>
      </div>
      {textNeedsContrastHelp || tagNeedsContrastHelp ? (
        <p className="se-street-sign-builder__accessibility" role="status" aria-live="polite">
          {textNeedsContrastHelp ? 'Lettering may be hard to read against this sign color. ' : ''}
          {tagNeedsContrastHelp ? 'The graffiti tag may be hard to read against this sign color.' : ''}
        </p>
      ) : null}

      <div className="se-street-sign-builder__fields">
        <fieldset className="se-street-sign-builder__shape">
          <legend>Sign shape</legend>
          <div className="se-street-sign-builder__shape-options">
            {(['classic', 'wide'] as const).map((shape) => (
              <button
                key={shape}
                type="button"
                className={`se-street-sign-builder__shape-choice${design.shape === shape ? ' is-selected' : ''}`}
                aria-pressed={design.shape === shape}
                onClick={() => update({ shape })}
              >
                <span className={`se-street-sign-builder__shape-icon se-street-sign-builder__shape-icon--${shape}`} aria-hidden="true" />
                <span>{shape === 'classic' ? 'Classic' : 'Wide'}</span>
              </button>
            ))}
          </div>
          <p className="se-street-sign-builder__hint">Both are reflective metal street signs.</p>
        </fieldset>

        <div className="se-street-sign-builder__grid">
          <div className="se-street-sign-builder__field se-street-sign-builder__field--wide">
            <label htmlFor="street-sign-name">Crew name on sign</label>
            <input id="street-sign-name" className="se-input" maxLength={STREET_SIGN_TEXT_MAX} value={design.streetName} placeholder="Set your crew name above" readOnly />
            <small>{design.streetName.length}/{STREET_SIGN_TEXT_MAX}</small>
            <p className="se-street-sign-builder__hint">The sign lettering stays linked to your crew name. Change it in the Crew name field above.</p>
          </div>
          <div className="se-street-sign-builder__field">
            <label htmlFor="street-sign-type">Street type</label>
            <select id="street-sign-type" className="se-input" value={design.streetType} onChange={(event) => update({ streetType: event.target.value as StreetSignDesign['streetType'] })}>
              {STREET_SIGN_STREET_TYPES.map((streetType) => <option key={streetType} value={streetType}>{streetType}</option>)}
            </select>
          </div>
          <div className="se-street-sign-builder__field">
            <label htmlFor="street-sign-font">Main font</label>
            <select id="street-sign-font" className="se-input" value={design.font} onChange={(event) => update({ font: event.target.value as StreetSignDesign['font'] })}>
              {STREET_SIGN_FONTS.map((font) => {
                const pack = fontPackFor(font);
                const available = fontIsAvailable(font, 'streetText');
                return <option key={font} value={font} disabled={!available}>{FONT_LABELS[font]}{pack && !available ? ` · level ${pack.level}` : ''}</option>;
              })}
            </select>
            {lockedFontHint ? <small>Earn font packs through account levels: {lockedFontHint}.</small> : null}
          </div>
          <div className="se-street-sign-builder__field se-street-sign-builder__field--wide">
            <label htmlFor="street-sign-tag">Graffiti tag <span>(optional)</span></label>
            <input id="street-sign-tag" className="se-input" maxLength={STREET_SIGN_TAG_MAX} value={design.tag} placeholder="Add your tag" onChange={(event) => update({ tag: event.target.value })} />
          </div>
          <div className="se-street-sign-builder__field">
            <label htmlFor="street-sign-tag-font">Tag font</label>
            <select id="street-sign-tag-font" className="se-input" value={design.tagFont} onChange={(event) => update({ tagFont: event.target.value as StreetSignDesign['tagFont'] })}>
              {STREET_SIGN_FONTS.map((font) => {
                const pack = fontPackFor(font);
                const available = fontIsAvailable(font, 'graffiti');
                return <option key={font} value={font} disabled={!available}>{FONT_LABELS[font]}{pack && !available ? ` · level ${pack.level}` : ''}</option>;
              })}
            </select>
            {lockedFontHint ? <small>Graffiti Pack includes Graffiti Script and Wildstyle.</small> : null}
          </div>
          <div className="se-street-sign-builder__field">
            <label htmlFor="street-sign-tag-color">Tag color</label>
            <input id="street-sign-tag-color" className="se-input se-street-sign-builder__color" type="color" value={design.tagColor} onChange={(event) => update({ tagColor: event.target.value })} />
          </div>
          <div className="se-street-sign-builder__field">
            <label htmlFor="street-sign-tag-scale">Tag size</label>
            <select id="street-sign-tag-scale" className="se-input" value={design.tagScale} onChange={(event) => update({ tagScale: event.target.value as StreetSignDesign['tagScale'] })}>
              {STREET_SIGN_TAG_SCALES.map((scale) => <option key={scale} value={scale}>{TAG_SCALE_LABELS[scale]}</option>)}
            </select>
          </div>
          <div className="se-street-sign-builder__field">
            <label htmlFor="street-sign-tag-placement">Tag placement</label>
            <select id="street-sign-tag-placement" className="se-input" value={design.tagPlacement} onChange={(event) => update({ tagPlacement: event.target.value as StreetSignDesign['tagPlacement'] })}>
              {STREET_SIGN_TAG_PLACEMENTS.map((placement) => <option key={placement} value={placement}>{TAG_PLACEMENT_LABELS[placement]}</option>)}
            </select>
          </div>
          <div className="se-street-sign-builder__field">
            <label htmlFor="street-sign-trim">Steel outline</label>
            <select id="street-sign-trim" className="se-input" value={design.trim} onChange={(event) => update({ trim: event.target.value as StreetSignDesign['trim'] })}>
              {STREET_SIGN_TRIMS.map((trim) => <option key={trim} value={trim}>{TRIM_LABELS[trim]}</option>)}
            </select>
          </div>
          <div className="se-street-sign-builder__field">
            <label htmlFor="street-sign-shadow">Shadow</label>
            <select id="street-sign-shadow" className="se-input" value={design.shadow} onChange={(event) => update({ shadow: event.target.value as StreetSignDesign['shadow'] })}>
              {STREET_SIGN_SHADOWS.map((shadow) => <option key={shadow} value={shadow}>{SHADOW_LABELS[shadow]}</option>)}
            </select>
          </div>
          <div className="se-street-sign-builder__field se-street-sign-builder__field--wide">
            <label htmlFor="street-sign-treatment">Metal sign finish</label>
            <select id="street-sign-treatment" className="se-input" value={design.treatment} onChange={(event) => update({ treatment: event.target.value as StreetSignDesign['treatment'] })}>
              {STREET_SIGN_TREATMENTS.map((treatment) => <option key={treatment} value={treatment}>{TREATMENT_LABELS[treatment]}</option>)}
            </select>
            <small>Every finish keeps the sign as a metal street sign.</small>
          </div>
        </div>

        <div className="se-street-sign-builder__colors">
          <div>
            <span className="se-street-sign-builder__label">Sign color</span>
            <div className="se-street-sign-builder__swatches">
              {COLOR_PRESETS.map((preset) => (
                <button key={preset.label} type="button" className="se-street-sign-builder__swatch" title={preset.label} aria-label={preset.label} aria-pressed={design.backgroundColor === preset.background} style={{ background: preset.background }} onClick={() => update({ backgroundColor: preset.background, textColor: preset.text })} />
              ))}
            </div>
          </div>
          <div className="se-street-sign-builder__field">
            <label htmlFor="street-sign-text-color">Letter color</label>
            <input id="street-sign-text-color" className="se-input se-street-sign-builder__color" type="color" value={design.textColor} onChange={(event) => update({ textColor: event.target.value })} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Read-only shared rendering for public profiles and hover cards. */
export function StreetSignDisplay({ design, compact = false }: { design: StreetSignDesign | null | undefined; compact?: boolean }) {
  if (!design) return null;
  return (
    <div className={`se-street-sign-preview se-street-sign-display${compact ? ' se-street-sign-display--compact' : ''} se-street-sign-preview--${design.shape} se-street-sign-trim--${design.trim} se-street-sign-shadow--${design.shadow} se-street-sign-treatment--${design.treatment}`} role="img" aria-label={`${design.streetName} ${design.streetType} metal street sign`}>
      <div className="se-street-sign-preview__face" style={{ backgroundColor: design.backgroundColor, color: design.textColor }}>
        <span className="se-street-sign-preview__bolt se-street-sign-preview__bolt--left" aria-hidden="true" />
        <span className="se-street-sign-preview__bolt se-street-sign-preview__bolt--right" aria-hidden="true" />
        <div className="se-street-sign-preview__lettering">
          <span className={`se-street-sign-preview__name se-street-sign-font--${design.font}`}>{design.streetName}</span>
          <span className="se-street-sign-preview__street-type">{design.streetType}</span>
        </div>
        {design.tag ? <span className={`se-street-sign-preview__tag se-street-sign-preview__tag--${design.tagScale} se-street-sign-preview__tag--${design.tagPlacement} se-street-sign-font--${design.tagFont}`} style={{ color: design.tagColor }}>{design.tag}</span> : null}
      </div>
    </div>
  );
}
