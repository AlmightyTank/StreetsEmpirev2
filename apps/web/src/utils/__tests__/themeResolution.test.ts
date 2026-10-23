import { describe, expect, it } from 'vitest';
import { resolveThemePresentation } from '../themeResolution.js';
import { routeIdentity } from '../../layouts/Shell.js';

describe('resolveThemePresentation', () => {
  it('uses the selected theme when there is no page preview', () => {
    expect(resolveThemePresentation({ selectedTheme: 'federal-case', pageTheme: null, takeShell: false }))
      .toEqual({ shellTheme: 'federal-case', decorTheme: 'federal-case', mode: 'selected' });
  });

  it('keeps a content preview separate from shell chrome', () => {
    expect(resolveThemePresentation({ selectedTheme: 'federal-case', pageTheme: 'casino-floor', takeShell: false }))
      .toEqual({ shellTheme: null, decorTheme: 'casino-floor', mode: 'content-preview' });
  });

  it('lets an explicit takeover own shell chrome and decor', () => {
    expect(resolveThemePresentation({ selectedTheme: 'federal-case', pageTheme: 'midnight-market', takeShell: true }))
      .toEqual({ shellTheme: 'midnight-market', decorTheme: 'midnight-market', mode: 'takeover' });
  });
});

describe('routeIdentity', () => {
  it('classifies representative routes without leaking color into theme resolution', () => {
    expect(routeIdentity('/game/events')).toBe('events');
    expect(routeIdentity('/game/operations')).toBe('operations');
    expect(routeIdentity('/game/players/example')).toBe('profile');
    expect(routeIdentity('/game/admin/rounds')).toBe('admin');
  });
});
