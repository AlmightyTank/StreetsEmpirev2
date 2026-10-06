/**
 * Slice F: a small dot in a player's site-theme colours, shown next to their
 * name in rankings and the player directory. The theme class on the dot only
 * rescopes the theme's colour tokens for the dot itself; it never themes the row.
 */
export function ThemeSwatch({ theme, label }: { theme: string | null | undefined; label?: string | null }) {
  if (!theme) return null;
  const name = label ?? 'Site theme';
  return (
    <i
      className={`se-theme-swatch se-site-theme--${theme}`}
      role="img"
      aria-label={`Theme: ${name}`}
      title={name}
    />
  );
}
