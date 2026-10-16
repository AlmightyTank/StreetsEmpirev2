/**
 * Theme precedence contract.
 *
 * 1. A page preview that takes the shell owns both shell chrome and decor.
 * 2. A content-only preview suppresses the viewer shell theme so the preview is
 *    not visually misrepresented, but may still render matching decor.
 * 3. Without a preview, the player's selected site theme owns both.
 * Route identity is deliberately absent: it may style artwork, never tokens.
 */
export function resolveThemePresentation({ selectedTheme, pageTheme, takeShell }: {
  selectedTheme: string | null;
  pageTheme: string | null;
  takeShell: boolean;
}) {
  if (pageTheme && takeShell) return { shellTheme: pageTheme, decorTheme: pageTheme, mode: 'takeover' as const };
  if (pageTheme) return { shellTheme: null, decorTheme: pageTheme, mode: 'content-preview' as const };
  return { shellTheme: selectedTheme, decorTheme: selectedTheme, mode: 'selected' as const };
}
