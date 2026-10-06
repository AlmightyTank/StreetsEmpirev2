import { create } from 'zustand';

/**
 * Slice E: a page can show another player's site theme in place of the
 * viewer's own, so a visitor sees a public profile the way its owner set it.
 * Shell drops the viewer's theme from the app root while this is set (two
 * themes on one page would fight over the same panels) and shows this
 * theme's ambient decor; the page themes its own content area.
 */
interface PageThemeState {
  themeKey: string | null;
  setThemeKey: (themeKey: string | null) => void;
}

export const usePageTheme = create<PageThemeState>((set) => ({
  themeKey: null,
  setThemeKey: (themeKey) => set({ themeKey }),
}));
