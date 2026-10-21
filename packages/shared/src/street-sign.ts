import { z } from 'zod';

/** Saved street-sign design contract. Bump the version when the persisted shape changes. */
export const STREET_SIGN_VERSION = 2 as const;
export const STREET_SIGN_TEXT_MAX = 32;
export const STREET_SIGN_TAG_MAX = 18;

export const STREET_SIGN_SHAPES = ['classic', 'wide'] as const;
export const STREET_SIGN_FONTS = ['road-condensed', 'block', 'stencil', 'handstyle', 'rounded', 'sign-painter', 'graffiti-script', 'wildstyle'] as const;
export const STREET_SIGN_FREE_FONTS = ['road-condensed', 'block', 'stencil', 'handstyle', 'rounded'] as const;
export const STREET_SIGN_FONT_PACKS = [
  { key: 'street-sign-font-sign-painter', label: 'Sign Painter Pack', level: 10, description: 'Adds a classic hand-painted sign face for street text and tags.', fonts: ['sign-painter'], streetText: true, graffiti: true },
  { key: 'street-sign-graffiti-pack', label: 'Graffiti Pack', level: 20, description: 'Adds Graffiti Script and Wildstyle for your crew tag.', fonts: ['graffiti-script', 'wildstyle'], streetText: false, graffiti: true },
] as const;
export const STREET_SIGN_STREET_TYPES = ['DR', 'ST', 'AVE', 'BLVD', 'CT', 'WAY', 'LN', 'PL'] as const;
export const STREET_SIGN_TAG_SCALES = ['small', 'medium', 'large'] as const;
export const STREET_SIGN_TAG_PLACEMENTS = ['lower-left', 'lower-center', 'lower-right'] as const;
export const STREET_SIGN_TRIMS = ['single', 'double', 'beveled'] as const;
export const STREET_SIGN_SHADOWS = ['soft', 'strong', 'none'] as const;
export const STREET_SIGN_TREATMENTS = ['reflective', 'municipal', 'weathered'] as const;

const signText = (max: number, label: string) => z.string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ' '))
  .pipe(z.string().max(max, `${label} can be at most ${max} characters.`))
  .refine((value) => /^[\p{L}\p{N} .,'&!?-]*$/u.test(value), `${label} can use letters, numbers, spaces and simple punctuation.`);

const legacyStreetSignDesignSchema = z.object({
  version: z.literal(1),
  shape: z.enum(STREET_SIGN_SHAPES),
  streetName: signText(STREET_SIGN_TEXT_MAX, 'Street name').refine((value) => value.length > 0, 'Add street text before saving.'),
  streetType: z.enum(STREET_SIGN_STREET_TYPES),
  font: z.enum(STREET_SIGN_FONTS),
  tag: signText(STREET_SIGN_TAG_MAX, 'Graffiti tag'),
  tagFont: z.enum(STREET_SIGN_FONTS),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid sign color.'),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid lettering color.'),
  tagColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid graffiti color.'),
}).strict();

const streetSignBaseSchema = z.object({
  shape: z.enum(STREET_SIGN_SHAPES),
  streetName: signText(STREET_SIGN_TEXT_MAX, 'Street name').refine((value) => value.length > 0, 'Add street text before saving.'),
  streetType: z.enum(STREET_SIGN_STREET_TYPES),
  font: z.enum(STREET_SIGN_FONTS),
  tag: signText(STREET_SIGN_TAG_MAX, 'Graffiti tag'),
  tagFont: z.enum(STREET_SIGN_FONTS),
  tagScale: z.enum(STREET_SIGN_TAG_SCALES),
  tagPlacement: z.enum(STREET_SIGN_TAG_PLACEMENTS),
  trim: z.enum(STREET_SIGN_TRIMS),
  shadow: z.enum(STREET_SIGN_SHADOWS),
  treatment: z.enum(STREET_SIGN_TREATMENTS),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid sign color.'),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid lettering color.'),
  tagColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid graffiti color.'),
});

export const streetSignDesignSchema = streetSignBaseSchema.extend({ version: z.literal(STREET_SIGN_VERSION) }).strict();

export type StreetSignDesign = z.infer<typeof streetSignDesignSchema>;

export const DEFAULT_STREET_SIGN: StreetSignDesign = {
  version: STREET_SIGN_VERSION,
  shape: 'classic',
  streetName: '',
  streetType: 'DR',
  font: 'road-condensed',
  tag: '',
  tagFont: 'handstyle',
  tagScale: 'medium',
  tagPlacement: 'lower-right',
  trim: 'double',
  shadow: 'soft',
  treatment: 'reflective',
  backgroundColor: '#087b62',
  textColor: '#ffffff',
  tagColor: '#ffd34e',
};

function migrateLegacyStreetSign(value: z.infer<typeof legacyStreetSignDesignSchema>): StreetSignDesign {
  return {
    ...value,
    version: STREET_SIGN_VERSION,
    tagScale: 'medium',
    tagPlacement: 'lower-right',
    trim: 'double',
    shadow: 'soft',
    treatment: 'reflective',
  };
}

/** New clients write v2; old open tabs can still submit a valid v1 design. */
export const streetSignInputSchema = z.union([streetSignDesignSchema, legacyStreetSignDesignSchema])
  .transform((value) => value.version === 1 ? migrateLegacyStreetSign(value) : value);

/** JSON from older versions or manually edited rows is never trusted as a display DTO. */
export function readStreetSignDesign(value: unknown): StreetSignDesign | null {
  const parsed = streetSignInputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The sign face always carries the crew name; visual styling remains independently customizable. */
export function streetSignForCrewName(value: unknown, crewName: string | null | undefined): StreetSignDesign | null {
  const design = readStreetSignDesign(value);
  if (!design) return null;
  const linkedName = crewName?.trim();
  return linkedName ? { ...design, streetName: linkedName.slice(0, STREET_SIGN_TEXT_MAX) } : null;
}
