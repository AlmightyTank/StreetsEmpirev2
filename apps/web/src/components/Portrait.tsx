/**
 * Portraits for the people the player deals with: every contact who gives Jobs, every store's
 * trader, and Civic Handshake's payroll official. Drawn to match the hoe and thug item art, as
 * SVGs in `apps/web/public/portraits/`.
 */
const PORTRAITS: Readonly<Record<string, { file: string; name: string }>> = {
  MAMA_KING: { file: 'mama-king.svg', name: 'Mama King' },
  BLOCKS: { file: 'blocks.svg', name: 'Blocks' },
  TOMMY: { file: 'tommy.svg', name: 'Tommy' },
  PIP: { file: 'pip.svg', name: 'Pip' },
  WHEELS: { file: 'wheels.svg', name: 'Wheels' },
  VIC: { file: 'vic.svg', name: 'Vic' },
  ACE: { file: 'ace.svg', name: 'Ace' },
  LEDGER: { file: 'ledger.svg', name: 'Ledger' },
  CORNER: { file: 'corner.svg', name: 'The Corner clerk' },
  CHARLIE: { file: 'charlie.svg', name: 'Charlie' },
  CIVIC_HANDSHAKE: { file: 'civic-handshake.svg', name: 'A Civic Handshake official' },
};

export function hasPortrait(key: string | null | undefined): key is string {
  return !!key && key in PORTRAITS;
}

export function portraitUrl(key: string): string | null {
  const portrait = PORTRAITS[key];
  return portrait ? `/portraits/${portrait.file}` : null;
}

/** A round portrait of a contact, trader or faction face; nothing when there is no art for the key. */
export function Portrait({ who, size = 'md', label }: { who: string | null | undefined; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  if (!hasPortrait(who)) return null;
  const portrait = PORTRAITS[who]!;
  return (
    <span className={`se-portrait se-portrait--${size}`}>
      <img src={`/portraits/${portrait.file}`} alt={label ?? portrait.name} loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}
